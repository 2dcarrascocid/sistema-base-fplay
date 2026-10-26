import { describe, expect, it } from 'vitest';
import { authRoutes } from '../src/auth/routes.js';
import { COOKIES } from '../src/lib/cookies.js';
import { sha256 } from '../src/lib/crypto.js';
import { authDb, caller, cookieValue, createUser, makeDeps, ownerDb, randomIp, WEB_URL, type TestUser } from './helpers.js';

const deps = makeDeps(authDb);
const call = caller(authRoutes(deps));
const PASSWORD = 'Valid-Pass-2026!';

async function userWithPassword(options: Parameters<typeof createUser>[0] = {}): Promise<TestUser> {
  const user = await createUser(options);
  deps.cognito.passwords.set(user.email, PASSWORD);
  deps.cognito.subs.set(user.email, user.sub);
  return user;
}

const login = (email: string, password = PASSWORD, ip = randomIp()) =>
  call('POST', '/auth/login', { body: { email, password, captchaToken: 'captcha-ok' }, ip });

function refreshOptions(refreshToken: string | undefined, csrf = 'csrf-1') {
  return {
    headers: { Origin: WEB_URL, 'X-CSRF-Token': csrf },
    cookies: { ...(refreshToken ? { [COOKIES.refresh]: refreshToken } : {}), [COOKIES.csrf]: csrf },
  };
}

describe('POST /auth/login', () => {
  it('creates a web session: access token in the body, refresh token only in an HttpOnly cookie', async () => {
    const user = await userWithPassword();
    const response = await login(user.email.toUpperCase());
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'authenticated', accessToken: expect.stringContaining(user.sub), expiresIn: 600 });
    expect(JSON.stringify(response.body)).not.toContain('rt-');

    const refreshCookie = response.cookies.find((c) => c.startsWith(COOKIES.refresh))!;
    expect(refreshCookie).toMatch(/HttpOnly/);
    expect(refreshCookie).toMatch(/Secure/);
    expect(refreshCookie).toMatch(/SameSite=Strict/);
    expect(refreshCookie).toMatch(/Path=\/api\/auth/);
    expect(cookieValue(response.cookies, COOKIES.csrf)).toBeTruthy();

    const session = await ownerDb.selectFrom('app.user_sessions').selectAll().where('user_id', '=', user.id).executeTakeFirstOrThrow();
    expect(session.client_type).toBe('web');
    expect(session.refresh_token_hash).toEqual(sha256(cookieValue(response.cookies, COOKIES.refresh)!));
  });

  it('answers wrong password and unknown email with the same generic error and audits the failure', async () => {
    const user = await userWithPassword();
    const wrong = await login(user.email, 'Wrong-Pass-2026!');
    const unknown = await login('nobody@test.cl');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    const failures = await ownerDb
      .selectFrom('app.audit_log')
      .select('result')
      .where('event_type', '=', 'auth.login.failure')
      .where('actor_email', '=', user.email)
      .execute();
    expect(failures).toEqual([{ result: 'failure' }]);
  });

  it('requires a valid captcha before contacting Cognito', async () => {
    const before = deps.cognito.called('initiatePasswordAuth').length;
    const response = await call('POST', '/auth/login', { body: { email: 'a@test.cl', password: 'x', captchaToken: 'bad' } });
    expect(response.body.error.code).toBe('CAPTCHA_FAILED');
    expect(deps.cognito.called('initiatePasswordAuth')).toHaveLength(before);
  });

  it('validates input without echoing it', async () => {
    const response = await call('POST', '/auth/login', { body: { email: 'not-an-email', password: '' } });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('not-an-email');
  });

  it('rate limits attempts per email', async () => {
    const user = await userWithPassword();
    for (let i = 0; i < 10; i++) await login(user.email, 'Wrong-Pass-2026!');
    expect((await login(user.email)).status).toBe(429);
  });

  it('refuses inactive users even if Cognito accepts the password, and revokes the tokens', async () => {
    const user = await userWithPassword({ status: 'inactive' });
    const response = await login(user.email);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(deps.cognito.called('revokeToken').length).toBeGreaterThan(0);
  });

  it('maps Cognito throttling to 429', async () => {
    const user = await userWithPassword();
    const { CognitoError } = await import('../src/lib/ports.js');
    deps.cognito.failNext = new CognitoError('too_many_requests');
    expect((await login(user.email)).status).toBe(429);
  });
});

describe('login challenges', () => {
  it('SOFTWARE_TOKEN_MFA: a TOTP code is required', async () => {
    const user = await userWithPassword();
    deps.cognito.challengeFor.set(user.email, 'SOFTWARE_TOKEN_MFA');
    const first = await login(user.email);
    expect(first.body).toMatchObject({ status: 'challenge', challenge: 'SOFTWARE_TOKEN_MFA' });
    expect(first.body.session).not.toContain('cognito-session');

    const answer = (code: string) =>
      call('POST', '/auth/challenge', { body: { session: first.body.session, challenge: 'SOFTWARE_TOKEN_MFA', code } });
    expect((await answer('000000')).body.error.code).toBe('INVALID_CODE');
    expect((await answer('123456')).body.status).toBe('authenticated');
  });

  it('MFA_SETUP: an administrator without MFA must enrol before getting a session', async () => {
    const admin = await userWithPassword({ role: 'admin', mfaEnabled: false });
    const first = await login(admin.email);
    expect(first.body).toMatchObject({ status: 'challenge', challenge: 'MFA_SETUP' });
    expect(first.cookies).toEqual([]);

    const setup = await call('POST', '/auth/mfa/setup', { body: { session: first.body.session } });
    expect(setup.body.secretCode).toBe('JBSWY3DPEHPK3PXP');
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/.+secret=JBSWY3DPEHPK3PXP/);

    const answer = (code: string) => call('POST', '/auth/challenge', { body: { session: first.body.session, challenge: 'MFA_SETUP', code } });
    expect((await answer('999999')).body.error.code).toBe('INVALID_CODE');
    const done = await answer('123456');
    expect(done.body.status).toBe('authenticated');
    const row = await ownerDb.selectFrom('app.users').select('mfa_enabled').where('id', '=', admin.id).executeTakeFirstOrThrow();
    expect(row.mfa_enabled).toBe(true);
  });

  it('PASSWORD_CHANGE: first login forces a new password that meets the policy', async () => {
    const user = await userWithPassword({ mustChangePassword: true });
    const first = await login(user.email);
    expect(first.body.challenge).toBe('PASSWORD_CHANGE');
    const answer = (newPassword: string) =>
      call('POST', '/auth/challenge', { body: { session: first.body.session, challenge: 'PASSWORD_CHANGE', newPassword } });

    expect((await answer('short')).body.error).toMatchObject({ code: 'PASSWORD_POLICY', details: expect.arrayContaining(['too_short']) });
    expect((await answer('Password-1234!')).body.error.details).toEqual(['breached']);
    expect((await answer('Brand-New-Pass-2026!')).body.status).toBe('authenticated');
    const row = await ownerDb.selectFrom('app.users').select('must_change_password').where('id', '=', user.id).executeTakeFirstOrThrow();
    expect(row.must_change_password).toBe(false);
  });

  it('NEW_PASSWORD_REQUIRED from Cognito is answered with a policy-checked password', async () => {
    const user = await userWithPassword();
    deps.cognito.challengeFor.set(user.email, 'NEW_PASSWORD_REQUIRED');
    const first = await login(user.email);
    const response = await call('POST', '/auth/challenge', {
      body: { session: first.body.session, challenge: 'NEW_PASSWORD_REQUIRED', newPassword: 'Brand-New-Pass-2026!' },
    });
    expect(response.body.status).toBe('authenticated');
  });

  it('rejects tampered sessions, mismatched challenges and missing answers', async () => {
    const user = await userWithPassword();
    deps.cognito.challengeFor.set(user.email, 'SOFTWARE_TOKEN_MFA');
    const { session } = (await login(user.email)).body;
    const post = (body: object) => call('POST', '/auth/challenge', { body });
    expect((await post({ session: `${session}x`, challenge: 'SOFTWARE_TOKEN_MFA', code: '123456' })).body.error.code).toBe('INVALID_SESSION');
    expect((await post({ session, challenge: 'MFA_SETUP', code: '123456' })).body.error.code).toBe('INVALID_SESSION');
    expect((await post({ session, challenge: 'SOFTWARE_TOKEN_MFA' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await call('POST', '/auth/mfa/setup', { body: { session } })).body.error.code).toBe('INVALID_SESSION');
  });
});

describe('refresh and logout', () => {
  async function loggedIn() {
    const user = await userWithPassword();
    const response = await login(user.email);
    return { user, refreshToken: cookieValue(response.cookies, COOKIES.refresh)! };
  }

  it('issues a new access token from the refresh cookie', async () => {
    const { user, refreshToken } = await loggedIn();
    const response = await call('POST', '/auth/refresh', refreshOptions(refreshToken));
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toContain(user.sub);
    expect(deps.cognito.called('refresh').at(-1)!.args).toEqual([refreshToken, user.sub]);
  });

  it('enforces CSRF protection', async () => {
    const { refreshToken } = await loggedIn();
    const crossSite = await call('POST', '/auth/refresh', {
      headers: { Origin: 'https://evil.example', 'X-CSRF-Token': 'c' },
      cookies: { [COOKIES.refresh]: refreshToken, [COOKIES.csrf]: 'c' },
    });
    expect(crossSite.status).toBe(403);
    const noHeader = await call('POST', '/auth/refresh', { headers: { Origin: WEB_URL }, cookies: { [COOKIES.refresh]: refreshToken, [COOKIES.csrf]: 'c' } });
    expect(noHeader.body.error.code).toBe('CSRF_TOKEN');
  });

  it('expires idle sessions and clears the cookies', async () => {
    const { user, refreshToken } = await loggedIn();
    await ownerDb.updateTable('app.user_sessions').set({ last_seen_at: new Date(Date.now() - 86_400_000) }).where('user_id', '=', user.id).execute();
    const response = await call('POST', '/auth/refresh', refreshOptions(refreshToken));
    expect(response.status).toBe(401);
    expect(cookieValue(response.cookies, COOKIES.refresh)).toBeUndefined();
    const session = await ownerDb.selectFrom('app.user_sessions').select('revoked_reason').where('user_id', '=', user.id).executeTakeFirstOrThrow();
    expect(session.revoked_reason).toBe('idle');
  });

  it('rejects unknown, expired and locked-user sessions', async () => {
    expect((await call('POST', '/auth/refresh', refreshOptions(undefined))).status).toBe(401);
    expect((await call('POST', '/auth/refresh', refreshOptions('rt-unknown'))).status).toBe(401);

    const expired = await loggedIn();
    await ownerDb.updateTable('app.user_sessions').set({ expires_at: new Date(Date.now() - 1000) }).where('user_id', '=', expired.user.id).execute();
    expect((await call('POST', '/auth/refresh', refreshOptions(expired.refreshToken))).status).toBe(401);

    const locked = await loggedIn();
    await ownerDb.updateTable('app.users').set({ locked_until: new Date(Date.now() + 60_000) }).where('id', '=', locked.user.id).execute();
    expect((await call('POST', '/auth/refresh', refreshOptions(locked.refreshToken))).status).toBe(401);
  });

  it('logout revokes the refresh token and the session; the cookie stops working', async () => {
    const { user, refreshToken } = await loggedIn();
    const response = await call('POST', '/auth/logout', refreshOptions(refreshToken));
    expect(response.status).toBe(204);
    expect(cookieValue(response.cookies, COOKIES.refresh)).toBeUndefined();
    expect(deps.cognito.called('revokeToken').at(-1)!.args).toEqual([refreshToken]);
    const session = await ownerDb.selectFrom('app.user_sessions').select('revoked_reason').where('user_id', '=', user.id).executeTakeFirstOrThrow();
    expect(session.revoked_reason).toBe('logout');
    expect((await call('POST', '/auth/refresh', refreshOptions(refreshToken))).status).toBe(401);
  });

  it('logout without a cookie still clears cookies', async () => {
    expect((await call('POST', '/auth/logout', refreshOptions(undefined))).status).toBe(204);
  });
});
