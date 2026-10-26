import { normalizeRut, ROLES } from '@base/shared';
import { sql } from 'kysely';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import type { Actor } from '../lib/authenticate.js';
import { toCsv } from '../lib/csv.js';
import type { Tx } from '../lib/db.js';
import type { Deps } from '../lib/deps.js';
import { AppError, forbidden } from '../lib/errors.js';
import { json, noContent, parse, type HttpResponse, type Request } from '../lib/http.js';
import { createInvitation } from '../lib/invitations.js';
import { logger } from '../lib/logger.js';
import { CognitoError } from '../lib/ports.js';
import { canGrantProfile, canManageRole, cognitoUsername, loadManagedUser } from './guards.js';

const EXPORT_LIMIT = 10_000;

const name = z.string().trim().min(1).max(100);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const rut = z
  .string()
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizeRut(value);
    if (!normalized) ctx.addIssue({ code: 'custom', message: 'invalid_rut' });
    return normalized ?? '';
  });
const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const IdParam = z.object({ id: z.guid() });

const ListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['invited', 'active', 'inactive', 'locked']).optional(),
  role: z.enum(ROLES).optional(),
  profileId: z.guid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['name', 'email', 'created_at', 'last_login_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
type ListFilters = z.infer<typeof ListQuery>;

const CreateBody = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  firstName: name,
  lastName: name,
  secondLastName: name.nullable().optional(),
  rut: rut.nullable().optional(),
  phone: phone.nullable().optional(),
  jobTitle: optionalText(100),
  role: z.enum(ROLES),
  profileIds: z.array(z.guid()).max(50).default([]),
});

const UpdateBody = z
  .object({
    firstName: name,
    lastName: name,
    secondLastName: name.nullable(),
    rut: rut.nullable(),
    phone: phone.nullable(),
    jobTitle: z.string().trim().max(100).nullable(),
    role: z.enum(ROLES),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0);

const ProfilesBody = z.object({ profileIds: z.array(z.guid()).max(50) });

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function filteredUsers(tx: Tx, filters: ListFilters) {
  let query = tx.selectFrom('app.users as u').innerJoin('app.roles as r', 'r.id', 'u.role_id');
  if (filters.search) {
    const term = `%${escapeLike(filters.search)}%`;
    const rutTerm = `%${escapeLike(filters.search.replace(/[.\s]/g, '').toUpperCase())}%`;
    query = query.where((eb) =>
      eb.or([
        eb('u.email', 'ilike', term),
        eb('u.first_name', 'ilike', term),
        eb('u.last_name', 'ilike', term),
        eb('u.second_last_name', 'ilike', term),
        eb('u.rut', 'like', rutTerm),
      ]),
    );
  }
  if (filters.status === 'locked') query = query.where('u.locked_until', '>', new Date());
  else if (filters.status) query = query.where('u.status', '=', filters.status);
  if (filters.role) query = query.where('r.code', '=', filters.role);
  if (filters.profileId) {
    const profileId = filters.profileId;
    query = query.where((eb) =>
      eb.exists(
        eb.selectFrom('app.user_profiles as up').select('up.user_id').whereRef('up.user_id', '=', 'u.id').where('up.profile_id', '=', profileId),
      ),
    );
  }
  return query;
}

const LIST_COLUMNS = [
  'u.id',
  'u.email',
  'u.first_name',
  'u.last_name',
  'u.second_last_name',
  'u.rut',
  'u.status',
  'u.locked_until',
  'u.mfa_enabled',
  'u.last_login_at',
  'u.created_at',
  'r.code as role',
] as const;

function sorted<T extends ReturnType<typeof filteredUsers>>(query: T, filters: ListFilters): T {
  const direction = filters.order;
  if (filters.sort === 'name') return query.orderBy('u.last_name', direction).orderBy('u.first_name', direction) as T;
  if (filters.sort === 'email') return query.orderBy('u.email', direction) as T;
  return query.orderBy(`u.${filters.sort}`, direction).orderBy('u.id') as T;
}

export async function listUsers(request: Request, tx: Tx): Promise<HttpResponse> {
  const filters = parse(ListQuery, request.query);
  const { total } = await filteredUsers(tx, filters)
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  const items = await sorted(filteredUsers(tx, filters), filters)
    .select(LIST_COLUMNS)
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize)
    .execute();
  return json({ items, total: Number(total), page: filters.page, pageSize: filters.pageSize });
}

export async function exportUsers(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const filters = parse(ListQuery, request.query);
  const rows = await sorted(filteredUsers(tx, filters), filters).select(LIST_COLUMNS).limit(EXPORT_LIMIT).execute();
  await audit(tx, originOf(request), {
    eventType: 'user.export',
    result: 'success',
    actorUserId: actor.userId,
    newValue: { filters: { ...filters, page: undefined, pageSize: undefined }, rows: rows.length },
  });
  const csv = toCsv(
    ['email', 'nombre', 'apellido_paterno', 'apellido_materno', 'rut', 'rol', 'estado', 'bloqueado', 'mfa', 'ultimo_ingreso', 'creado'],
    rows.map((u) => [
      u.email,
      u.first_name,
      u.last_name,
      u.second_last_name,
      u.rut,
      u.role,
      u.status,
      u.locked_until && u.locked_until > new Date() ? 'si' : 'no',
      u.mfa_enabled ? 'si' : 'no',
      u.last_login_at,
      u.created_at,
    ]),
  );
  return {
    status: 200,
    text: csv,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="usuarios.csv"' },
  };
}

export async function getUser(request: Request, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const user = await tx
    .selectFrom('app.users as u')
    .innerJoin('app.roles as r', 'r.id', 'u.role_id')
    .select([...LIST_COLUMNS, 'u.phone', 'u.job_title', 'u.locale', 'u.time_zone', 'u.must_change_password', 'u.updated_at'])
    .where('u.id', '=', id)
    .executeTakeFirst();
  if (!user) throw new AppError(404, 'NOT_FOUND');

  const [profiles, identities, sessions, invitation, manageable] = await Promise.all([
    tx
      .selectFrom('app.user_profiles as up')
      .innerJoin('app.profiles as p', 'p.id', 'up.profile_id')
      .select(['p.id', 'p.name', 'p.is_active'])
      .where('up.user_id', '=', id)
      .orderBy('p.name')
      .execute(),
    tx.selectFrom('app.user_identities').select(['provider', 'linked_at', 'last_used_at']).where('user_id', '=', id).orderBy('provider').execute(),
    tx
      .selectFrom('app.user_sessions')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('user_id', '=', id)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirstOrThrow(),
    tx
      .selectFrom('app.invitations')
      .select(['expires_at', 'created_at'])
      .where('user_id', '=', id)
      .where('accepted_at', 'is', null)
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirst(),
    sql<{ ok: boolean }>`select app.can_manage_user(${id}) as ok`.execute(tx),
  ]);

  return json({
    user,
    profiles,
    identities,
    activeSessions: Number(sessions.count),
    pendingInvitation: invitation ?? null,
    canManage: manageable.rows[0]?.ok === true,
  });
}

export async function userPermissions(request: Request, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const { rows } = await sql<{ menu_code: string; action_code: string }>`
    select menu_code, action_code from app.user_effective_permissions(${id}) order by menu_code, action_code
  `.execute(tx);
  return json({ permissions: rows.map((row) => `${row.menu_code}:${row.action_code}`) });
}

async function roleIdFor(tx: Tx, code: string): Promise<number> {
  const role = await tx.selectFrom('app.roles').select('id').where('code', '=', code as 'client').executeTakeFirstOrThrow();
  return role.id;
}

async function assertGrantableProfiles(tx: Tx, profileIds: string[]): Promise<void> {
  const denied: string[] = [];
  for (const profileId of profileIds) {
    if (!(await canGrantProfile(tx, profileId))) denied.push(profileId);
  }
  if (denied.length > 0) throw new AppError(403, 'UNGRANTABLE_PERMISSIONS', undefined, { profiles: denied });
}

export async function createUser(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(CreateBody, request.body);
  const roleId = await roleIdFor(tx, body.role);
  if (!(await canManageRole(tx, roleId))) throw forbidden();
  const profileIds = [...new Set(body.profileIds)];
  await assertGrantableProfiles(tx, profileIds);
  const existing = await tx.selectFrom('app.users').select('id').where('email', '=', body.email).executeTakeFirst();
  if (existing) throw new AppError(409, 'EMAIL_TAKEN');

  let cognitoSub: string;
  try {
    cognitoSub = await deps.cognito.adminCreateUser(body.email, false);
  } catch (error) {
    if (error instanceof CognitoError && error.reason === 'username_exists') throw new AppError(409, 'EMAIL_TAKEN');
    throw error;
  }

  try {
    const user = await tx
      .insertInto('app.users')
      .values({
        email: body.email,
        first_name: body.firstName,
        last_name: body.lastName,
        second_last_name: body.secondLastName ?? null,
        rut: body.rut ?? null,
        phone: body.phone ?? null,
        job_title: body.jobTitle ?? null,
        role_id: roleId,
        status: 'invited',
        must_change_password: false,
      })
      .returning(['id', 'email', 'first_name', 'locale', 'time_zone'])
      .executeTakeFirstOrThrow();
    await tx.insertInto('app.user_identities').values({ user_id: user.id, provider: 'local', cognito_sub: cognitoSub, provider_subject: cognitoSub }).execute();
    if (profileIds.length > 0) {
      await tx.insertInto('app.user_profiles').values(profileIds.map((profileId) => ({ user_id: user.id, profile_id: profileId }))).execute();
    }
    const expiresAt = await createInvitation(deps, tx, user);
    await audit(tx, originOf(request), {
      eventType: 'user.create',
      result: 'success',
      actorUserId: actor.userId,
      entityType: 'user',
      entityId: user.id,
      newValue: { ...body, profileIds, invitationExpiresAt: expiresAt },
    });
    return json({ id: user.id }, 201);
  } catch (error) {
    await deps.cognito.adminDeleteUser(cognitoSub).catch((cleanup: unknown) => logger.error('create user cleanup failed', { cleanup }));
    throw error;
  }
}

export async function updateUser(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const body = parse(UpdateBody, request.body);
  const before = await loadManagedUser(tx, actor, id, { notSelf: body.role !== undefined });

  const changes: Record<string, unknown> = {
    ...(body.firstName !== undefined && { first_name: body.firstName }),
    ...(body.lastName !== undefined && { last_name: body.lastName }),
    ...(body.secondLastName !== undefined && { second_last_name: body.secondLastName }),
    ...(body.rut !== undefined && { rut: body.rut }),
    ...(body.phone !== undefined && { phone: body.phone }),
    ...(body.jobTitle !== undefined && { job_title: body.jobTitle }),
  };
  if (body.role !== undefined && body.role !== before.role) {
    const roleId = await roleIdFor(tx, body.role);
    if (!(await canManageRole(tx, roleId))) throw forbidden();
    changes['role_id'] = roleId;
  }
  if (Object.keys(changes).length === 0) return json({ id });

  // Raise the last-superuser rule now instead of at commit.
  await sql`set constraints app.users_ensure_active_superuser immediate`.execute(tx);
  await tx.updateTable('app.users').set(changes).where('id', '=', id).execute();
  const oldValue = Object.fromEntries(
    Object.keys(changes).map((key) => [key, key === 'role_id' ? before.role : before[key as keyof typeof before]]),
  );
  await audit(tx, originOf(request), {
    eventType: 'user.update',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: id,
    oldValue,
    newValue: { ...changes, ...(changes['role_id'] !== undefined && { role_id: body.role }) },
  });
  return json({ id });
}

export async function setUserProfiles(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const target = new Set(parse(ProfilesBody, request.body).profileIds);
  await loadManagedUser(tx, actor, id);
  const current = new Set(
    (await tx.selectFrom('app.user_profiles').select('profile_id').where('user_id', '=', id).execute()).map((row) => row.profile_id),
  );
  const added = [...target].filter((profileId) => !current.has(profileId));
  const removed = [...current].filter((profileId) => !target.has(profileId));
  await assertGrantableProfiles(tx, [...added, ...removed]);

  if (removed.length > 0) {
    await tx.deleteFrom('app.user_profiles').where('user_id', '=', id).where('profile_id', 'in', removed).execute();
  }
  if (added.length > 0) {
    await tx.insertInto('app.user_profiles').values(added.map((profileId) => ({ user_id: id, profile_id: profileId }))).execute();
  }
  if (added.length > 0 || removed.length > 0) {
    await audit(tx, originOf(request), {
      eventType: 'user.profiles.update',
      result: 'success',
      actorUserId: actor.userId,
      entityType: 'user',
      entityId: id,
      oldValue: { profileIds: [...current] },
      newValue: { added, removed },
    });
  }
  return noContent();
}

async function revokeAllSessions(tx: Tx, actor: Actor, userId: string, reason: 'admin' | 'deactivated'): Promise<number> {
  const revoked = await tx
    .updateTable('app.user_sessions')
    .set({ revoked_at: new Date(), revoked_by: actor.userId, revoked_reason: reason })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .returning('id')
    .execute();
  return revoked.length;
}

export async function setUserStatus(
  deps: Deps,
  request: Request,
  actor: Actor,
  tx: Tx,
  status: 'active' | 'inactive',
): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const user = await loadManagedUser(tx, actor, id, { notSelf: true });
  if (status === 'active' && user.status !== 'inactive') throw new AppError(409, 'INVALID_STATUS');
  if (status === 'inactive' && user.status === 'inactive') throw new AppError(409, 'INVALID_STATUS');

  await sql`set constraints app.users_ensure_active_superuser immediate`.execute(tx);
  await tx.updateTable('app.users').set({ status }).where('id', '=', id).execute();
  if (status === 'inactive') {
    await revokeAllSessions(tx, actor, id, 'deactivated');
    await deps.cognito.adminDisableUser(cognitoUsername(user));
    await deps.cognito.adminGlobalSignOut(cognitoUsername(user));
  } else {
    await deps.cognito.adminEnableUser(cognitoUsername(user));
  }
  await audit(tx, originOf(request), {
    eventType: status === 'active' ? 'user.activate' : 'user.deactivate',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: id,
    oldValue: { status: user.status },
    newValue: { status },
  });
  return noContent();
}

export async function unlockUser(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  await loadManagedUser(tx, actor, id, { notSelf: true });
  await tx.updateTable('app.users').set({ locked_until: null, failed_login_count: 0 }).where('id', '=', id).execute();
  await audit(tx, originOf(request), { eventType: 'user.unlock', result: 'success', actorUserId: actor.userId, entityType: 'user', entityId: id });
  return noContent();
}

export async function resetUserPassword(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const user = await loadManagedUser(tx, actor, id, { notSelf: true });
  if (user.status !== 'active') throw new AppError(409, 'INVALID_STATUS');
  const sessions = await revokeAllSessions(tx, actor, id, 'admin');
  await deps.cognito.adminResetUserPassword(cognitoUsername(user));
  await deps.cognito.adminGlobalSignOut(cognitoUsername(user));
  await audit(tx, originOf(request), {
    eventType: 'user.password.reset',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: id,
    newValue: { revokedSessions: sessions },
  });
  return noContent();
}

export async function revokeUserSessions(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const user = await loadManagedUser(tx, actor, id);
  const sessions = await revokeAllSessions(tx, actor, id, 'admin');
  if (user.cognito_sub) await deps.cognito.adminGlobalSignOut(user.cognito_sub);
  await audit(tx, originOf(request), {
    eventType: 'user.sessions.revoked',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: id,
    newValue: { revokedSessions: sessions },
  });
  return noContent();
}

export async function resendInvitation(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const user = await loadManagedUser(tx, actor, id);
  if (user.status !== 'invited') throw new AppError(409, 'INVALID_STATUS');
  await tx
    .updateTable('app.invitations')
    .set({ revoked_at: new Date() })
    .where('user_id', '=', id)
    .where('accepted_at', 'is', null)
    .where('revoked_at', 'is', null)
    .execute();
  const expiresAt = await createInvitation(deps, tx, user);
  await audit(tx, originOf(request), {
    eventType: 'user.invitation.sent',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: id,
    newValue: { expiresAt },
  });
  return json({ expiresAt });
}

export async function listRoles(tx: Tx): Promise<HttpResponse> {
  const roles = await tx
    .selectFrom('app.roles')
    .select(['id', 'code', 'name', 'mfa_required', sql<boolean>`app.can_manage_role(id)`.as('can_assign')])
    .orderBy('rank')
    .execute();
  return json({ roles });
}
