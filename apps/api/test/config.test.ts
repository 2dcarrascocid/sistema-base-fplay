import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configRoutes } from '../src/config/routes.js';
import { sanitizeTemplateHtml } from '../src/config/templates.js';
import { apiDb, auditEvents, caller, createSession, createUser, makeDeps, ownerDb, type TestUser } from './helpers.js';

const deps = makeDeps(apiDb);
const routes = configRoutes(deps);
const call = caller(routes);
const AUDITOR_PROFILE = '20000000-0000-0000-0000-000000000002';
const USER_MANAGEMENT = '20000000-0000-0000-0000-000000000001';

let superuser: TestUser;
let superToken: string;
let auditorToken: string;
let adminToken: string;

const settingsBody = {
  systemName: 'Portal Interno',
  primaryColor: '#0F6B57',
  secondaryColor: '#333333',
  defaultLocale: 'es',
  defaultTimeZone: 'America/Santiago',
  selfRegistrationEnabled: false,
};
const policyBody = {
  passwordMinLength: 14,
  passwordRequireUpper: true,
  passwordRequireLower: true,
  passwordRequireDigit: true,
  passwordRequireSymbol: false,
  passwordMaxAgeDays: 90,
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  idleTimeoutMinutes: 15,
  sessionMaxHours: 12,
  invitationTtlHours: 72,
  clientMfaRequired: false,
};

beforeAll(async () => {
  superuser = await createUser({ role: 'superuser', mfaEnabled: true });
  superToken = (await createSession(superuser)).accessToken;
  auditorToken = (await createSession(await createUser({ role: 'admin', mfaEnabled: true, profiles: [AUDITOR_PROFILE] }))).accessToken;
  adminToken = (await createSession(await createUser({ role: 'admin', mfaEnabled: true, profiles: [USER_MANAGEMENT, AUDITOR_PROFILE] }))).accessToken;
});

afterAll(async () => {
  await ownerDb
    .updateTable('app.app_settings')
    .set({ system_name: 'Sistema Base', primary_color: '#1565C0', secondary_color: '#424242', default_locale: 'es', default_time_zone: 'America/Santiago', logo_key: null })
    .execute();
  await ownerDb.updateTable('app.security_policy').set({ password_min_length: 12, password_require_symbol: true, password_max_age_days: 0 }).execute();
});

describe('authorization', () => {
  it('configuration is superuser-only: an administrator with every assignable profile gets 403', async () => {
    const id = randomUUID();
    for (const key of Object.keys(routes).filter((k) => k.includes('/config/'))) {
      const [method, resource] = key.split(' ') as [string, string];
      const response = await call(method, resource, { token: adminToken, pathParameters: { id }, body: {} });
      expect(response.status, key).toBe(403);
    }
  });

  it('the audit screen needs security.audit permissions, not the superuser role', async () => {
    const client = (await createSession(await createUser())).accessToken;
    expect((await call('GET', '/audit/events', { token: client })).status).toBe(403);
    expect((await call('GET', '/audit/events', { token: auditorToken })).status).toBe(200);
  });
});

describe('general settings', () => {
  it('updates and audits only what changed', async () => {
    const response = await call('PUT', '/config/settings', { token: superToken, body: settingsBody });
    expect(response.body.settings).toMatchObject({ system_name: 'Portal Interno', primary_color: '#0F6B57' });
    const entry = await ownerDb
      .selectFrom('app.audit_log')
      .select(['old_value', 'new_value'])
      .where('event_type', '=', 'config.settings.update')
      .where('actor_user_id', '=', superuser.id)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(entry.new_value).toEqual({ system_name: 'Portal Interno', primary_color: '#0F6B57', secondary_color: '#333333' });
  });

  it('validates colors and time zones', async () => {
    expect((await call('PUT', '/config/settings', { token: superToken, body: { ...settingsBody, primaryColor: 'red' } })).status).toBe(400);
    expect((await call('PUT', '/config/settings', { token: superToken, body: { ...settingsBody, defaultTimeZone: 'Mars/Base' } })).status).toBe(400);
  });

  it('uploads a logo under branding/ and serves it signed', async () => {
    const upload = await call('POST', '/config/settings/logo/upload-url', { token: superToken, body: { contentType: 'image/png' } });
    expect(upload.body.key).toMatch(/^branding\/logo-[0-9a-f-]{36}\.png$/);
    expect((await call('PUT', '/config/settings/logo', { token: superToken, body: { key: upload.body.key } })).body.error.code).toBe('INVALID_LOGO');
    deps.storage.objects.set(upload.body.key, 2000);
    const saved = await call('PUT', '/config/settings/logo', { token: superToken, body: { key: upload.body.key } });
    expect(saved.body.logoUrl).toContain(upload.body.key);
    expect((await call('GET', '/config/settings', { token: superToken })).body.logoUrl).toContain(upload.body.key);
    expect((await call('PUT', '/config/settings/logo', { token: superToken, body: { key: 'users/x.png' } })).status).toBe(400);
    expect((await call('PUT', '/config/settings/logo', { token: superToken, body: { key: null } })).body.logoUrl).toBeNull();
  });
});

describe('menus and actions', () => {
  it('lists the tree with each menu actions', async () => {
    const response = await call('GET', '/config/menus', { token: superToken });
    const users = response.body.menus.find((m: { code: string }) => m.code === 'security.users');
    expect(users).toMatchObject({ kind: 'menu', is_system: true });
    expect(users.action_ids).toContain(1);
  });

  it('creates a module with a menu below it, derives the level and assigns actions', async () => {
    const suffix = randomUUID().slice(0, 8);
    const module = await call('POST', '/config/menus', {
      token: superToken,
      body: { parentId: null, code: `ventas_${suffix}`, name: { es: 'Ventas', en: 'Sales' }, icon: 'mdi-cart', route: null },
    });
    expect(module.status).toBe(201);
    const menu = await call('POST', '/config/menus', {
      token: superToken,
      body: { parentId: module.body.id, code: `ventas_${suffix}.pedidos`, name: { es: 'Pedidos', en: 'Orders' }, icon: null, route: '/ventas/pedidos', actionIds: [1, 2] },
    });
    const row = await ownerDb.selectFrom('app.menus').select(['kind', 'sort_order']).where('id', '=', menu.body.id).executeTakeFirstOrThrow();
    expect(row.kind).toBe('menu');
    const actions = await ownerDb.selectFrom('app.menu_actions').select('action_id').where('menu_id', '=', menu.body.id).orderBy('action_id').execute();
    expect(actions.map((a) => a.action_id)).toEqual([1, 2]);
    const entry = await ownerDb
      .selectFrom('app.audit_log')
      .select('new_value')
      .where('event_type', '=', 'config.menu.create')
      .where('entity_id', '=', menu.body.id)
      .executeTakeFirstOrThrow();
    expect(entry.new_value).toMatchObject({ code: `ventas_${suffix}.pedidos`, kind: 'menu' });
  });

  it('enforces the hierarchy and module rules', async () => {
    const submenuParent = await ownerDb.selectFrom('app.menus').select('id').where('kind', '=', 'menu').executeTakeFirstOrThrow();
    const sub = await call('POST', '/config/menus', {
      token: superToken,
      body: { parentId: submenuParent.id, code: `x_${randomUUID().slice(0, 8)}`, name: { es: 'Sub', en: 'Sub' }, icon: null, route: '/x' },
    });
    expect(sub.status).toBe(201);
    const tooDeep = await call('POST', '/config/menus', {
      token: superToken,
      body: { parentId: sub.body.id, code: `y_${randomUUID().slice(0, 8)}`, name: { es: 'Y', en: 'Y' }, icon: null, route: '/y' },
    });
    expect(tooDeep.body.error.code).toBe('INVALID_HIERARCHY');
    const moduleWithRoute = await call('POST', '/config/menus', {
      token: superToken,
      body: { parentId: null, code: `z_${randomUUID().slice(0, 8)}`, name: { es: 'Z', en: 'Z' }, icon: null, route: '/z' },
    });
    expect(moduleWithRoute.body.error.code).toBe('MODULE_WITHOUT_ROUTE');
  });

  it('protects system menus but lets their name, icon and order change', async () => {
    const users = await ownerDb.selectFrom('app.menus').select('id').where('code', '=', 'security.users').executeTakeFirstOrThrow();
    const patch = (body: object) => call('PATCH', '/config/menus/{id}', { token: superToken, pathParameters: { id: users.id }, body });
    expect((await patch({ code: 'security.people' })).body.error.code).toBe('SYSTEM_MENU');
    expect((await patch({ isActive: false })).body.error.code).toBe('SYSTEM_MENU');
    expect((await call('PUT', '/config/menus/{id}/actions', { token: superToken, pathParameters: { id: users.id }, body: { actionIds: [1] } })).status).toBe(409);
    expect((await patch({ name: { es: 'Personas', en: 'People' } })).status).toBe(200);
    await patch({ name: { es: 'Usuarios', en: 'Users' } });
  });

  it('removing an action from a menu removes it from profiles too', async () => {
    const created = await call('POST', '/config/menus', {
      token: superToken,
      body: { parentId: null, code: `m_${randomUUID().slice(0, 8)}`, name: { es: 'M', en: 'M' }, icon: null, route: null, actionIds: [1, 3] },
    });
    const id = created.body.id;
    const view = await ownerDb.selectFrom('app.menu_actions').select('id').where('menu_id', '=', id).where('action_id', '=', 1).executeTakeFirstOrThrow();
    const profile = await ownerDb.insertInto('app.profiles').values({ name: `p-${randomUUID()}` }).returning('id').executeTakeFirstOrThrow();
    await ownerDb.insertInto('app.profile_permissions').values({ profile_id: profile.id, menu_action_id: view.id }).execute();

    expect((await call('PUT', '/config/menus/{id}/actions', { token: superToken, pathParameters: { id }, body: { actionIds: [3, 2] } })).status).toBe(204);
    const left = await ownerDb.selectFrom('app.profile_permissions').select('menu_action_id').where('profile_id', '=', profile.id).execute();
    expect(left).toEqual([]);
  });

  it('reorders siblings and rejects partial orders', async () => {
    const modules = await ownerDb.selectFrom('app.menus').select('id').where('parent_id', 'is', null).orderBy('sort_order').execute();
    const reversed = modules.map((m) => m.id).reverse();
    expect((await call('POST', '/config/menus/reorder', { token: superToken, body: { parentId: null, orderedIds: reversed } })).status).toBe(204);
    const after = await ownerDb.selectFrom('app.menus').select('id').where('parent_id', 'is', null).orderBy('sort_order').execute();
    expect(after.map((m) => m.id)).toEqual(reversed);
    expect((await call('POST', '/config/menus/reorder', { token: superToken, body: { parentId: null, orderedIds: reversed.slice(1) } })).status).toBe(400);
    await call('POST', '/config/menus/reorder', { token: superToken, body: { parentId: null, orderedIds: modules.map((m) => m.id) } });
  });

  it('creates and renames special actions', async () => {
    const code = `approve_${randomUUID().slice(0, 6)}`;
    const created = await call('POST', '/config/actions', { token: superToken, body: { code, name: { es: 'Aprobar', en: 'Approve' } } });
    expect(created.status).toBe(201);
    const list = await call('GET', '/config/actions', { token: superToken });
    expect(list.body.actions.find((a: { code: string }) => a.code === code).is_standard).toBe(false);
    expect((await call('PATCH', '/config/actions/{id}', { token: superToken, pathParameters: { id: String(created.body.id) }, body: { name: { es: 'Autorizar', en: 'Authorize' } } })).status).toBe(200);
    expect((await call('POST', '/config/actions', { token: superToken, body: { code, name: { es: 'X', en: 'X' } } })).status).toBe(409);
  });
});

describe('security policy', () => {
  it('updates the policy and the client MFA requirement, auditing the changes', async () => {
    const response = await call('PUT', '/config/security-policy', { token: superToken, body: { ...policyBody, clientMfaRequired: true } });
    expect(response.body.policy).toMatchObject({ password_min_length: 14, password_require_symbol: false, password_max_age_days: 90 });
    expect(response.body.roles.find((r: { code: string }) => r.code === 'client').mfa_required).toBe(true);
    await call('PUT', '/config/security-policy', { token: superToken, body: policyBody });
    expect(await auditEvents(superuser.id)).toContain('config.security_policy.update');
  });

  it('rejects values outside the allowed ranges (ASVS floor of 12 characters)', async () => {
    expect((await call('PUT', '/config/security-policy', { token: superToken, body: { ...policyBody, passwordMinLength: 8 } })).status).toBe(400);
    expect((await call('PUT', '/config/security-policy', { token: superToken, body: { ...policyBody, maxFailedAttempts: 50 } })).status).toBe(400);
  });
});

describe('email templates', () => {
  async function invitationEs() {
    const list = await call('GET', '/config/email-templates', { token: superToken });
    expect(list.body.templates).toHaveLength(8);
    return list.body.templates.find((t: { code: string; locale: string }) => t.code === 'invitation' && t.locale === 'es');
  }

  it('saves a template with sanitized HTML and audits it', async () => {
    const template = await invitationEs();
    const detail = await call('GET', '/config/email-templates/{id}', { token: superToken, pathParameters: { id: template.id } });
    expect(detail.body.variables).toContain('link');
    const response = await call('PUT', '/config/email-templates/{id}', {
      token: superToken,
      pathParameters: { id: template.id },
      body: {
        subject: 'Bienvenido a {{system_name}}',
        bodyHtml: '<p onclick="steal()">Hola {{first_name}}</p><script>alert(1)</script><a href="{{link}}">activar</a><a href="javascript:x()">x</a>',
        bodyText: 'Hola {{first_name}}: {{link}}',
      },
    });
    expect(response.body.sanitized).toBe(true);
    expect(response.body.template.body_html).toBe('<p>Hola {{first_name}}</p><a href="{{link}}">activar</a><a>x</a>');
    expect(await auditEvents(superuser.id)).toContain('config.email_template.update');
  });

  it('rejects variables the template does not offer', async () => {
    const template = await invitationEs();
    const response = await call('PUT', '/config/email-templates/{id}', {
      token: superToken,
      pathParameters: { id: template.id },
      body: { subject: 'x', bodyHtml: '<p>{{code}}</p>', bodyText: '{{password}}' },
    });
    expect(response.body.error).toMatchObject({ code: 'UNKNOWN_VARIABLES', details: ['code', 'password'] });
  });

  it('previews with example values without storing anything', async () => {
    const response = await call('POST', '/config/email-templates/preview', {
      token: superToken,
      body: { code: 'password_reset', subject: 'Código {{code}}', bodyHtml: '<b>{{first_name}}</b>', bodyText: '{{code}}' },
    });
    expect(response.body).toEqual({ subject: 'Código 123456', html: '<b>Ana</b>', text: '123456' });
  });

  it('keeps https and mailto links and inline styles; drops dangerous markup', () => {
    expect(sanitizeTemplateHtml('<a href="https://x.cl" style="color:red">a</a><a href="mailto:a@b.cl">m</a>')).toBe(
      '<a href="https://x.cl" style="color:red">a</a><a href="mailto:a@b.cl">m</a>',
    );
    expect(sanitizeTemplateHtml('<iframe src="https://x"></iframe><img src="http://x/a.png">')).toBe('<img />');
  });
});

describe('audit screen', () => {
  it('filters, paginates and shows the old and new values', async () => {
    const list = await call('GET', '/audit/events', { token: auditorToken, query: { eventType: 'config.settings.update', pageSize: '5' } });
    expect(list.body.total).toBeGreaterThan(0);
    expect(list.body.items.every((e: { event_type: string }) => e.event_type === 'config.settings.update')).toBe(true);
    const detail = await call('GET', '/audit/events/{id}', { token: auditorToken, pathParameters: { id: String(list.body.items[0].id) } });
    expect(detail.body.event.new_value).toBeTruthy();
    expect((await call('GET', '/audit/events/{id}', { token: auditorToken, pathParameters: { id: '999999999' } })).status).toBe(404);

    const byActor = await call('GET', '/audit/events', { token: auditorToken, query: { actor: superuser.email.slice(0, 15), result: 'success' } });
    expect(byActor.body.items.length).toBeGreaterThan(0);
    const range = await call('GET', '/audit/events', { token: auditorToken, query: { from: '2000-01-01T00:00:00Z', to: '2000-01-02T00:00:00Z' } });
    expect(range.body.total).toBe(0);
  });

  it('lists event types and verifies the chain', async () => {
    expect((await call('GET', '/audit/event-types', { token: auditorToken })).body.eventTypes).toContain('config.settings.update');
    expect((await call('GET', '/audit/integrity', { token: auditorToken })).body).toMatchObject({ valid: true, brokenId: null });
  });

  it('exports CSV and records the export', async () => {
    const response = await call('GET', '/audit/events/export', { token: auditorToken, query: { eventType: 'config.settings.update' } });
    expect(response.headers['Content-Type']).toContain('text/csv');
    expect(response.text).toContain('config.settings.update');
    const exports = await ownerDb.selectFrom('app.audit_log').select('id').where('event_type', '=', 'audit.export').execute();
    expect(exports.length).toBeGreaterThan(0);
  });

  it('reports tampering with an entry', async () => {
    const { sql } = await import('kysely');
    const victim = await ownerDb.selectFrom('app.audit_log').select(['id', 'result']).orderBy('id', 'desc').executeTakeFirstOrThrow();
    const tamper = async (result: string) => {
      await sql`alter table app.audit_log disable trigger audit_log_no_update_delete`.execute(ownerDb);
      await sql`update app.audit_log set result = ${result} where id = ${victim.id}`.execute(ownerDb);
      await sql`alter table app.audit_log enable trigger audit_log_no_update_delete`.execute(ownerDb);
    };
    await tamper(victim.result === 'success' ? 'failure' : 'success');
    const broken = await call('GET', '/audit/integrity', { token: auditorToken });
    await tamper(victim.result);
    expect(broken.body).toMatchObject({ valid: false, brokenId: String(victim.id) });
    expect((await call('GET', '/audit/integrity', { token: auditorToken })).body.valid).toBe(true);
  });
});
