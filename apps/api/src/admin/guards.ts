import { sql, type RawBuilder } from 'kysely';
import type { Actor } from '../lib/authenticate.js';
import type { Tx } from '../lib/db.js';
import { AppError, forbidden, notFound } from '../lib/errors.js';

async function check(tx: Tx, expression: RawBuilder<boolean>): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean }>`select ${expression} as ok`.execute(tx);
  return rows[0]?.ok === true;
}

export const canManageUser = (tx: Tx, userId: string) => check(tx, sql<boolean>`app.can_manage_user(${userId})`);
export const canManageRole = (tx: Tx, roleId: number) => check(tx, sql<boolean>`app.can_manage_role(${roleId}::smallint)`);
export const canGrantProfile = (tx: Tx, profileId: string) => check(tx, sql<boolean>`app.can_grant_profile(${profileId})`);
export const canGrantMenuAction = (tx: Tx, id: string) => check(tx, sql<boolean>`app.can_grant_menu_action(${id})`);

/**
 * Loads a user the actor may manage: 404 if not visible, 403 if outside the actor's role hierarchy,
 * 403 SELF_CHANGE_FORBIDDEN for operations nobody may do on their own account.
 */
export async function loadManagedUser(tx: Tx, actor: Actor, userId: string, options: { notSelf?: boolean } = {}) {
  const user = await tx
    .selectFrom('app.users as u')
    .innerJoin('app.roles as r', 'r.id', 'u.role_id')
    .leftJoin('app.user_identities as i', (join) => join.onRef('i.user_id', '=', 'u.id').on('i.provider', '=', 'local'))
    .select([
      'u.id',
      'u.email',
      'u.first_name',
      'u.last_name',
      'u.second_last_name',
      'u.rut',
      'u.phone',
      'u.job_title',
      'u.status',
      'u.locale',
      'u.time_zone',
      'u.role_id',
      'r.code as role',
      'i.cognito_sub',
    ])
    .where('u.id', '=', userId)
    .executeTakeFirst();
  if (!user) throw notFound();
  if (options.notSelf && userId === actor.userId) throw forbidden('SELF_CHANGE_FORBIDDEN');
  if (!(await canManageUser(tx, userId))) throw forbidden();
  return user;
}

/** Native Cognito username of a managed user (every user has one; see Pre sign-up). */
export function cognitoUsername(user: { cognito_sub: string | null }): string {
  if (!user.cognito_sub) throw new AppError(409, 'MISSING_IDENTITY');
  return user.cognito_sub;
}
