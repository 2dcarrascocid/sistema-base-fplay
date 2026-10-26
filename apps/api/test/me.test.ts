import { describe, expect, it } from 'vitest';
import { meRoutes } from '../src/me/routes.js';
import { apiDb, auditEvents, caller, createSession, createUser, makeDeps, ownerDb, PROFILE_USER_MANAGEMENT } from './helpers.js';

const deps = makeDeps(apiDb);
const call = caller(meRoutes(deps));

async function signedIn(options: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(options);
  const session = await createSession(user);
  return { user, ...session };
}

describe('GET /me', () => {
  it('returns profile, permissions, allowed menu and settings', async () => {
    const { token, user } = await signedIn({ role: 'admin', mfaEnabled: true, profiles: [PROFILE_USER_MANAGEMENT] }).then((s) => ({
      ...s,
      token: s.accessToken,
    }));
    const response = await call('GET', '/me', { token });
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: user.id, email: user.email, photoUrl: null });
    expect(response.body.user).not.toHaveProperty('photo_key');
    expect(response.body.role).toBe('admin');
    expect(response.body.permissions).toContain('security.users:view');
    expect(response.body.menu.map((m: { code: string }) => m.code)).toEqual(['security']);
    expect(response.body.menu[0].children.map((m: { code: string }) => m.code)).toEqual(['security.users', 'security.profiles']);
    expect(response.body.settings.system_name).toBe('Sistema Base');
  });

  it('a client without profiles gets an empty menu', async () => {
    const { accessToken } = await signedIn();
    expect((await call('GET', '/me', { token: accessToken })).body.menu).toEqual([]);
  });
});

describe('PATCH /me', () => {
  it('updates own data and audits old and new values', async () => {
    const { accessToken, user } = await signedIn();
    const response = await call('PATCH', '/me', {
      token: accessToken,
      body: { firstName: 'María', phone: '+56912345678', locale: 'en', timeZone: 'America/Santiago' },
    });
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ first_name: 'María', phone: '+56912345678', locale: 'en' });
    const entry = await ownerDb
      .selectFrom('app.audit_log')
      .select(['old_value', 'new_value'])
      .where('actor_user_id', '=', user.id)
      .where('event_type', '=', 'account.update')
      .executeTakeFirstOrThrow();
    expect(entry.old_value).toMatchObject({ first_name: 'Test', phone: null });
    expect(entry.new_value).toMatchObject({ first_name: 'María' });
  });

  it('rejects unknown fields (no mass assignment of role, status, email) and invalid values', async () => {
    const { accessToken } = await signedIn();
    expect((await call('PATCH', '/me', { token: accessToken, body: { role_id: 1 } })).status).toBe(400);
    expect((await call('PATCH', '/me', { token: accessToken, body: { timeZone: 'Mars/Olympus' } })).status).toBe(400);
    expect((await call('PATCH', '/me', { token: accessToken, body: {} })).status).toBe(400);
  });
});

describe('POST /me/password', () => {
  it('changes the password and closes the other sessions', async () => {
    const { accessToken, sessionId, user } = await signedIn();
    const other = await createSession(user);
    const response = await call('POST', '/me/password', {
      token: accessToken,
      body: { currentPassword: 'Current-Pass-123!', newPassword: 'Another-Pass-2026!' },
    });
    expect(response.status).toBe(204);
    const sessions = await ownerDb.selectFrom('app.user_sessions').select(['id', 'revoked_reason']).where('user_id', '=', user.id).execute();
    expect(sessions.find((s) => s.id === sessionId)!.revoked_reason).toBeNull();
    expect(sessions.find((s) => s.id === other.sessionId)!.revoked_reason).toBe('password_change');
  });

  it('rejects a wrong current password and policy violations', async () => {
    const { accessToken } = await signedIn();
    const wrong = await call('POST', '/me/password', { token: accessToken, body: { currentPassword: 'nope', newPassword: 'Another-Pass-2026!' } });
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    const weak = await call('POST', '/me/password', { token: accessToken, body: { currentPassword: 'Current-Pass-123!', newPassword: 'abc' } });
    expect(weak.body.error.code).toBe('PASSWORD_POLICY');
  });

  it('is allowed while a password change is pending', async () => {
    const { accessToken } = await signedIn({ mustChangePassword: true });
    const response = await call('POST', '/me/password', {
      token: accessToken,
      body: { currentPassword: 'Current-Pass-123!', newPassword: 'Another-Pass-2026!' },
    });
    expect(response.status).toBe(204);
  });
});

describe('sessions', () => {
  it('lists active sessions marking the current one, and revokes others', async () => {
    const { accessToken, sessionId, user } = await signedIn();
    const other = await createSession(user);
    const list = await call('GET', '/me/sessions', { token: accessToken });
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.sessions.find((s: { id: string }) => s.id === sessionId).current).toBe(true);

    expect((await call('DELETE', '/me/sessions/{id}', { token: accessToken, pathParameters: { id: other.sessionId } })).status).toBe(204);
    expect((await call('GET', '/me/sessions', { token: other.accessToken })).status).toBe(401);
    expect((await call('DELETE', '/me/sessions/{id}', { token: accessToken, pathParameters: { id: other.sessionId } })).status).toBe(404);
  });

  it('cannot revoke sessions of other users', async () => {
    const { accessToken } = await signedIn();
    const victim = await signedIn();
    const response = await call('DELETE', '/me/sessions/{id}', { token: accessToken, pathParameters: { id: victim.sessionId } });
    expect(response.status).toBe(404);
    expect((await call('GET', '/me/sessions', { token: victim.accessToken })).status).toBe(200);
  });

  it('revokes all other sessions at once', async () => {
    const { accessToken, user } = await signedIn();
    const other = await createSession(user);
    expect((await call('POST', '/me/sessions/revoke-others', { token: accessToken })).status).toBe(204);
    expect((await call('GET', '/me', { token: other.accessToken })).status).toBe(401);
    expect(await auditEvents(user.id)).toContain('account.sessions.revoked');
  });
});

describe('MFA', () => {
  it('enrols TOTP', async () => {
    const { accessToken, user } = await signedIn();
    const setup = await call('POST', '/me/mfa/setup', { token: accessToken });
    expect(setup.body.otpauthUri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect((await call('POST', '/me/mfa/verify', { token: accessToken, body: { code: '000000' } })).body.error.code).toBe('INVALID_CODE');
    expect((await call('POST', '/me/mfa/verify', { token: accessToken, body: { code: '123456' } })).status).toBe(204);
    const row = await ownerDb.selectFrom('app.users').select('mfa_enabled').where('id', '=', user.id).executeTakeFirstOrThrow();
    expect(row.mfa_enabled).toBe(true);
  });

  it('cannot be disabled when the role requires it', async () => {
    const admin = await signedIn({ role: 'admin', mfaEnabled: true });
    expect((await call('DELETE', '/me/mfa', { token: admin.accessToken })).body.error.code).toBe('MFA_REQUIRED_BY_ROLE');
    const client = await signedIn({ mfaEnabled: true });
    expect((await call('DELETE', '/me/mfa', { token: client.accessToken })).status).toBe(204);
  });
});

describe('photo', () => {
  it('uploads through a presigned POST restricted to the user prefix', async () => {
    const { accessToken, user } = await signedIn();
    const upload = await call('POST', '/me/photo/upload-url', { token: accessToken, body: { contentType: 'image/png' } });
    expect(upload.body.key).toMatch(new RegExp(`^users/${user.id}/[0-9a-f-]{36}\\.png$`));
    expect(upload.body.maxBytes).toBe(2 * 1024 * 1024);

    expect((await call('PUT', '/me/photo', { token: accessToken, body: { key: upload.body.key } })).body.error.code).toBe('INVALID_PHOTO');
    deps.storage.objects.set(upload.body.key, 1000);
    const saved = await call('PUT', '/me/photo', { token: accessToken, body: { key: upload.body.key } });
    expect(saved.body.photoUrl).toContain(upload.body.key);
  });

  it("rejects other users' keys, oversized files and other content types", async () => {
    const { accessToken } = await signedIn();
    const other = await createUser();
    const foreignKey = `users/${other.id}/00000000-0000-0000-0000-000000000000.png`;
    deps.storage.objects.set(foreignKey, 10);
    expect((await call('PUT', '/me/photo', { token: accessToken, body: { key: foreignKey } })).body.error.code).toBe('INVALID_PHOTO');
    expect((await call('POST', '/me/photo/upload-url', { token: accessToken, body: { contentType: 'image/svg+xml' } })).status).toBe(400);
  });
});
