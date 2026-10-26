import { hasPermission } from '@base/shared';
import { sql } from 'kysely';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import type { Actor } from '../lib/authenticate.js';
import type { Tx } from '../lib/db.js';
import { AppError, forbidden, notFound } from '../lib/errors.js';
import { json, noContent, parse, type HttpResponse, type Request } from '../lib/http.js';
import { canGrantMenuAction, canGrantProfile } from './guards.js';

const IdParam = z.object({ id: z.guid() });
const profileName = z.string().trim().min(1).max(100);
const description = z.string().trim().max(500).nullable();
const menuActionIds = z.array(z.guid()).max(500);

const ListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const CreateBody = z.object({ name: profileName, description: description.optional(), menuActionIds: menuActionIds.default([]) });
const UpdateBody = z
  .object({ name: profileName, description })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0);
const PermissionsBody = z.object({ menuActionIds });
const DuplicateBody = z.object({ name: profileName });

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function listProfiles(request: Request, tx: Tx): Promise<HttpResponse> {
  const filters = parse(ListQuery, request.query);
  let query = tx.selectFrom('app.profiles as p');
  if (filters.search) {
    const term = `%${escapeLike(filters.search)}%`;
    query = query.where((eb) => eb.or([eb('p.name', 'ilike', term), eb('p.description', 'ilike', term)]));
  }
  if (filters.status) query = query.where('p.is_active', '=', filters.status === 'active');

  const { total } = await query.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow();
  const items = await query
    .select((eb) => [
      'p.id',
      'p.name',
      'p.description',
      'p.is_active',
      'p.updated_at',
      eb.selectFrom('app.user_profiles as up').select((sub) => sub.fn.countAll<string>().as('n')).whereRef('up.profile_id', '=', 'p.id').as('user_count'),
      eb
        .selectFrom('app.profile_permissions as pp')
        .select((sub) => sub.fn.countAll<string>().as('n'))
        .whereRef('pp.profile_id', '=', 'p.id')
        .as('permission_count'),
    ])
    .orderBy('p.name')
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize)
    .execute();

  return json({
    items: items.map((item) => ({ ...item, user_count: Number(item.user_count), permission_count: Number(item.permission_count) })),
    total: Number(total),
    page: filters.page,
    pageSize: filters.pageSize,
  });
}

async function loadProfile(tx: Tx, id: string) {
  const profile = await tx
    .selectFrom('app.profiles')
    .select(['id', 'name', 'description', 'is_active', 'created_at', 'updated_at'])
    .where('id', '=', id)
    .executeTakeFirst();
  if (!profile) throw notFound();
  return profile;
}

async function permissionIds(tx: Tx, profileId: string): Promise<string[]> {
  const rows = await tx.selectFrom('app.profile_permissions').select('menu_action_id').where('profile_id', '=', profileId).execute();
  return rows.map((row) => row.menu_action_id);
}

export async function getProfile(request: Request, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const profile = await loadProfile(tx, id);
  return json({ profile, menuActionIds: await permissionIds(tx, id), canEdit: await canGrantProfile(tx, id) });
}

export async function profileUsers(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  if (!hasPermission(actor.role, actor.permissions, 'security.users:view')) throw forbidden();
  const { id } = parse(IdParam, request.pathParameters);
  await loadProfile(tx, id);
  const users = await tx
    .selectFrom('app.user_profiles as up')
    .innerJoin('app.users as u', 'u.id', 'up.user_id')
    .innerJoin('app.roles as r', 'r.id', 'u.role_id')
    .select(['u.id', 'u.email', 'u.first_name', 'u.last_name', 'u.status', 'r.code as role', 'up.granted_at'])
    .where('up.profile_id', '=', id)
    .orderBy('u.last_name')
    .orderBy('u.first_name')
    .execute();
  return json({ users });
}

/** Permission keys for audit entries ("menu:action"). */
async function keysOf(tx: Tx, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .selectFrom('app.menu_actions as ma')
    .innerJoin('app.menus as m', 'm.id', 'ma.menu_id')
    .innerJoin('app.actions as a', 'a.id', 'ma.action_id')
    .select(['m.code as menu', 'a.code as action'])
    .where('ma.id', 'in', ids)
    .execute();
  return rows.map((row) => `${row.menu}:${row.action}`).sort();
}

async function assertGrantable(tx: Tx, ids: string[]): Promise<void> {
  const denied: string[] = [];
  for (const id of ids) if (!(await canGrantMenuAction(tx, id))) denied.push(id);
  if (denied.length > 0) throw new AppError(403, 'UNGRANTABLE_PERMISSIONS', undefined, { permissions: await keysOf(tx, denied) });
}

async function insertPermissions(tx: Tx, profileId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.insertInto('app.profile_permissions').values(ids.map((id) => ({ profile_id: profileId, menu_action_id: id }))).execute();
}

export async function createProfile(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(CreateBody, request.body);
  const ids = [...new Set(body.menuActionIds)];
  await assertGrantable(tx, ids);
  const profile = await tx
    .insertInto('app.profiles')
    .values({ name: body.name, description: body.description ?? null })
    .returning('id')
    .executeTakeFirstOrThrow();
  await insertPermissions(tx, profile.id, ids);
  await audit(tx, originOf(request), {
    eventType: 'profile.create',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'profile',
    entityId: profile.id,
    newValue: { name: body.name, description: body.description ?? null, permissions: await keysOf(tx, ids) },
  });
  return json({ id: profile.id }, 201);
}

async function assertEditable(tx: Tx, id: string) {
  const profile = await loadProfile(tx, id);
  if (!(await canGrantProfile(tx, id))) throw forbidden();
  return profile;
}

export async function updateProfile(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const body = parse(UpdateBody, request.body);
  const before = await assertEditable(tx, id);
  const changes = {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.description !== undefined && { description: body.description }),
  };
  await tx.updateTable('app.profiles').set(changes).where('id', '=', id).execute();
  await audit(tx, originOf(request), {
    eventType: 'profile.update',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'profile',
    entityId: id,
    oldValue: Object.fromEntries(Object.keys(changes).map((key) => [key, before[key as keyof typeof changes]])),
    newValue: changes,
  });
  return json({ id });
}

export async function setProfilePermissions(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const target = new Set(parse(PermissionsBody, request.body).menuActionIds);
  await assertEditable(tx, id);
  const current = new Set(await permissionIds(tx, id));
  const added = [...target].filter((permission) => !current.has(permission));
  const removed = [...current].filter((permission) => !target.has(permission));
  await assertGrantable(tx, added);

  if (removed.length > 0) {
    await tx.deleteFrom('app.profile_permissions').where('profile_id', '=', id).where('menu_action_id', 'in', removed).execute();
  }
  await insertPermissions(tx, id, added);
  if (added.length > 0 || removed.length > 0) {
    await audit(tx, originOf(request), {
      eventType: 'profile.permissions.update',
      result: 'success',
      actorUserId: actor.userId,
      entityType: 'profile',
      entityId: id,
      newValue: { added: await keysOf(tx, added), removed: await keysOf(tx, removed) },
    });
  }
  return noContent();
}

export async function duplicateProfile(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const { name } = parse(DuplicateBody, request.body);
  const source = await loadProfile(tx, id);
  const ids = await permissionIds(tx, id);
  await assertGrantable(tx, ids);
  const copy = await tx
    .insertInto('app.profiles')
    .values({ name, description: source.description })
    .returning('id')
    .executeTakeFirstOrThrow();
  await insertPermissions(tx, copy.id, ids);
  await audit(tx, originOf(request), {
    eventType: 'profile.duplicate',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'profile',
    entityId: copy.id,
    newValue: { from: id, name, permissions: await keysOf(tx, ids) },
  });
  return json({ id: copy.id }, 201);
}

export async function setProfileActive(request: Request, actor: Actor, tx: Tx, active: boolean): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const profile = await assertEditable(tx, id);
  if (profile.is_active === active) throw new AppError(409, 'INVALID_STATUS');
  await tx.updateTable('app.profiles').set({ is_active: active }).where('id', '=', id).execute();
  await audit(tx, originOf(request), {
    eventType: active ? 'profile.activate' : 'profile.deactivate',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'profile',
    entityId: id,
    oldValue: { is_active: profile.is_active },
    newValue: { is_active: active },
  });
  return noContent();
}

interface CatalogRow {
  menu_id: string;
  parent_id: string | null;
  kind: 'module' | 'menu' | 'submenu';
  code: string;
  name: { es: string; en: string };
  sort_order: number;
  menu_action_id: string | null;
  action_code: string | null;
  action_name: { es: string; en: string } | null;
  is_standard: boolean | null;
  action_order: number | null;
}

export interface CatalogNode {
  id: string;
  code: string;
  kind: CatalogRow['kind'];
  name: { es: string; en: string };
  actions: { menuActionId: string; code: string; name: { es: string; en: string }; grantable: boolean }[];
  children: CatalogNode[];
}

/**
 * Menus (excluding superuser-only ones) with the actions each one offers, for the permission
 * matrix. "grantable" tells the UI which boxes the actor may tick (the API enforces it anyway).
 */
export async function permissionCatalog(actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { rows } = await sql<CatalogRow>`
    select m.id as menu_id, m.parent_id, m.kind, m.code, m.name, m.sort_order,
           ma.id as menu_action_id, a.code as action_code, a.name as action_name, a.is_standard, a.sort_order as action_order
    from app.menus m
    join app.v_effective_menus e on e.id = m.id and not e.superuser_only
    left join app.menu_actions ma on ma.menu_id = m.id
    left join app.actions a on a.id = ma.action_id
    order by m.sort_order, m.code, a.sort_order
  `.execute(tx);

  const nodes = new Map<string, CatalogNode & { parentId: string | null; order: number }>();
  for (const row of rows) {
    let node = nodes.get(row.menu_id);
    if (!node) {
      node = { id: row.menu_id, code: row.code, kind: row.kind, name: row.name, actions: [], children: [], parentId: row.parent_id, order: row.sort_order };
      nodes.set(row.menu_id, node);
    }
    if (row.menu_action_id && row.action_code && row.action_name) {
      node.actions.push({
        menuActionId: row.menu_action_id,
        code: row.action_code,
        name: row.action_name,
        grantable: hasPermission(actor.role, actor.permissions, `${row.code}:${row.action_code}`),
      });
    }
  }
  const roots: CatalogNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else if (!node.parentId) roots.push(node);
  }

  const actions = await tx.selectFrom('app.actions').select(['code', 'name', 'is_standard', 'sort_order']).orderBy('sort_order').execute();
  const strip = ({ id, code, kind, name, actions: nodeActions, children }: CatalogNode): CatalogNode => ({
    id,
    code,
    kind,
    name,
    actions: nodeActions,
    children: children.map(strip),
  });
  return json({ actions, menus: roots.map(strip) });
}
