import { PASSWORD_MAX_LENGTH } from '@base/shared';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import { open } from '../lib/crypto.js';
import type { Deps } from '../lib/deps.js';
import { badRequest, invalidCredentials, tooManyRequests } from '../lib/errors.js';
import { json, parse, type HttpResponse, type Request } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { CognitoError, type AuthResult } from '../lib/ports.js';
import { assertAcceptablePassword, enforceRateLimit, requireCaptcha } from '../lib/security.js';
import {
  CHALLENGE_PURPOSE,
  challengeOutcome,
  completeLogin,
  outcomeResponse,
  type ChallengeState,
  type LoginOutcome,
  type PendingLoginState,
} from './session.js';

const email = z.email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const totp = z.string().regex(/^\d{6}$/);

const LoginBody = z.object({ email, password, captchaToken: z.string().min(1).max(2048) });

const ChallengeBody = z.object({
  session: z.string().min(1).max(8192),
  challenge: z.enum(['SOFTWARE_TOKEN_MFA', 'NEW_PASSWORD_REQUIRED', 'MFA_SETUP', 'PASSWORD_CHANGE']),
  code: totp.optional(),
  newPassword: password.optional(),
});

const MfaSetupBody = z.object({ session: z.string().min(1).max(8192) });

async function fromAuthResult(deps: Deps, request: Request, result: AuthResult, email: string): Promise<LoginOutcome> {
  if (result.kind === 'tokens') return completeLogin(deps, request, result.tokens, 'password');
  if (result.name === 'SOFTWARE_TOKEN_MFA' || result.name === 'NEW_PASSWORD_REQUIRED') {
    return challengeOutcome(deps, {
      type: 'cognito',
      challenge: result.name,
      cognitoSession: result.session,
      username: result.username,
      email,
    });
  }
  logger.error('unexpected Cognito challenge', { challengeName: result.name });
  throw invalidCredentials();
}

/** Maps Cognito auth failures to generic client errors (no user enumeration). */
function authFailure(error: unknown): never {
  if (error instanceof CognitoError) {
    if (error.reason === 'too_many_requests') throw tooManyRequests();
    if (error.reason === 'code_mismatch' || error.reason === 'expired_code') throw badRequest('INVALID_CODE');
    if (error.reason === 'invalid_password') throw badRequest('PASSWORD_POLICY', ['rejected_by_identity_provider']);
    throw invalidCredentials();
  }
  throw error;
}

/** POST /auth/login */
export async function login(deps: Deps, request: Request): Promise<HttpResponse> {
  const body = parse(LoginBody, request.body);
  await requireCaptcha(deps.captcha, body.captchaToken, request.ip);
  await enforceRateLimit(deps.db, `login:ip:${request.ip}`, 300, 20);
  await enforceRateLimit(deps.db, `login:email:${body.email}`, 900, 10);

  let result: AuthResult;
  try {
    result = await deps.cognito.initiatePasswordAuth(body.email, body.password);
  } catch (error) {
    await audit(deps.db, originOf(request), {
      eventType: 'auth.login.failure',
      result: 'failure',
      actorEmail: body.email,
      newValue: { reason: error instanceof CognitoError ? error.reason : 'unknown' },
    });
    authFailure(error);
  }
  return outcomeResponse(await fromAuthResult(deps, request, result, body.email));
}

async function markPasswordChanged(deps: Deps, userId: string): Promise<void> {
  await deps.db
    .updateTable('app.users')
    .set({ must_change_password: false, password_changed_at: new Date() })
    .where('id', '=', userId)
    .execute();
}

async function answerPending(deps: Deps, request: Request, state: PendingLoginState, body: z.infer<typeof ChallengeBody>) {
  if (state.challenge === 'MFA_SETUP') {
    if (!body.code) throw badRequest('VALIDATION_ERROR', [{ path: 'code', code: 'required' }]);
    if (!(await deps.cognito.verifySoftwareToken(state.tokens.accessToken, body.code))) throw badRequest('INVALID_CODE');
    await deps.cognito.setTotpPreference(state.tokens.accessToken, true);
    await deps.db.updateTable('app.users').set({ mfa_enabled: true }).where('id', '=', state.userId).execute();
    await audit(deps.db, originOf(request), {
      eventType: 'auth.mfa.enabled',
      result: 'success',
      actorUserId: state.userId,
      entityType: 'user',
      entityId: state.userId,
    });
  } else {
    if (!body.newPassword) throw badRequest('VALIDATION_ERROR', [{ path: 'newPassword', code: 'required' }]);
    await assertAcceptablePassword(deps.db, deps.breached, body.newPassword, state.email);
    await deps.cognito.adminSetPassword(state.username, body.newPassword).catch(authFailure);
    await markPasswordChanged(deps, state.userId);
    await audit(deps.db, originOf(request), {
      eventType: 'auth.password.changed',
      result: 'success',
      actorUserId: state.userId,
      entityType: 'user',
      entityId: state.userId,
      newValue: { reason: 'required_change' },
    });
  }
  return completeLogin(deps, request, state.tokens, state.method);
}

/** POST /auth/challenge */
export async function challenge(deps: Deps, request: Request): Promise<HttpResponse> {
  const body = parse(ChallengeBody, request.body);
  await enforceRateLimit(deps.db, `challenge:ip:${request.ip}`, 300, 30);
  const state = open<ChallengeState>(deps.encryptionKey, CHALLENGE_PURPOSE, body.session);
  if (!state || state.challenge !== body.challenge) throw badRequest('INVALID_SESSION');

  if (state.type === 'pending') return outcomeResponse(await answerPending(deps, request, state, body));

  let responses: Record<string, string>;
  if (state.challenge === 'SOFTWARE_TOKEN_MFA') {
    if (!body.code) throw badRequest('VALIDATION_ERROR', [{ path: 'code', code: 'required' }]);
    responses = { SOFTWARE_TOKEN_MFA_CODE: body.code };
  } else {
    if (!body.newPassword) throw badRequest('VALIDATION_ERROR', [{ path: 'newPassword', code: 'required' }]);
    await assertAcceptablePassword(deps.db, deps.breached, body.newPassword, state.email);
    responses = { NEW_PASSWORD: body.newPassword };
  }

  let result: AuthResult;
  try {
    result = await deps.cognito.respondToChallenge(state.challenge, state.cognitoSession, state.username, responses);
  } catch (error) {
    await audit(deps.db, originOf(request), {
      eventType: 'auth.login.failure',
      result: 'failure',
      actorEmail: state.email,
      newValue: { challenge: state.challenge },
    });
    authFailure(error);
  }
  return outcomeResponse(await fromAuthResult(deps, request, result, state.email));
}

/** POST /auth/mfa/setup — TOTP secret for a login that must enrol MFA before getting a session. */
export async function mfaSetup(deps: Deps, request: Request): Promise<HttpResponse> {
  const body = parse(MfaSetupBody, request.body);
  const state = open<ChallengeState>(deps.encryptionKey, CHALLENGE_PURPOSE, body.session);
  if (!state || state.type !== 'pending' || state.challenge !== 'MFA_SETUP') throw badRequest('INVALID_SESSION');
  const secretCode = await deps.cognito.associateSoftwareToken(state.tokens.accessToken);
  return json({ secretCode, otpauthUri: await otpauthUri(deps, state.email, secretCode) });
}

export async function otpauthUri(deps: Pick<Deps, 'db'>, accountEmail: string, secret: string): Promise<string> {
  const { system_name } = await deps.db.selectFrom('app.app_settings').select('system_name').executeTakeFirstOrThrow();
  const issuer = encodeURIComponent(system_name);
  return `otpauth://totp/${issuer}:${encodeURIComponent(accountEmail)}?secret=${secret}&issuer=${issuer}`;
}
