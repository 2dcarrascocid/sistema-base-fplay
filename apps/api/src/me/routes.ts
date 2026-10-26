import { PASSWORD_MAX_LENGTH } from '@base/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { otpauthUri } from '../auth/login.js';
import { audit, originOf } from '../lib/audit.js';
import { authed, type Actor } from '../lib/authenticate.js';
import type { Tx } from '../lib/db.js';
import type { Deps } from '../lib/deps.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { json, noContent, parse, type HttpResponse, type Request, type Route } from '../lib/http.js';
import { CognitoError } from '../lib/ports.js';
import { assertAcceptablePassword } from '../lib/security.js';
import { buildMenuTree } from './menu.js';

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const name = z.string().trim().min(1).max(100);
const UpdateMeBody = z
  .object({
    firstName: name,
    lastName: name,
    secondLastName: name.nullable(),
    phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable(),
    locale: z.enum(['es', 'en']).nullable(),
    timeZone: z.string().max(64).refine(isValidTimeZone).nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0);

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
const CodeBody = z.object({ code: z.string().regex(/^\d{6}$/) });
const SessionParam = z.object({ id: z.uuid() });
const UploadBody = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) });
const PhotoBody = z.object({ key: z.string().max(200) });

const PROFILE_COLUMNS = [
  'id',
  'email',
  'first_name',
  'last_name',
  'second_last_name',
  'rut',
  'phone',
  'job_title',
  'photo_key',
  'locale',
  'time_zone',
  'mfa_enabled',
  'must_change_password',
  'last_login_at',
] as const;

async function loadProfile(tx: Tx, userId: string) {
  return tx.selectFrom('app.users').select(PROFILE_COLUMNS).where('id', '=', userId).executeTakeFirstOrThrow();
}

async function getMe(deps: Deps, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const user = await loadProfile(tx, actor.userId);
  const settings = await tx
    .selectFrom('app.app_settings')
    .select(['system_name', 'logo_key', 'primary_color', 'secondary_color', 'default_locale', 'default_time_zone'])
    .executeTakeFirstOrThrow();
  const menus = await tx
    .selectFrom('app.menus as m')
    .innerJoin('app.v_effective_menus as e', 'e.id', 'm.id')
    .select(['m.id', 'm.parent_id', 'm.kind', 'm.code', 'm.name', 'm.icon', 'm.route', 'm.sort_order', 'm.show_in_mobile'])
    .execute();
  const { photo_key, ...profile } = user;

  return json({
    user: { ...profile, photoUrl: photo_key ? await deps.storage.downloadUrl(photo_key) : null },
    role: actor.role,
    permissions: [...actor.permissions].sort(),
    menu: buildMenuTree(menus, actor.role, actor.permissions, actor.clientType),
    settings,
  });
}

async function updateMe(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(UpdateMeBody, request.body);
  const before = await loadProfile(tx, actor.userId);
  const changes = {
    ...(body.firstName !== undefined && { first_name: body.firstName }),
    ...(body.lastName !== undefined && { last_name: body.lastName }),
    ...(body.secondLastName !== undefined && { second_last_name: body.secondLastName }),
    ...(body.phone !== undefined && { phone: body.phone }),
    ...(body.locale !== undefined && { locale: body.locale }),
    ...(body.timeZone !== undefined && { time_zone: body.timeZone }),
  };
  await tx.updateTable('app.users').set(changes).where('id', '=', actor.userId).execute();
  const oldValue = Object.fromEntries(Object.keys(changes).map((key) => [key, before[key as keyof typeof before]]));
  await audit(tx, originOf(request), {
    eventType: 'account.update',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: actor.userId,
    oldValue,
    newValue: changes,
  });
  return json({ user: await loadProfile(tx, actor.userId) });
}

async function changePassword(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(ChangePasswordBody, request.body);
  const { email } = await loadProfile(tx, actor.userId);
  await assertAcceptablePassword(tx, deps.breached, body.newPassword, email);
  try {
    await deps.cognito.changePassword(actor.accessToken, body.currentPassword, body.newPassword);
  } catch (error) {
    if (error instanceof CognitoError && error.reason === 'invalid_password') {
      throw badRequest('PASSWORD_POLICY', ['rejected_by_identity_provider']);
    }
    if (error instanceof CognitoError && error.reason === 'not_authorized') throw badRequest('INVALID_CURRENT_PASSWORD');
    throw error;
  }
  const now = new Date();
  await tx.updateTable('app.users').set({ must_change_password: false, password_changed_at: now }).where('id', '=', actor.userId).execute();
  await tx
    .updateTable('app.user_sessions')
    .set({ revoked_at: now, revoked_by: actor.userId, revoked_reason: 'password_change' })
    .where('user_id', '=', actor.userId)
    .where('id', '<>', actor.sessionId)
    .where('revoked_at', 'is', null)
    .execute();
  await audit(tx, originOf(request), {
    eventType: 'account.password.changed',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: actor.userId,
  });
  return noContent();
}

async function listSessions(actor: Actor, tx: Tx): Promise<HttpResponse> {
  const sessions = await tx
    .selectFrom('app.user_sessions')
    .select(['id', 'client_type', 'ip', 'user_agent', 'created_at', 'last_seen_at', 'expires_at'])
    .where('user_id', '=', actor.userId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', new Date())
    .orderBy('last_seen_at', 'desc')
    .execute();
  return json({ sessions: sessions.map((session) => ({ ...session, current: session.id === actor.sessionId })) });
}

async function revokeSessions(request: Request, actor: Actor, tx: Tx, which: { id: string } | 'others'): Promise<HttpResponse> {
  let query = tx
    .updateTable('app.user_sessions')
    .set({ revoked_at: new Date(), revoked_by: actor.userId, revoked_reason: 'logout' })
    .where('user_id', '=', actor.userId)
    .where('revoked_at', 'is', null);
  query = which === 'others' ? query.where('id', '<>', actor.sessionId) : query.where('id', '=', which.id);
  const revoked = await query.returning('id').execute();
  if (which !== 'others' && revoked.length === 0) throw notFound();
  await audit(tx, originOf(request), {
    eventType: 'account.sessions.revoked',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: actor.userId,
    newValue: { sessions: revoked.map((row) => row.id) },
  });
  return noContent();
}

async function setupMfa(deps: Deps, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { email } = await loadProfile(tx, actor.userId);
  const secretCode = await deps.cognito.associateSoftwareToken(actor.accessToken);
  return json({ secretCode, otpauthUri: await otpauthUri({ db: tx }, email, secretCode) });
}

async function verifyMfa(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { code } = parse(CodeBody, request.body);
  if (!(await deps.cognito.verifySoftwareToken(actor.accessToken, code))) throw badRequest('INVALID_CODE');
  await deps.cognito.setTotpPreference(actor.accessToken, true);
  await tx.updateTable('app.users').set({ mfa_enabled: true }).where('id', '=', actor.userId).execute();
  await audit(tx, originOf(request), {
    eventType: 'account.mfa.enabled',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: actor.userId,
  });
  return noContent();
}

async function disableMfa(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const role = await tx
    .selectFrom('app.users as u')
    .innerJoin('app.roles as r', 'r.id', 'u.role_id')
    .select('r.mfa_required')
    .where('u.id', '=', actor.userId)
    .executeTakeFirstOrThrow();
  if (role.mfa_required) throw forbidden('MFA_REQUIRED_BY_ROLE');
  await deps.cognito.setTotpPreference(actor.accessToken, false);
  await tx.updateTable('app.users').set({ mfa_enabled: false }).where('id', '=', actor.userId).execute();
  await audit(tx, originOf(request), {
    eventType: 'account.mfa.disabled',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: actor.userId,
  });
  return noContent();
}

async function photoUploadUrl(deps: Deps, request: Request, actor: Actor): Promise<HttpResponse> {
  const { contentType } = parse(UploadBody, request.body);
  const key = `users/${actor.userId}/${randomUUID()}.${PHOTO_TYPES[contentType]}`;
  const upload = await deps.storage.createUpload(key, contentType, PHOTO_MAX_BYTES);
  return json({ ...upload, key, maxBytes: PHOTO_MAX_BYTES });
}

async function setPhoto(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { key } = parse(PhotoBody, request.body);
  const pattern = new RegExp(`^users/${actor.userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);
  if (!pattern.test(key)) throw badRequest('INVALID_PHOTO');
  const size = await deps.storage.objectSize(key);
  if (size === null || size > PHOTO_MAX_BYTES) throw badRequest('INVALID_PHOTO');
  const before = await loadProfile(tx, actor.userId);
  await tx.updateTable('app.users').set({ photo_key: key }).where('id', '=', actor.userId).execute();
  await audit(tx, originOf(request), {
    eventType: 'account.photo.updated',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'user',
    entityId: actor.userId,
    oldValue: { photo_key: before.photo_key },
    newValue: { photo_key: key },
  });
  return json({ photoUrl: await deps.storage.downloadUrl(key) });
}

/** "Mi cuenta" endpoints for web and mobile (database role: app_api). */
export function meRoutes(deps: Deps): Record<string, Route> {
  const pending = { allowPending: true };
  return {
    'GET /me': authed(deps, (_request, actor, tx) => getMe(deps, actor, tx), pending),
    'PATCH /me': authed(deps, (request, actor, tx) => updateMe(request, actor, tx)),
    'POST /me/password': authed(deps, (request, actor, tx) => changePassword(deps, request, actor, tx), pending),
    'GET /me/sessions': authed(deps, (_request, actor, tx) => listSessions(actor, tx)),
    'DELETE /me/sessions/{id}': authed(deps, (request, actor, tx) =>
      revokeSessions(request, actor, tx, parse(SessionParam, request.pathParameters)),
    ),
    'POST /me/sessions/revoke-others': authed(deps, (request, actor, tx) => revokeSessions(request, actor, tx, 'others')),
    'POST /me/mfa/setup': authed(deps, (_request, actor, tx) => setupMfa(deps, actor, tx), pending),
    'POST /me/mfa/verify': authed(deps, (request, actor, tx) => verifyMfa(deps, request, actor, tx), pending),
    'DELETE /me/mfa': authed(deps, (request, actor, tx) => disableMfa(deps, request, actor, tx)),
    'POST /me/photo/upload-url': authed(deps, (request, actor) => photoUploadUrl(deps, request, actor)),
    'PUT /me/photo': authed(deps, (request, actor, tx) => setPhoto(deps, request, actor, tx)),
  };
}
