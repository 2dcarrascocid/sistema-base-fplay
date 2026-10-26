import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import type { Actor } from '../lib/authenticate.js';
import type { Tx } from '../lib/db.js';
import type { Deps } from '../lib/deps.js';
import { badRequest } from '../lib/errors.js';
import { json, parse, type HttpResponse, type Request } from '../lib/http.js';

const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_TYPES = { 'image/png': 'png', 'image/svg+xml': 'svg', 'image/webp': 'webp' } as const;
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const SettingsBody = z
  .object({
    systemName: z.string().trim().min(1).max(100),
    primaryColor: color,
    secondaryColor: color,
    defaultLocale: z.enum(['es', 'en']),
    defaultTimeZone: z.string().max(64).refine(isValidTimeZone),
    selfRegistrationEnabled: z.boolean(),
  })
  .strict();
const LogoUploadBody = z.object({ contentType: z.enum(['image/png', 'image/svg+xml', 'image/webp']) });
const LogoBody = z.object({ key: z.string().max(200).nullable() });

const COLUMNS = [
  'system_name',
  'logo_key',
  'primary_color',
  'secondary_color',
  'default_locale',
  'default_time_zone',
  'self_registration_enabled',
  'updated_at',
] as const;

async function load(tx: Tx) {
  return tx.selectFrom('app.app_settings').select(COLUMNS).executeTakeFirstOrThrow();
}

export async function getSettings(deps: Deps, tx: Tx): Promise<HttpResponse> {
  const settings = await load(tx);
  return json({ settings, logoUrl: settings.logo_key ? await deps.storage.downloadUrl(settings.logo_key) : null });
}

export async function updateSettings(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(SettingsBody, request.body);
  const before = await load(tx);
  const changes = {
    system_name: body.systemName,
    primary_color: body.primaryColor.toUpperCase(),
    secondary_color: body.secondaryColor.toUpperCase(),
    default_locale: body.defaultLocale,
    default_time_zone: body.defaultTimeZone,
    self_registration_enabled: body.selfRegistrationEnabled,
  };
  await tx.updateTable('app.app_settings').set(changes).execute();
  const changed = Object.keys(changes).filter((key) => before[key as keyof typeof before] !== changes[key as keyof typeof changes]);
  if (changed.length > 0) {
    await audit(tx, originOf(request), {
      eventType: 'config.settings.update',
      result: 'success',
      actorUserId: actor.userId,
      entityType: 'app_settings',
      oldValue: Object.fromEntries(changed.map((key) => [key, before[key as keyof typeof before]])),
      newValue: Object.fromEntries(changed.map((key) => [key, changes[key as keyof typeof changes]])),
    });
  }
  return json({ settings: await load(tx) });
}

export async function logoUploadUrl(deps: Deps, request: Request): Promise<HttpResponse> {
  const { contentType } = parse(LogoUploadBody, request.body);
  const key = `branding/logo-${randomUUID()}.${LOGO_TYPES[contentType]}`;
  return json({ ...(await deps.storage.createUpload(key, contentType, LOGO_MAX_BYTES)), key, maxBytes: LOGO_MAX_BYTES });
}

export async function setLogo(deps: Deps, request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { key } = parse(LogoBody, request.body);
  if (key !== null) {
    if (!/^branding\/logo-[0-9a-f-]{36}\.(png|svg|webp)$/.test(key)) throw badRequest('INVALID_LOGO');
    const size = await deps.storage.objectSize(key);
    if (size === null || size > LOGO_MAX_BYTES) throw badRequest('INVALID_LOGO');
  }
  const before = await load(tx);
  await tx.updateTable('app.app_settings').set({ logo_key: key }).execute();
  await audit(tx, originOf(request), {
    eventType: 'config.settings.logo',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'app_settings',
    oldValue: { logo_key: before.logo_key },
    newValue: { logo_key: key },
  });
  return json({ logoUrl: key ? await deps.storage.downloadUrl(key) : null });
}
