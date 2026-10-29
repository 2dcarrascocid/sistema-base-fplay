import { computeRutCheckDigit, formatRut } from '@base/shared';
import { randomInt, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminRoutes } from '../src/admin/routes.js';
import {
  apiDb,
  auditEvents,
  caller,
  createSession,
  createUser,
  makeDeps,
  ownerDb,
  PROFILE_USER_MANAGEMENT,
  type TestUser,
} from './helpers.js';

const deps = makeDeps(apiDb);
const routes = adminRoutes(deps);
const call = caller(routes);
const AUDITOR_PROFILE = '20000000-0000-0000-0000-000000000002';

function randomRut(): string {
  const body = String(randomInt(10_000_000, 99_999_999));
  return `${body}-${computeRutCheckDigit(body)}`;
}

async function menuActionId(menu: string, action: string): Promise<string> {
  const row = await ownerDb
    .selectFrom('app.menu_actions as ma')
    .innerJoin('app.menus as m', 'm.id', 'ma.menu_id')
    .innerJoin('app.actions as a', 'a.id', 'ma.action_id')
    .select('ma.id')
    .where('m.code', '=', menu)
    .where('a.code', '=', action)
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Profile holding exactly the given permissions (created as owner). */
async function profileWith(permissions: [string, string][]): Promise<string> {
  const profile = await ownerDb.insertInto('app.profiles').values({ name: `test-${randomUUID()}` }).returning('id').executeTakeFirstOrThrow();
  for (const [menu, action] of permissions) {
    await ownerDb.insertInto('app.profile_permissions').values({ profile_id: profile.id, menu_action_id: await menuActionId(menu, action) }).execute();
  }
  return profile.id;
}

let profileManagement: string;
let admin: TestUser;
let adminToken: string;
let superToken: string;
let superuser: TestUser;
let clientToken: string;

beforeAll(async () => {
  profileManagement = await profileWith([
    ['security.profiles', 'view'],
    ['security.profiles', 'create'],
    ['security.profiles', 'edit'],
    ['security.profiles', 'delete'],
  ]);
  admin = await createUser({ role: 'admin', mfaEnabled: true, profiles: [PROFILE_USER_MANAGEMENT, profileManagement] });
  adminToken = (await createSession(admin)).accessToken;
  superuser = await createUser({ role: 'superuser', mfaEnabled: true });
  superToken = (await createSession(superuser)).accessToken;
  clientToken = (await createSession(await createUser())).accessToken;
});

const newUserBody = (overrides: Record<string, unknown> = {}) => ({
  email: `new-${randomUUID()}@test.cl`,
  firstName: 'Nuevo',
  lastName: 'Usuario',
  role: 'client',
  profileIds: [],
  ...overrides,
});

describe('authorization', () => {
  it('every admin endpoint answers 403 to a user without permissions', async () => {
    const id = randomUUID();
    for (const key of Object.keys(routes)) {
      const [method, resource] = key.split(' ') as [string, string];
      const response = await call(method, resource, { token: clientToken, pathParameters: { id }, body: {} });
      expect(response.status, key).toBe(403);
    }
  });
});

describe('users maintainer', () => {
  it('lists with search, filters and pagination', async () => {
    const target = await createUser();
    const bySearch = await call('GET', '/admin/users', { token: adminToken, query: { search: target.email.slice(0, 20) } });
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.items.map((u: { id: string }) => u.id)).toContain(target.id);

    const page = await call('GET', '/admin/users', { token: adminToken, query: { role: 'admin', pageSize: '1', sort: 'email', order: 'asc' } });
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBeGreaterThanOrEqual(1);
    expect(page.body.items.every((u: { role: string }) => u.role === 'admin')).toBe(true);

    expect((await call('GET', '/admin/users', { token: adminToken, query: { pageSize: '1000' } })).status).toBe(400);
  });

  it('exports CSV with formula injection neutralized, and audits the export', async () => {
    const tricky = await createUser();
    await ownerDb.updateTable('app.users').set({ first_name: '=HYPERLINK("http://evil")' }).where('id', '=', tricky.id).execute();
    const response = await call('GET', '/admin/users/export', { token: adminToken, query: { search: tricky.email } });
    expect(response.headers['Content-Type']).toContain('text/csv');
    expect(response.text.split('\r\n')[0]).toContain('email;nombre');
    expect(response.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(await auditEvents(admin.id)).toContain('user.export');
  });

  it('creates a client with profiles and sends the invitation', async () => {
    const rut = randomRut();
    const body = newUserBody({ rut: formatRut(rut), profileIds: [PROFILE_USER_MANAGEMENT] });
    const response = await call('POST', '/admin/users', { token: adminToken, body });
    expect(response.status).toBe(201);

    const created = await ownerDb.selectFrom('app.users').select(['status', 'rut']).where('id', '=', response.body.id).executeTakeFirstOrThrow();
    expect(created).toEqual({ status: 'invited', rut });
    expect(deps.cognito.called('adminCreateUser').at(-1)!.args).toEqual([body.email, false]);
    expect(deps.mailer.sent.at(-1)!.to).toBe(body.email);
    expect(await ownerDb.selectFrom('app.user_identities').select('provider').where('user_id', '=', response.body.id).execute()).toEqual([
      { provider: 'local' },
    ]);
    expect(await auditEvents(admin.id)).toContain('user.create');
  });

  it('an administrator cannot create administrators', async () => {
    const before = deps.cognito.called('adminCreateUser').length;
    expect((await call('POST', '/admin/users', { token: adminToken, body: newUserBody({ role: 'admin' }) })).status).toBe(403);
    expect(deps.cognito.called('adminCreateUser')).toHaveLength(before);
  });

  it('an administrator cannot assign a profile with permissions they do not have', async () => {
    const response = await call('POST', '/admin/users', { token: adminToken, body: newUserBody({ profileIds: [AUDITOR_PROFILE] }) });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('UNGRANTABLE_PERMISSIONS');
  });

  it('validates RUT and rejects duplicate emails', async () => {
    expect((await call('POST', '/admin/users', { token: adminToken, body: newUserBody({ rut: '12.345.678-9' }) })).status).toBe(400);
    const existing = await createUser();
    const response = await call('POST', '/admin/users', { token: adminToken, body: newUserBody({ email: existing.email }) });
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('shows the user detail with profiles, identities and pending invitation', async () => {
    const created = await call('POST', '/admin/users', { token: adminToken, body: newUserBody({ profileIds: [PROFILE_USER_MANAGEMENT] }) });
    const detail = await call('GET', '/admin/users/{id}', { token: adminToken, pathParameters: { id: created.body.id } });
    expect(detail.body.profiles.map((p: { id: string }) => p.id)).toEqual([PROFILE_USER_MANAGEMENT]);
    expect(detail.body.pendingInvitation).not.toBeNull();
    expect(detail.body.canManage).toBe(true);
    expect((await call('GET', '/admin/users/{id}', { token: adminToken, pathParameters: { id: randomUUID() } })).status).toBe(404);
  });

  it('edits a client and audits old and new values; never another administrator or its own role', async () => {
    const client = await createUser();
    const response = await call('PATCH', '/admin/users/{id}', {
      token: adminToken,
      pathParameters: { id: client.id },
      body: { jobTitle: 'Contador', phone: '+56911112222' },
    });
    expect(response.status).toBe(200);
    const entry = await ownerDb
      .selectFrom('app.audit_log')
      .select(['old_value', 'new_value'])
      .where('event_type', '=', 'user.update')
      .where('entity_id', '=', client.id)
      .executeTakeFirstOrThrow();
    expect(entry.old_value).toEqual({ job_title: null, phone: null });
    expect(entry.new_value).toEqual({ job_title: 'Contador', phone: '+56911112222' });

    const otherAdmin = await createUser({ role: 'admin', mfaEnabled: true });
    expect((await call('PATCH', '/admin/users/{id}', { token: adminToken, pathParameters: { id: otherAdmin.id }, body: { jobTitle: 'x' } })).status).toBe(403);
    const self = await call('PATCH', '/admin/users/{id}', { token: adminToken, pathParameters: { id: admin.id }, body: { role: 'superuser' } });
    expect(self.body.error.code).toBe('SELF_CHANGE_FORBIDDEN');
  });

  it('the superuser can promote a client to administrator', async () => {
    const client = await createUser();
    expect((await call('PATCH', '/admin/users/{id}', { token: superToken, pathParameters: { id: client.id }, body: { role: 'admin' } })).status).toBe(200);
    const row = await ownerDb.selectFrom('app.users').select('role_id').where('id', '=', client.id).executeTakeFirstOrThrow();
    expect(row.role_id).toBe(2);
  });

  it('replaces profiles only within what the actor can grant', async () => {
    const client = await createUser({ profiles: [AUDITOR_PROFILE] });
    const removeAuditor = await call('PUT', '/admin/users/{id}/profiles', {
      token: adminToken,
      pathParameters: { id: client.id },
      body: { profileIds: [PROFILE_USER_MANAGEMENT] },
    });
    expect(removeAuditor.status).toBe(403);

    const other = await createUser();
    const ok = await call('PUT', '/admin/users/{id}/profiles', { token: adminToken, pathParameters: { id: other.id }, body: { profileIds: [PROFILE_USER_MANAGEMENT] } });
    expect(ok.status).toBe(204);
    const permissions = await call('GET', '/admin/users/{id}/permissions', { token: adminToken, pathParameters: { id: other.id } });
    expect(permissions.body.permissions).toContain('security.users:view');
  });

  it('deactivates (closing sessions and disabling Cognito) and reactivates a client', async () => {
    const client = await createUser();
    const { sessionId } = await createSession(client);
    expect((await call('POST', '/admin/users/{id}/deactivate', { token: adminToken, pathParameters: { id: client.id } })).status).toBe(204);
    const session = await ownerDb.selectFrom('app.user_sessions').select('revoked_reason').where('id', '=', sessionId).executeTakeFirstOrThrow();
    expect(session.revoked_reason).toBe('deactivated');
    expect(deps.cognito.called('adminDisableUser').at(-1)!.args).toEqual([client.sub]);

    expect((await call('POST', '/admin/users/{id}/deactivate', { token: adminToken, pathParameters: { id: client.id } })).status).toBe(409);
    expect((await call('POST', '/admin/users/{id}/activate', { token: adminToken, pathParameters: { id: client.id } })).status).toBe(204);
    expect(deps.cognito.called('adminEnableUser').at(-1)!.args).toEqual([client.sub]);
  });

  it('nobody deactivates their own account', async () => {
    const response = await call('POST', '/admin/users/{id}/deactivate', { token: superToken, pathParameters: { id: superuser.id } });
    expect(response.body.error.code).toBe('SELF_CHANGE_FORBIDDEN');
  });

  it('unlocks, resets passwords and closes sessions', async () => {
    const client = await createUser();
    await ownerDb.updateTable('app.users').set({ locked_until: new Date(Date.now() + 60_000), failed_login_count: 5 }).where('id', '=', client.id).execute();
    expect((await call('POST', '/admin/users/{id}/unlock', { token: adminToken, pathParameters: { id: client.id } })).status).toBe(204);
    expect(await ownerDb.selectFrom('app.users').select(['locked_until', 'failed_login_count']).where('id', '=', client.id).executeTakeFirstOrThrow()).toEqual({
      locked_until: null,
      failed_login_count: 0,
    });

    const { sessionId } = await createSession(client);
    expect((await call('POST', '/admin/users/{id}/reset-password', { token: adminToken, pathParameters: { id: client.id } })).status).toBe(204);
    expect(deps.cognito.called('adminResetUserPassword').at(-1)!.args).toEqual([client.sub]);
    const session = await ownerDb.selectFrom('app.user_sessions').select('revoked_reason').where('id', '=', sessionId).executeTakeFirstOrThrow();
    expect(session.revoked_reason).toBe('admin');

    await createSession(client);
    expect((await call('POST', '/admin/users/{id}/revoke-sessions', { token: adminToken, pathParameters: { id: client.id } })).status).toBe(204);
    expect(await auditEvents(admin.id)).toEqual(expect.arrayContaining(['user.unlock', 'user.password.reset', 'user.sessions.revoked']));

    const invited = await createUser({ status: 'invited' });
    expect((await call('POST', '/admin/users/{id}/reset-password', { token: adminToken, pathParameters: { id: invited.id } })).status).toBe(409);
  });

  it('re-sends an invitation and cancels the previous one', async () => {
    const created = await call('POST', '/admin/users', { token: adminToken, body: newUserBody() });
    const sentBefore = deps.mailer.sent.length;
    const response = await call('POST', '/admin/users/{id}/invitation', { token: adminToken, pathParameters: { id: created.body.id } });
    expect(response.status).toBe(200);
    expect(deps.mailer.sent).toHaveLength(sentBefore + 1);
    const invitations = await ownerDb.selectFrom('app.invitations').select('revoked_at').where('user_id', '=', created.body.id).execute();
    expect(invitations.filter((i) => i.revoked_at === null)).toHaveLength(1);

    const active = await createUser();
    expect((await call('POST', '/admin/users/{id}/invitation', { token: adminToken, pathParameters: { id: active.id } })).status).toBe(409);
  });

  it('lists only the roles the actor can assign', async () => {
    const asAdmin = await call('GET', '/admin/roles', { token: adminToken });
    expect(asAdmin.body.roles.filter((r: { can_assign: boolean }) => r.can_assign).map((r: { code: string }) => r.code)).toEqual(['client']);
    const asSuper = await call('GET', '/admin/roles', { token: superToken });
    expect(asSuper.body.roles.every((r: { can_assign: boolean }) => r.can_assign)).toBe(true);
  });
});

describe('profiles maintainer', () => {
  it('lists profiles with user and permission counts', async () => {
    const response = await call('GET', '/admin/profiles', { token: adminToken, query: { search: 'Auditor' } });
    expect(response.body.items).toEqual([expect.objectContaining({ name: 'Auditor', permission_count: 2 })]);
  });

  it('creates a profile with permissions the actor holds; refuses the others', async () => {
    const view = await menuActionId('security.users', 'view');
    const auditView = await menuActionId('security.audit', 'view');
    const ok = await call('POST', '/admin/profiles', { token: adminToken, body: { name: `Lectura ${randomUUID()}`, menuActionIds: [view] } });
    expect(ok.status).toBe(201);

    const denied = await call('POST', '/admin/profiles', { token: adminToken, body: { name: `Auditoría ${randomUUID()}`, menuActionIds: [auditView] } });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatchObject({ code: 'UNGRANTABLE_PERMISSIONS', details: { permissions: ['security.audit:view'] } });
  });

  it('rejects duplicate names', async () => {
    const response = await call('POST', '/admin/profiles', { token: adminToken, body: { name: 'auditor' } });
    expect(response.body.error.code).toBe('NAME_TAKEN');
  });

  it('edits the matrix and audits added and removed permissions', async () => {
    const created = await call('POST', '/admin/profiles', { token: adminToken, body: { name: `Matriz ${randomUUID()}` } });
    const id = created.body.id;
    const view = await menuActionId('security.users', 'view');
    const edit = await menuActionId('security.users', 'edit');
    expect((await call('PUT', '/admin/profiles/{id}/permissions', { token: adminToken, pathParameters: { id }, body: { menuActionIds: [view, edit] } })).status).toBe(204);
    expect((await call('PUT', '/admin/profiles/{id}/permissions', { token: adminToken, pathParameters: { id }, body: { menuActionIds: [view] } })).status).toBe(204);

    const detail = await call('GET', '/admin/profiles/{id}', { token: adminToken, pathParameters: { id } });
    expect(detail.body.menuActionIds).toEqual([view]);
    const entries = await ownerDb
      .selectFrom('app.audit_log')
      .select('new_value')
      .where('event_type', '=', 'profile.permissions.update')
      .where('entity_id', '=', id)
      .orderBy('id')
      .execute();
    expect(entries.map((e) => e.new_value)).toEqual([
      { added: ['security.users:edit', 'security.users:view'], removed: [] },
      { added: [], removed: ['security.users:edit'] },
    ]);
  });

  it('cannot edit a profile holding permissions the actor lacks', async () => {
    const response = await call('PATCH', '/admin/profiles/{id}', { token: adminToken, pathParameters: { id: AUDITOR_PROFILE }, body: { description: 'x' } });
    expect(response.status).toBe(403);
  });

  it('duplicates, renames, deactivates and reactivates', async () => {
    const copy = await call('POST', '/admin/profiles/{id}/duplicate', {
      token: adminToken,
      pathParameters: { id: PROFILE_USER_MANAGEMENT },
      body: { name: `Copia ${randomUUID()}` },
    });
    expect(copy.status).toBe(201);
    const detail = await call('GET', '/admin/profiles/{id}', { token: adminToken, pathParameters: { id: copy.body.id } });
    expect(detail.body.menuActionIds.length).toBe(8);

    expect((await call('PATCH', '/admin/profiles/{id}', { token: adminToken, pathParameters: { id: copy.body.id }, body: { name: `Renombrado ${randomUUID()}` } })).status).toBe(200);
    expect((await call('POST', '/admin/profiles/{id}/deactivate', { token: adminToken, pathParameters: { id: copy.body.id } })).status).toBe(204);
    expect((await call('POST', '/admin/profiles/{id}/deactivate', { token: adminToken, pathParameters: { id: copy.body.id } })).status).toBe(409);
    expect((await call('POST', '/admin/profiles/{id}/activate', { token: adminToken, pathParameters: { id: copy.body.id } })).status).toBe(204);
    expect((await call('POST', '/admin/profiles/{id}/duplicate', { token: adminToken, pathParameters: { id: AUDITOR_PROFILE }, body: { name: `X ${randomUUID()}` } })).status).toBe(403);
  });

  it('lists the users of a profile only with security.users:view as well', async () => {
    const holder = await createUser({ profiles: [PROFILE_USER_MANAGEMENT] });
    const users = await call('GET', '/admin/profiles/{id}/users', { token: adminToken, pathParameters: { id: PROFILE_USER_MANAGEMENT } });
    expect(users.body.users.map((u: { id: string }) => u.id)).toContain(holder.id);

    const profilesOnly = await createUser({ role: 'admin', mfaEnabled: true, profiles: [profileManagement] });
    const token = (await createSession(profilesOnly)).accessToken;
    expect((await call('GET', '/admin/profiles/{id}/users', { token, pathParameters: { id: PROFILE_USER_MANAGEMENT } })).status).toBe(403);
  });

  it('serves the permission catalog without superuser-only menus, flagging grantable actions', async () => {
    const response = await call('GET', '/admin/permission-catalog', { token: adminToken });
    const codes = response.body.menus.map((m: { code: string }) => m.code);
    // Other suites may already have created ordinary menus in the shared test database.
    expect(codes).toEqual(expect.arrayContaining(['security', 'saphi']));
    const restricted = await ownerDb.selectFrom('app.v_effective_menus').select('code').where('superuser_only','=',true).execute();
    const flatten = (menus: {code:string;children:any[]}[]):string[] => menus.flatMap(menu=>[menu.code,...flatten(menu.children)]);
    const returnedCodes=flatten(response.body.menus);
    for(const menu of restricted)expect(returnedCodes).not.toContain(menu.code);
    // The new catalogue is visible for administration, but adds no grants to this admin.
    const saphi = response.body.menus.find((m: { code: string }) => m.code === 'saphi');
    expect(saphi.children.every((menu: { actions: { grantable: boolean }[] }) =>
      menu.actions.every((action) => !action.grantable))).toBe(true);
    const security = response.body.menus.find((m: { code: string }) => m.code === 'security');
    const users = security.children.find((m: { code: string }) => m.code === 'security.users');
    expect(users.actions.every((a: { grantable: boolean }) => a.grantable)).toBe(true);
    const audit = security.children.find((m: { code: string }) => m.code === 'security.audit');
    expect(audit.actions.some((a: { grantable: boolean }) => a.grantable)).toBe(false);
    expect(response.body.actions.map((a: { code: string }) => a.code)).toContain('view');
  });
});
