import { sql } from 'kysely';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import type { Actor } from '../lib/authenticate.js';
import type { Tx } from '../lib/db.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { json, noContent, parse, type HttpResponse, type Request } from '../lib/http.js';

const IdParam = z.object({ id: z.guid() });
const i18n = z.object({ es: z.string().trim().min(1).max(100), en: z.string().trim().min(1).max(100) });
const code = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/).max(100);
const icon = z.string().regex(/^mdi-[a-z0-9-]+$/).max(64).nullable();
const route = z.string().regex(/^\/[a-z0-9/_-]*$/).max(200).nullable();

const CreateMenuBody = z.object({
  parentId: z.guid().nullable(),
  code,
  name: i18n,
  icon,
  route,
  showInMobile: z.boolean().default(false),
  superuserOnly: z.boolean().default(false),
  isActive: z.boolean().default(true),
  actionIds: z.array(z.number().int().positive()).max(30).default([]),
});
const UpdateMenuBody = z
  .object({ code, name: i18n, icon, route, showInMobile: z.boolean(), superuserOnly: z.boolean(), isActive: z.boolean() })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0);
const ActionsBody = z.object({ actionIds: z.array(z.number().int().positive()).max(30) });
const ReorderBody = z.object({ parentId: z.guid().nullable(), orderedIds: z.array(z.guid()).min(1).max(200) });
const CreateActionBody = z.object({ code: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50), name: i18n });
const UpdateActionBody = z.object({ name: i18n });
const ActionIdParam = z.object({ id: z.coerce.number().int().positive() });

const MENU_COLUMNS = [
  'id',
  'parent_id',
  'kind',
  'code',
  'name',
  'icon',
  'route',
  'sort_order',
  'show_in_mobile',
  'superuser_only',
  'is_system',
  'is_active',
] as const;

export async function listMenus(tx: Tx): Promise<HttpResponse> {
  const menus = await tx.selectFrom('app.menus').select(MENU_COLUMNS).orderBy('sort_order').orderBy('code').execute();
  const links = await tx.selectFrom('app.menu_actions').select(['menu_id', 'action_id']).execute();
  const actionsByMenu = new Map<string, number[]>();
  for (const link of links) actionsByMenu.set(link.menu_id, [...(actionsByMenu.get(link.menu_id) ?? []), link.action_id]);
  return json({ menus: menus.map((menu) => ({ ...menu, action_ids: (actionsByMenu.get(menu.id) ?? []).sort((a, b) => a - b) })) });
}

async function loadMenu(tx: Tx, id: string) {
  const menu = await tx.selectFrom('app.menus').select(MENU_COLUMNS).where('id', '=', id).executeTakeFirst();
  if (!menu) throw notFound();
  return menu;
}

const KIND_BELOW: Record<string, 'menu' | 'submenu' | null> = { module: 'menu', menu: 'submenu', submenu: null };

export async function createMenu(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(CreateMenuBody, request.body);
  let kind: 'module' | 'menu' | 'submenu' = 'module';
  if (body.parentId) {
    const parent = await loadMenu(tx, body.parentId);
    const below = KIND_BELOW[parent.kind];
    if (!below) throw badRequest('INVALID_HIERARCHY');
    kind = below;
  }
  if (kind === 'module' && body.route) throw badRequest('MODULE_WITHOUT_ROUTE');

  const { next } = await tx
    .selectFrom('app.menus')
    .select(sql<number>`coalesce(max(sort_order), 0) + 10`.as('next'))
    .where((eb) => (body.parentId ? eb('parent_id', '=', body.parentId) : eb('parent_id', 'is', null)))
    .executeTakeFirstOrThrow();
  const menu = await tx
    .insertInto('app.menus')
    .values({
      parent_id: body.parentId,
      kind,
      code: body.code,
      name: body.name,
      icon: body.icon,
      route: body.route,
      sort_order: Number(next),
      show_in_mobile: body.showInMobile,
      superuser_only: body.superuserOnly,
      is_system: false,
      is_active: body.isActive,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const actionIds = [...new Set(body.actionIds)];
  if (actionIds.length > 0) {
    await tx.insertInto('app.menu_actions').values(actionIds.map((actionId) => ({ menu_id: menu.id, action_id: actionId }))).execute();
  }
  await audit(tx, originOf(request), {
    eventType: 'config.menu.create',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'menu',
    entityId: menu.id,
    newValue: { ...body, kind },
  });
  return json({ id: menu.id }, 201);
}

export async function updateMenu(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const body = parse(UpdateMenuBody, request.body);
  const before = await loadMenu(tx, id);
  if (before.is_system && ((body.code !== undefined && body.code !== before.code) || body.isActive === false || body.superuserOnly !== undefined)) {
    throw new AppError(409, 'SYSTEM_MENU');
  }
  if (before.kind === 'module' && body.route) throw badRequest('MODULE_WITHOUT_ROUTE');

  const changes = {
    ...(body.code !== undefined && { code: body.code }),
    ...(body.name !== undefined && { name: body.name }),
    ...(body.icon !== undefined && { icon: body.icon }),
    ...(body.route !== undefined && { route: body.route }),
    ...(body.showInMobile !== undefined && { show_in_mobile: body.showInMobile }),
    ...(body.superuserOnly !== undefined && { superuser_only: body.superuserOnly }),
    ...(body.isActive !== undefined && { is_active: body.isActive }),
  };
  await tx.updateTable('app.menus').set(changes).where('id', '=', id).execute();
  await audit(tx, originOf(request), {
    eventType: 'config.menu.update',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'menu',
    entityId: id,
    oldValue: Object.fromEntries(Object.keys(changes).map((key) => [key, before[key as keyof typeof before]])),
    newValue: { ...body },
  });
  return json({ id });
}

/** Replaces the actions a menu offers. Removing one also removes it from every profile. */
export async function setMenuActions(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const target = new Set(parse(ActionsBody, request.body).actionIds);
  const menu = await loadMenu(tx, id);
  if (menu.is_system) throw new AppError(409, 'SYSTEM_MENU');

  const current = await tx.selectFrom('app.menu_actions').select(['id', 'action_id']).where('menu_id', '=', id).execute();
  const removed = current.filter((link) => !target.has(link.action_id));
  const added = [...target].filter((actionId) => !current.some((link) => link.action_id === actionId));

  if (removed.length > 0) {
    const ids = removed.map((link) => link.id);
    await tx.deleteFrom('app.profile_permissions').where('menu_action_id', 'in', ids).execute();
    await tx.deleteFrom('app.menu_actions').where('id', 'in', ids).execute();
  }
  if (added.length > 0) {
    await tx.insertInto('app.menu_actions').values(added.map((actionId) => ({ menu_id: id, action_id: actionId }))).execute();
  }
  if (added.length > 0 || removed.length > 0) {
    await audit(tx, originOf(request), {
      eventType: 'config.menu.actions',
      result: 'success',
      actorUserId: actor.userId,
      entityType: 'menu',
      entityId: id,
      newValue: { added, removed: removed.map((link) => link.action_id) },
    });
  }
  return noContent();
}

export async function reorderMenus(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(ReorderBody, request.body);
  const siblings = await tx
    .selectFrom('app.menus')
    .select('id')
    .where((eb) => (body.parentId ? eb('parent_id', '=', body.parentId) : eb('parent_id', 'is', null)))
    .execute();
  const ids = new Set(siblings.map((row) => row.id));
  if (ids.size !== body.orderedIds.length || !body.orderedIds.every((menuId) => ids.has(menuId))) {
    throw badRequest('INVALID_ORDER');
  }
  for (const [index, menuId] of body.orderedIds.entries()) {
    await tx.updateTable('app.menus').set({ sort_order: (index + 1) * 10 }).where('id', '=', menuId).execute();
  }
  await audit(tx, originOf(request), {
    eventType: 'config.menu.reorder',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'menu',
    entityId: body.parentId ?? 'root',
    newValue: { order: body.orderedIds },
  });
  return noContent();
}

export async function listActions(tx: Tx): Promise<HttpResponse> {
  const actions = await tx.selectFrom('app.actions').select(['id', 'code', 'name', 'is_standard', 'sort_order']).orderBy('sort_order').execute();
  return json({ actions });
}

export async function createAction(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(CreateActionBody, request.body);
  const { next } = await tx
    .selectFrom('app.actions')
    .select(sql<number>`coalesce(max(sort_order), 0) + 10`.as('next'))
    .executeTakeFirstOrThrow();
  const action = await tx
    .insertInto('app.actions')
    .values({ code: body.code, name: body.name, is_standard: false, sort_order: Number(next) })
    .returning('id')
    .executeTakeFirstOrThrow();
  await audit(tx, originOf(request), {
    eventType: 'config.action.create',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'action',
    entityId: String(action.id),
    newValue: body,
  });
  return json({ id: action.id }, 201);
}

export async function updateAction(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(ActionIdParam, request.pathParameters);
  const { name } = parse(UpdateActionBody, request.body);
  const before = await tx.selectFrom('app.actions').select('name').where('id', '=', id).executeTakeFirst();
  if (!before) throw notFound();
  await tx.updateTable('app.actions').set({ name: name }).where('id', '=', id).execute();
  await audit(tx, originOf(request), {
    eventType: 'config.action.update',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'action',
    entityId: String(id),
    oldValue: before,
    newValue: { name },
  });
  return json({ id });
}
