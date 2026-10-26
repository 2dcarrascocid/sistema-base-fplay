import { describe, expect, it } from 'vitest';
import { authed } from '../src/lib/authenticate.js';
import { json } from '../src/lib/http.js';
import { apiDb, caller, createSession, createUser, makeDeps, ownerDb, PROFILE_USER_MANAGEMENT } from './helpers.js';

const deps = makeDeps(apiDb);

/** A protected endpoint like the ones the maintainers will expose. */
const call = caller({
  'GET /users': authed(deps, async (_request, actor, tx) => {
    const users = await tx.selectFrom('app.users').select('id').execute();
    return json({ actor: actor.userId, visibleUsers: users.length });
  }, { permission: 'security.users:view' }),
  'GET /open': authed(deps, async (_request, actor) => json({ role: actor.role, permissions: [...actor.permissions] })),
  'GET /pending-ok': authed(deps, async () => json({ ok: true }), { allowPending: true }),
});

describe('authenticated requests', () => {
  it('rejects requests without a valid token (401)', async () => {
    expect((await call('GET', '/open')).status).toBe(401);
    expect((await call('GET', '/open', { token: 'garbage' })).status).toBe(401);
    const user = await createUser();
    expect((await call('GET', '/open', { token: `${user.sub}|jti|unknown-client` })).status).toBe(401);
  });

  it('a user without the permission receives 403', async () => {
    const client = await createUser({ role: 'client' });
    const { accessToken } = await createSession(client);
    const response = await call('GET', '/users', { token: accessToken });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('a user with the permission gets through, with RLS applied as that user', async () => {
    const admin = await createUser({ role: 'admin', mfaEnabled: true, profiles: [PROFILE_USER_MANAGEMENT] });
    const { accessToken } = await createSession(admin);
    const response = await call('GET', '/users', { token: accessToken });
    expect(response.status).toBe(200);
    expect(response.body.actor).toBe(admin.id);
    expect(response.body.visibleUsers).toBeGreaterThan(1);
  });

  it('a removed permission applies on the very next request', async () => {
    const profile = await ownerDb.insertInto('app.profiles').values({ name: `p-${Date.now()}` }).returning('id').executeTakeFirstOrThrow();
    const view = await ownerDb
      .selectFrom('app.menu_actions as ma')
      .innerJoin('app.menus as m', 'm.id', 'ma.menu_id')
      .innerJoin('app.actions as a', 'a.id', 'ma.action_id')
      .select('ma.id')
      .where('m.code', '=', 'security.users')
      .where('a.code', '=', 'view')
      .executeTakeFirstOrThrow();
    await ownerDb.insertInto('app.profile_permissions').values({ profile_id: profile.id, menu_action_id: view.id }).execute();
    const admin = await createUser({ role: 'admin', mfaEnabled: true, profiles: [profile.id] });
    const { accessToken } = await createSession(admin);

    expect((await call('GET', '/users', { token: accessToken })).status).toBe(200);
    await ownerDb.deleteFrom('app.profile_permissions').where('profile_id', '=', profile.id).execute();
    expect((await call('GET', '/users', { token: accessToken })).status).toBe(403);
  });

  it('the superuser holds every permission', async () => {
    const superuser = await createUser({ role: 'superuser', mfaEnabled: true });
    const { accessToken } = await createSession(superuser);
    expect((await call('GET', '/users', { token: accessToken })).status).toBe(200);
  });

  it('a revoked session receives 401 even with a valid token', async () => {
    const client = await createUser();
    const { accessToken, sessionId } = await createSession(client);
    expect((await call('GET', '/open', { token: accessToken })).status).toBe(200);
    await ownerDb.updateTable('app.user_sessions').set({ revoked_at: new Date(), revoked_reason: 'admin' }).where('id', '=', sessionId).execute();
    const response = await call('GET', '/open', { token: accessToken });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_INVALID');
  });

  it('administrators cannot use the mobile app (403)', async () => {
    const admin = await createUser({ role: 'admin', mfaEnabled: true });
    const response = await call('GET', '/open', { token: `${admin.sub}|mobile-jti-${admin.id}|mobile-client` });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('clients get a mobile session registered on first use', async () => {
    const client = await createUser();
    const token = `${client.sub}|mobile-jti-${client.id}|mobile-client`;
    expect((await call('GET', '/open', { token })).status).toBe(200);
    const sessions = await ownerDb.selectFrom('app.user_sessions').select('client_type').where('user_id', '=', client.id).execute();
    expect(sessions).toEqual([{ client_type: 'mobile' }]);
  });

  it('blocks everything but Mi cuenta essentials while a password change or MFA setup is pending', async () => {
    const changer = await createUser({ mustChangePassword: true });
    const changerToken = (await createSession(changer)).accessToken;
    expect((await call('GET', '/open', { token: changerToken })).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await call('GET', '/pending-ok', { token: changerToken })).status).toBe(200);

    const admin = await createUser({ role: 'admin', mfaEnabled: false });
    const adminToken = (await createSession(admin)).accessToken;
    expect((await call('GET', '/open', { token: adminToken })).body.error.code).toBe('MFA_SETUP_REQUIRED');
  });
});
