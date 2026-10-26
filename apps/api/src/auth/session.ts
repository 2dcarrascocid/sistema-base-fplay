import { sql } from 'kysely';
import { audit, originOf } from '../lib/audit.js';
import { clearCookie, COOKIE_PATHS, COOKIES, serializeCookie } from '../lib/cookies.js';
import { randomToken, seal, sha256 } from '../lib/crypto.js';
import type { Deps } from '../lib/deps.js';
import { AppError, invalidCredentials } from '../lib/errors.js';
import { json, noContent, type HttpResponse, type Request } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import type { CognitoTokens } from '../lib/ports.js';
import { assertCsrf, loadSecurityPolicy } from '../lib/security.js';

export type LoginMethod = 'password' | 'google' | 'facebook' | 'apple';

export const CHALLENGE_PURPOSE = 'login-challenge';
export const CHALLENGE_TTL_SECONDS = 300;

/** Challenges answered by Cognito. */
export interface CognitoChallengeState {
  type: 'cognito';
  challenge: 'SOFTWARE_TOKEN_MFA' | 'NEW_PASSWORD_REQUIRED';
  cognitoSession: string;
  username: string;
  email: string;
}

/** Password verified, but our policy requires a step before a session is issued. */
export interface PendingLoginState {
  type: 'pending';
  challenge: 'MFA_SETUP' | 'PASSWORD_CHANGE';
  tokens: CognitoTokens;
  userId: string;
  username: string;
  email: string;
  method: LoginMethod;
}

export type ChallengeState = CognitoChallengeState | PendingLoginState;

export type LoginOutcome =
  | { status: 'authenticated'; accessToken: string; expiresIn: number; cookies: string[] }
  | { status: 'challenge'; challenge: ChallengeState['challenge']; session: string };

export function challengeOutcome(deps: Pick<Deps, 'encryptionKey'>, state: ChallengeState): LoginOutcome {
  return {
    status: 'challenge',
    challenge: state.challenge,
    session: seal(deps.encryptionKey, CHALLENGE_PURPOSE, state, CHALLENGE_TTL_SECONDS),
  };
}

export function outcomeResponse(outcome: LoginOutcome): HttpResponse {
  if (outcome.status === 'challenge') return json(outcome);
  return json({ status: 'authenticated', accessToken: outcome.accessToken, expiresIn: outcome.expiresIn }, 200, outcome.cookies);
}

export function sessionCookies(refreshToken: string, maxAgeSeconds: number): string[] {
  return [
    serializeCookie(COOKIES.refresh, refreshToken, {
      path: COOKIE_PATHS.refresh,
      httpOnly: true,
      sameSite: 'Strict',
      maxAge: maxAgeSeconds,
    }),
    serializeCookie(COOKIES.csrf, randomToken(), {
      path: COOKIE_PATHS.csrf,
      httpOnly: false,
      sameSite: 'Strict',
      maxAge: maxAgeSeconds,
    }),
  ];
}

export function clearSessionCookies(): string[] {
  return [
    clearCookie(COOKIES.refresh, { path: COOKIE_PATHS.refresh, httpOnly: true, sameSite: 'Strict' }),
    clearCookie(COOKIES.csrf, { path: COOKIE_PATHS.csrf, httpOnly: false, sameSite: 'Strict' }),
  ];
}

async function revokeQuietly(deps: Pick<Deps, 'cognito'>, refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await deps.cognito.revokeToken(refreshToken).catch((error: unknown) => logger.warn('revoke token failed', { error }));
}

/**
 * Turns Cognito tokens into a web session once our own rules pass: user known, active and
 * unlocked; MFA set up when the role requires it; no pending password change.
 * Federated logins are refused for roles that require MFA (Cognito cannot apply TOTP to them).
 */
export async function completeLogin(
  deps: Deps,
  request: Request,
  tokens: CognitoTokens,
  method: LoginMethod,
): Promise<LoginOutcome> {
  const claims = await deps.verifier.verifyAccess(tokens.accessToken);
  const reject = async (code: string): Promise<never> => {
    await revokeQuietly(deps, tokens.refreshToken);
    throw method === 'password' ? invalidCredentials() : new AppError(403, code);
  };
  if (claims.clientId !== deps.config.cognito.webClientId) return reject('LOGIN_FAILED');

  const user = await deps.db
    .selectFrom('app.user_identities as i')
    .innerJoin('app.users as u', 'u.id', 'i.user_id')
    .innerJoin('app.roles as r', 'r.id', 'u.role_id')
    .select([
      'u.id',
      'u.email',
      'u.status',
      'u.locked_until',
      'u.must_change_password',
      'u.password_changed_at',
      'u.mfa_enabled',
      'r.mfa_required',
    ])
    .where('i.provider', '=', 'local')
    .where('i.cognito_sub', '=', claims.sub)
    .executeTakeFirst();

  if (!user) return reject('NOT_REGISTERED');
  if (user.status !== 'active' || (user.locked_until && user.locked_until > new Date())) return reject('ACCOUNT_DISABLED');
  if (method !== 'password' && user.mfa_required) return reject('MFA_REQUIRED_USE_PASSWORD');

  const policy = await loadSecurityPolicy(deps.db);
  const pending = { tokens, userId: user.id, username: claims.sub, email: user.email, method };
  if (user.mfa_required && !user.mfa_enabled) {
    return challengeOutcome(deps, { type: 'pending', challenge: 'MFA_SETUP', ...pending });
  }
  const expired =
    policy.password_max_age_days > 0 &&
    user.password_changed_at !== null &&
    user.password_changed_at.getTime() < Date.now() - policy.password_max_age_days * 86_400_000;
  if (method === 'password' && (user.must_change_password || expired)) {
    return challengeOutcome(deps, { type: 'pending', challenge: 'PASSWORD_CHANGE', ...pending });
  }

  if (!tokens.refreshToken) throw new AppError(500, 'MISSING_REFRESH_TOKEN');
  const maxAgeSeconds = policy.session_max_hours * 3600;
  await deps.db
    .insertInto('app.user_sessions')
    .values({
      user_id: user.id,
      client_type: 'web',
      origin_jti: claims.originJti,
      refresh_token_hash: sha256(tokens.refreshToken),
      ip: request.ip,
      user_agent: request.userAgent || null,
      expires_at: new Date(Date.now() + maxAgeSeconds * 1000),
    })
    .execute();

  if (method !== 'password') {
    // Password logins are recorded by the Post authentication trigger; federated ones here.
    await sql`select app.register_login_success(${user.id})`.execute(deps.db);
    await audit(deps.db, originOf(request), {
      eventType: 'auth.login.federated',
      result: 'success',
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'user',
      entityId: user.id,
      newValue: { provider: method },
    });
  }

  return {
    status: 'authenticated',
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
    cookies: sessionCookies(tokens.refreshToken, maxAgeSeconds),
  };
}

interface SessionRow {
  id: string;
  user_id: string;
  revoked_at: Date | null;
  expires_at: Date;
  last_seen_at: Date;
  cognito_sub: string;
  status: string;
  locked_until: Date | null;
}

async function findSessionByRefreshToken(deps: Deps, refreshToken: string): Promise<SessionRow | undefined> {
  return deps.db
    .selectFrom('app.user_sessions as s')
    .innerJoin('app.users as u', 'u.id', 's.user_id')
    .innerJoin('app.user_identities as i', (join) =>
      join.onRef('i.user_id', '=', 's.user_id').on('i.provider', '=', 'local'),
    )
    .select(['s.id', 's.user_id', 's.revoked_at', 's.expires_at', 's.last_seen_at', 'i.cognito_sub', 'u.status', 'u.locked_until'])
    .where('s.refresh_token_hash', '=', sha256(refreshToken))
    .where('s.client_type', '=', 'web')
    .executeTakeFirst();
}

async function revokeSession(deps: Deps, sessionId: string, reason: 'logout' | 'idle' | 'expired' | 'locked'): Promise<void> {
  await deps.db
    .updateTable('app.user_sessions')
    .set({ revoked_at: new Date(), revoked_reason: reason })
    .where('id', '=', sessionId)
    .where('revoked_at', 'is', null)
    .execute();
}

/** POST /auth/refresh — new access token from the HttpOnly refresh cookie. */
export async function refresh(deps: Deps, request: Request): Promise<HttpResponse> {
  assertCsrf(request, deps.config.webUrl);
  const refreshToken = request.cookies[COOKIES.refresh];
  const fail = (): HttpResponse => ({ status: 401, body: { error: { code: 'SESSION_INVALID', requestId: request.requestId } }, cookies: clearSessionCookies() });
  if (!refreshToken) return fail();

  const session = await findSessionByRefreshToken(deps, refreshToken);
  if (!session || session.revoked_at) return fail();

  const policy = await loadSecurityPolicy(deps.db);
  const now = Date.now();
  if (session.expires_at.getTime() <= now) {
    await revokeSession(deps, session.id, 'expired');
    return fail();
  }
  if (session.last_seen_at.getTime() < now - policy.idle_timeout_minutes * 60_000) {
    await revokeSession(deps, session.id, 'idle');
    return fail();
  }
  if (session.status !== 'active' || (session.locked_until && session.locked_until.getTime() > now)) {
    await revokeSession(deps, session.id, 'locked');
    return fail();
  }

  let tokens: CognitoTokens;
  try {
    tokens = await deps.cognito.refresh(refreshToken, session.cognito_sub);
  } catch {
    await revokeSession(deps, session.id, 'expired');
    return fail();
  }

  await deps.db.updateTable('app.user_sessions').set({ last_seen_at: new Date() }).where('id', '=', session.id).execute();
  return json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
}

/** POST /auth/logout — revokes the refresh token in Cognito and the session here. */
export async function logout(deps: Deps, request: Request): Promise<HttpResponse> {
  assertCsrf(request, deps.config.webUrl);
  const refreshToken = request.cookies[COOKIES.refresh];
  if (refreshToken) {
    const session = await findSessionByRefreshToken(deps, refreshToken);
    await revokeQuietly(deps, refreshToken);
    if (session) {
      await revokeSession(deps, session.id, 'logout');
      await audit(deps.db, originOf(request), {
        eventType: 'auth.logout',
        result: 'success',
        actorUserId: session.user_id,
        entityType: 'session',
        entityId: session.id,
      });
    }
  }
  return noContent(clearSessionCookies());
}
