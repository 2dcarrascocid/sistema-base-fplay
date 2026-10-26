import { afterEach, describe, expect, it } from 'vitest';
import { authRoutes } from '../src/auth/routes.js';
import { COOKIES } from '../src/lib/cookies.js';
import { randomToken, sha256 } from '../src/lib/crypto.js';
import { auditEvents, authDb, caller, cookieValue, createSession, createUser, makeDeps, ownerDb, WEB_URL } from './helpers.js';

const deps = makeDeps(authDb);
const call = caller(authRoutes(deps));

afterEach(async () => {
  await ownerDb.updateTable('app.app_settings').set({ self_registration_enabled: false }).execute();
});

describe('public config', () => {
  it('exposes branding and enabled providers for the login page, nothing else', async () => {
    const response = await call('GET', '/auth/config');
    expect(response.body).toEqual({
      systemName: 'Sistema Base',
      logoUrl: null,
      primaryColor: '#1565C0',
      secondaryColor: '#424242',
      defaultLocale: 'es',
      selfRegistration: false,
      providers: ['google'],
    });
  });
});

describe('federated login (web)', () => {
  async function startLogin(provider = 'google') {
    const response = await call('GET', '/auth/federated/{provider}/start', { pathParameters: { provider } });
    const location = new URL(response.headers['Location']!);
    return { response, location, oauthCookie: cookieValue(response.cookies, COOKIES.oauth)! };
  }

  it('redirects to Cognito with PKCE, state and the provider', async () => {
    const { response, location, oauthCookie } = await startLogin('apple');
    expect(response.status).toBe(302);
    expect(location.origin).toBe('https://auth.example.test');
    expect(location.searchParams.get('identity_provider')).toBe('SignInWithApple');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('redirect_uri')).toBe(`${WEB_URL}/api/auth/federated/callback`);
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(response.cookies[0]).toMatch(/SameSite=Lax; HttpOnly; Max-Age=600/);
    expect(oauthCookie).not.toContain(location.searchParams.get('state')!);
  });

  it('rejects unknown providers', async () => {
    expect((await call('GET', '/auth/federated/{provider}/start', { pathParameters: { provider: 'twitter' } })).status).toBe(400);
  });

  async function finish(sub: string, options: { state?: string } = {}) {
    const { location, oauthCookie } = await startLogin();
    return call('GET', '/auth/federated/callback', {
      query: { code: `code-${sub}`, state: options.state ?? location.searchParams.get('state')! },
      cookies: { [COOKIES.oauth]: oauthCookie },
    });
  }

  it('creates the session and redirects to the web without tokens in the URL', async () => {
    const client = await createUser();
    const response = await finish(client.sub);
    expect(response.status).toBe(302);
    expect(response.headers['Location']).toBe(`${WEB_URL}/auth/callback`);
    expect(cookieValue(response.cookies, COOKIES.refresh)).toBeTruthy();
    expect(cookieValue(response.cookies, COOKIES.oauth)).toBeUndefined();
    expect(await auditEvents(client.id)).toContain('auth.login.federated');
  });

  it('rejects a state that does not match the cookie', async () => {
    const client = await createUser();
    const response = await finish(client.sub, { state: 'forged' });
    expect(response.headers['Location']).toBe(`${WEB_URL}/login?error=INVALID_STATE`);
  });

  it('refuses federated login for roles that require MFA', async () => {
    const admin = await createUser({ role: 'admin', mfaEnabled: true });
    const response = await finish(admin.sub);
    expect(response.headers['Location']).toBe(`${WEB_URL}/login?error=MFA_REQUIRED_USE_PASSWORD`);
    expect(cookieValue(response.cookies, COOKIES.refresh)).toBeUndefined();
  });

  it('maps unknown users and hosted UI errors to login error codes', async () => {
    expect((await finish('unknown-sub')).headers['Location']).toBe(`${WEB_URL}/login?error=NOT_REGISTERED`);
    const error = await call('GET', '/auth/federated/callback', {
      query: { error: 'invalid_request', error_description: 'PreSignUp failed with error NOT_REGISTERED.' },
    });
    expect(error.headers['Location']).toBe(`${WEB_URL}/login?error=NOT_REGISTERED`);
  });
});

describe('password recovery', () => {
  const forgot = (email: string) => call('POST', '/auth/password/forgot', { body: { email, captchaToken: 'captcha-ok' } });

  it('always answers 202 and only sends the code to active users', async () => {
    const active = await createUser();
    const inactive = await createUser({ status: 'inactive' });
    const before = deps.cognito.called('forgotPassword').length;
    expect((await forgot(active.email)).status).toBe(202);
    expect((await forgot(inactive.email)).status).toBe(202);
    expect((await forgot('nobody@test.cl')).status).toBe(202);
    expect(deps.cognito.called('forgotPassword').slice(before).map((c) => c.args[0])).toEqual([active.email]);
  });

  const reset = (email: string, code: string, newPassword = 'Recovered-Pass-2026!') =>
    call('POST', '/auth/password/reset', { body: { email, code, newPassword, captchaToken: 'captcha-ok' } });

  it('resets the password, closes every session and signs out of Cognito', async () => {
    const user = await createUser();
    const { sessionId } = await createSession(user);
    expect((await reset(user.email, '000000')).body.error.code).toBe('INVALID_CODE');
    expect((await reset(user.email, '654321')).status).toBe(204);

    const session = await ownerDb.selectFrom('app.user_sessions').select('revoked_reason').where('id', '=', sessionId).executeTakeFirstOrThrow();
    expect(session.revoked_reason).toBe('password_change');
    expect(deps.cognito.called('adminGlobalSignOut').at(-1)!.args).toEqual([user.sub]);
    expect(await auditEvents(user.id)).toEqual(expect.arrayContaining(['auth.password.reset']));
  });

  it('rejects breached passwords and unknown users', async () => {
    const user = await createUser();
    expect((await reset(user.email, '654321', 'Password-1234!')).body.error.details).toEqual(['breached']);
    expect((await reset('nobody@test.cl', '654321')).body.error.code).toBe('INVALID_CODE');
  });
});

describe('invitations', () => {
  async function invitedUser(expiresInMs = 3_600_000) {
    const user = await createUser({ status: 'invited' });
    const token = randomToken();
    await ownerDb
      .insertInto('app.invitations')
      .values({ user_id: user.id, token_hash: sha256(token), expires_at: new Date(Date.now() + expiresInMs) })
      .execute();
    return { user, token };
  }

  const accept = (token: string, password = 'Activated-Pass-2026!') =>
    call('POST', '/auth/invitations/accept', { body: { token, password, captchaToken: 'captcha-ok' } });

  it('activates the account with the chosen password; the link works once', async () => {
    const { user, token } = await invitedUser();
    expect((await accept(token)).status).toBe(204);
    const row = await ownerDb.selectFrom('app.users').select(['status', 'must_change_password']).where('id', '=', user.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ status: 'active', must_change_password: false });
    expect(deps.cognito.called('adminSetPassword').at(-1)!.args).toEqual([user.sub]);
    expect(deps.cognito.called('adminMarkEmailVerified').at(-1)!.args).toEqual([user.sub]);
    expect((await accept(token)).body.error.code).toBe('INVITATION_INVALID');
  });

  it('rejects expired invitations and weak passwords', async () => {
    const expired = await invitedUser(-1000);
    expect((await accept(expired.token)).body.error.code).toBe('INVITATION_INVALID');
    const valid = await invitedUser();
    expect((await accept(valid.token, 'weak')).body.error.code).toBe('PASSWORD_POLICY');
  });
});

describe('self registration', () => {
  const register = (email: string) =>
    call('POST', '/auth/register', { body: { email, firstName: 'Ana', lastName: 'Pérez', captchaToken: 'captcha-ok' } });

  it('is not available while disabled', async () => {
    expect((await register('new@test.cl')).status).toBe(404);
  });

  it('creates an invited client and emails the activation link (token only in the URL fragment)', async () => {
    await ownerDb.updateTable('app.app_settings').set({ self_registration_enabled: true }).execute();
    const email = `self-${Date.now()}@test.cl`;
    expect((await register(email)).status).toBe(202);

    const user = await ownerDb
      .selectFrom('app.users as u')
      .innerJoin('app.roles as r', 'r.id', 'u.role_id')
      .select(['u.id', 'u.status', 'r.code'])
      .where('u.email', '=', email)
      .executeTakeFirstOrThrow();
    expect(user).toMatchObject({ status: 'invited', code: 'client' });
    const mail = deps.mailer.sent.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.html).toContain(`${WEB_URL}/activate#token=`);
    expect(mail.subject).toContain('Sistema Base');
  });

  it('answers the same for an existing email without creating anything', async () => {
    await ownerDb.updateTable('app.app_settings').set({ self_registration_enabled: true }).execute();
    const existing = await createUser();
    const before = deps.cognito.called('adminCreateUser').length;
    expect((await register(existing.email)).status).toBe(202);
    expect(deps.cognito.called('adminCreateUser')).toHaveLength(before);
  });

  it('removes the Cognito user if the database step fails', async () => {
    await ownerDb.updateTable('app.app_settings').set({ self_registration_enabled: true }).execute();
    const failingDeps = { ...deps, mailer: { send: async () => Promise.reject(new Error('SES down')) } };
    const failingCall = caller(authRoutes(failingDeps));
    const { vi } = await import('vitest');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await failingCall('POST', '/auth/register', {
      body: { email: `fail-${Date.now()}@test.cl`, firstName: 'A', lastName: 'B', captchaToken: 'captcha-ok' },
    });
    vi.restoreAllMocks();
    expect(response.status).toBe(500);
    expect(deps.cognito.called('adminDeleteUser')).toHaveLength(1);
  });
});
