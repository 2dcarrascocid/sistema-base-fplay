import { PASSWORD_MAX_LENGTH } from '@base/shared';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import { sha256 } from '../lib/crypto.js';
import type { Deps } from '../lib/deps.js';
import { badRequest, notFound } from '../lib/errors.js';
import { createInvitation } from '../lib/invitations.js';
import { json, noContent, parse, type HttpResponse, type Request } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { assertAcceptablePassword, enforceRateLimit, requireCaptcha } from '../lib/security.js';

const captchaToken = z.string().min(1).max(2048);
const name = z.string().trim().min(1).max(100);

const AcceptBody = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  captchaToken,
});

const RegisterBody = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  firstName: name,
  lastName: name,
  secondLastName: name.optional(),
  captchaToken,
});

/** POST /auth/invitations/accept — the invited user chooses a password and the account becomes active. */
export async function accept(deps: Deps, request: Request): Promise<HttpResponse> {
  const body = parse(AcceptBody, request.body);
  await requireCaptcha(deps.captcha, body.captchaToken, request.ip);
  await enforceRateLimit(deps.db, `invitation:ip:${request.ip}`, 900, 10);

  const invitation = await deps.db
    .selectFrom('app.invitations as inv')
    .innerJoin('app.users as u', 'u.id', 'inv.user_id')
    .innerJoin('app.user_identities as i', (join) => join.onRef('i.user_id', '=', 'u.id').on('i.provider', '=', 'local'))
    .select(['inv.id', 'inv.expires_at', 'inv.accepted_at', 'inv.revoked_at', 'u.id as user_id', 'u.email', 'u.status', 'i.cognito_sub'])
    .where('inv.token_hash', '=', sha256(body.token))
    .executeTakeFirst();

  const usable =
    invitation &&
    !invitation.accepted_at &&
    !invitation.revoked_at &&
    invitation.expires_at > new Date() &&
    invitation.status === 'invited';
  if (!usable) throw badRequest('INVITATION_INVALID');

  await assertAcceptablePassword(deps.db, deps.breached, body.password, invitation.email);
  await deps.cognito.adminSetPassword(invitation.cognito_sub, body.password);
  await deps.cognito.adminMarkEmailVerified(invitation.cognito_sub);

  await deps.db.transaction().execute(async (tx) => {
    const now = new Date();
    await tx.updateTable('app.invitations').set({ accepted_at: now }).where('id', '=', invitation.id).execute();
    await tx
      .updateTable('app.users')
      .set({ status: 'active', must_change_password: false, password_changed_at: now })
      .where('id', '=', invitation.user_id)
      .execute();
    await audit(tx, originOf(request), {
      eventType: 'auth.invitation.accepted',
      result: 'success',
      actorUserId: invitation.user_id,
      actorEmail: invitation.email,
      entityType: 'user',
      entityId: invitation.user_id,
    });
  });
  return noContent();
}

/**
 * POST /auth/register — only when self registration is enabled. Creates an invited client and
 * emails the activation link. Always answers 202, so it cannot be used to discover accounts.
 */
export async function register(deps: Deps, request: Request): Promise<HttpResponse> {
  const settings = await deps.db.selectFrom('app.app_settings').select('self_registration_enabled').executeTakeFirstOrThrow();
  if (!settings.self_registration_enabled) throw notFound();

  const body = parse(RegisterBody, request.body);
  await requireCaptcha(deps.captcha, body.captchaToken, request.ip);
  await enforceRateLimit(deps.db, `register:ip:${request.ip}`, 3600, 5);

  const existing = await deps.db.selectFrom('app.users').select('id').where('email', '=', body.email).executeTakeFirst();
  if (existing) return json({ status: 'accepted' }, 202);

  const cognitoSub = await deps.cognito.adminCreateUser(body.email, false);
  try {
    await deps.db.transaction().execute(async (tx) => {
      const user = await tx
        .insertInto('app.users')
        .values({
          email: body.email,
          first_name: body.firstName,
          last_name: body.lastName,
          second_last_name: body.secondLastName ?? null,
          role_id: 3,
          status: 'invited',
          must_change_password: false,
        })
        .returning(['id', 'email', 'first_name', 'locale', 'time_zone'])
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('app.user_identities')
        .values({ user_id: user.id, provider: 'local', cognito_sub: cognitoSub, provider_subject: cognitoSub })
        .execute();
      await createInvitation(deps, tx, user);
      await audit(tx, originOf(request), {
        eventType: 'auth.register',
        result: 'success',
        actorUserId: user.id,
        actorEmail: user.email,
        entityType: 'user',
        entityId: user.id,
      });
    });
  } catch (error) {
    await deps.cognito.adminDeleteUser(cognitoSub).catch((cleanup: unknown) => logger.error('register cleanup failed', { cleanup }));
    throw error;
  }
  return json({ status: 'accepted' }, 202);
}
