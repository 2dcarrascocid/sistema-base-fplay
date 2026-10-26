import type { PostAuthenticationTriggerEvent, PreAuthenticationTriggerEvent } from 'aws-lambda';
import { sql } from 'kysely';
import { audit, NO_ORIGIN } from '../lib/audit.js';
import { formatDateFor, sendTemplatedEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';
import type { TriggerDeps } from './pre-sign-up.js';

async function findUserBySub(deps: TriggerDeps, sub: string) {
  return deps.db
    .selectFrom('app.user_identities as i')
    .innerJoin('app.users as u', 'u.id', 'i.user_id')
    .innerJoin('app.roles as r', 'r.id', 'u.role_id')
    .select(['u.id', 'u.email', 'u.first_name', 'u.locale', 'u.time_zone', 'u.status', 'u.locked_until', 'r.code as role'])
    .where('i.provider', '=', 'local')
    .where('i.cognito_sub', '=', sub)
    .executeTakeFirst();
}

const clientTypeOf = (deps: TriggerDeps, clientId: string) =>
  clientId === deps.config.cognito.mobileClientId ? 'mobile' : 'web';

/**
 * Pre authentication (every password sign-in, web API or mobile hosted UI): rejects unknown,
 * inactive or locked users and non-client roles on mobile, and counts the attempt; the account
 * locks once max_failed_attempts attempts went without a successful sign-in.
 */
export async function preAuthentication(
  deps: TriggerDeps,
  event: PreAuthenticationTriggerEvent,
): Promise<PreAuthenticationTriggerEvent> {
  const user = await findUserBySub(deps, event.request.userAttributes['sub'] ?? '');
  if (!user) throw new Error('NOT_REGISTERED');
  if (user.status !== 'active') throw new Error('ACCOUNT_DISABLED');
  if (clientTypeOf(deps, event.callerContext.clientId) === 'mobile' && user.role !== 'client') {
    throw new Error('ROLE_NOT_ALLOWED');
  }

  const { rows } = await sql<{ outcome: 'allowed' | 'locked' | 'just_locked' }>`
    select app.register_login_attempt(${user.id}) as outcome
  `.execute(deps.db);
  const outcome = rows[0]!.outcome;
  if (outcome === 'allowed') return event;

  if (outcome === 'just_locked') {
    const { locked_until } = await deps.db
      .selectFrom('app.users')
      .select('locked_until')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    await audit(deps.db, NO_ORIGIN, {
      eventType: 'auth.locked',
      result: 'success',
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'user',
      entityId: user.id,
      newValue: { locked_until },
    });
    try {
      await sendTemplatedEmail(deps.db, deps.mailer, 'account_locked', user, {
        locked_until: await formatDateFor(deps.db, user, locked_until!),
      });
    } catch (error) {
      logger.error('account locked email failed', { userId: user.id, error });
    }
  }
  throw new Error('ACCOUNT_LOCKED');
}

/** Post authentication: resets the attempt counter and records the successful sign-in. */
export async function postAuthentication(
  deps: TriggerDeps,
  event: PostAuthenticationTriggerEvent,
): Promise<PostAuthenticationTriggerEvent> {
  const user = await findUserBySub(deps, event.request.userAttributes['sub'] ?? '');
  if (!user) throw new Error('NOT_REGISTERED');
  await sql`select app.register_login_success(${user.id})`.execute(deps.db);
  await audit(deps.db, NO_ORIGIN, {
    eventType: 'auth.login.success',
    result: 'success',
    actorUserId: user.id,
    actorEmail: user.email,
    entityType: 'user',
    entityId: user.id,
    newValue: { method: 'password', client: clientTypeOf(deps, event.callerContext.clientId) },
  });
  return event;
}
