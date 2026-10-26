import { PASSWORD_MAX_LENGTH } from '@base/shared';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import type { Deps } from '../lib/deps.js';
import { badRequest, tooManyRequests } from '../lib/errors.js';
import { json, noContent, parse, type HttpResponse, type Request } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { CognitoError } from '../lib/ports.js';
import { assertAcceptablePassword, enforceRateLimit, requireCaptcha } from '../lib/security.js';

const email = z.email().max(254).transform((value) => value.toLowerCase());
const captchaToken = z.string().min(1).max(2048);

const ForgotBody = z.object({ email, captchaToken });
const ResetBody = z.object({
  email,
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  captchaToken,
});

/** POST /auth/password/forgot — always 202 so the response never reveals whether the email exists. */
export async function forgot(deps: Deps, request: Request): Promise<HttpResponse> {
  const body = parse(ForgotBody, request.body);
  await requireCaptcha(deps.captcha, body.captchaToken, request.ip);
  await enforceRateLimit(deps.db, `forgot:ip:${request.ip}`, 900, 10);
  await enforceRateLimit(deps.db, `forgot:email:${body.email}`, 900, 3);

  const user = await deps.db
    .selectFrom('app.users')
    .select(['id', 'status'])
    .where('email', '=', body.email)
    .executeTakeFirst();

  if (user?.status === 'active') {
    try {
      await deps.cognito.forgotPassword(body.email);
    } catch (error) {
      if (error instanceof CognitoError && error.reason === 'too_many_requests') throw tooManyRequests();
      logger.warn('forgot password not sent', { requestId: request.requestId, error });
    }
  }
  await audit(deps.db, originOf(request), {
    eventType: 'auth.password.forgot',
    result: user?.status === 'active' ? 'success' : 'failure',
    actorUserId: user?.id ?? null,
    actorEmail: body.email,
  });
  return json({ status: 'accepted' }, 202);
}

/** POST /auth/password/reset — confirms the emailed code; all sessions are closed afterwards. */
export async function reset(deps: Deps, request: Request): Promise<HttpResponse> {
  const body = parse(ResetBody, request.body);
  await requireCaptcha(deps.captcha, body.captchaToken, request.ip);
  await enforceRateLimit(deps.db, `reset:ip:${request.ip}`, 900, 10);
  await enforceRateLimit(deps.db, `reset:email:${body.email}`, 900, 5);
  await assertAcceptablePassword(deps.db, deps.breached, body.newPassword, body.email);

  const user = await deps.db
    .selectFrom('app.users as u')
    .innerJoin('app.user_identities as i', (join) => join.onRef('i.user_id', '=', 'u.id').on('i.provider', '=', 'local'))
    .select(['u.id', 'i.cognito_sub'])
    .where('u.email', '=', body.email)
    .where('u.status', '=', 'active')
    .executeTakeFirst();

  try {
    if (!user) throw new CognitoError('code_mismatch');
    await deps.cognito.confirmForgotPassword(body.email, body.code, body.newPassword);
  } catch (error) {
    await audit(deps.db, originOf(request), {
      eventType: 'auth.password.reset',
      result: 'failure',
      actorUserId: user?.id ?? null,
      actorEmail: body.email,
    });
    if (error instanceof CognitoError && error.reason === 'invalid_password') {
      throw badRequest('PASSWORD_POLICY', ['rejected_by_identity_provider']);
    }
    if (error instanceof CognitoError && error.reason === 'too_many_requests') throw tooManyRequests();
    throw badRequest('INVALID_CODE');
  }

  await deps.db.transaction().execute(async (tx) => {
    await tx
      .updateTable('app.users')
      .set({ must_change_password: false, password_changed_at: new Date() })
      .where('id', '=', user.id)
      .execute();
    await tx
      .updateTable('app.user_sessions')
      .set({ revoked_at: new Date(), revoked_reason: 'password_change' })
      .where('user_id', '=', user.id)
      .where('revoked_at', 'is', null)
      .execute();
    await audit(tx, originOf(request), {
      eventType: 'auth.password.reset',
      result: 'success',
      actorUserId: user.id,
      actorEmail: body.email,
      entityType: 'user',
      entityId: user.id,
    });
  });
  await deps.cognito.adminGlobalSignOut(user.cognito_sub).catch((error: unknown) => logger.warn('global sign out failed', { error }));
  return noContent();
}
