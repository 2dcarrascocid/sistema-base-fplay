import type {
  CustomMessageTriggerEvent,
  PostAuthenticationTriggerEvent,
  PreAuthenticationTriggerEvent,
  PreSignUpTriggerEvent,
} from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { postAuthentication, preAuthentication } from '../src/triggers/authentication.js';
import { customMessage } from '../src/triggers/custom-message.js';
import { preSignUp } from '../src/triggers/pre-sign-up.js';
import { auditEvents, authDb, createSession, createUser, makeDeps, ownerDb } from './helpers.js';

const deps = makeDeps(authDb);

afterEach(async () => {
  await ownerDb.updateTable('app.app_settings').set({ self_registration_enabled: false }).execute();
  await ownerDb.updateTable('app.security_policy').set({ max_failed_attempts: 5 }).execute();
  await ownerDb.updateTable('app.roles').set({ mfa_required: false }).where('code', '=', 'client').execute();
});

function signUpEvent(userName: string, attributes: Record<string, string>, source = 'PreSignUp_ExternalProvider'): PreSignUpTriggerEvent {
  return { triggerSource: source, userName, request: { userAttributes: attributes }, response: {} } as unknown as PreSignUpTriggerEvent;
}

describe('Pre sign-up: linked accounts', () => {
  it('links a Google sign-in to the existing user with the same verified email (one user)', async () => {
    const user = await createUser();
    const googleId = randomUUID();
    await preSignUp(deps, signUpEvent(`Google_${googleId}`, { email: user.email.toUpperCase(), email_verified: 'true' }));

    expect(deps.cognito.called('adminLinkProvider').at(-1)!.args).toEqual([user.sub, 'Google', googleId]);
    const identities = await ownerDb
      .selectFrom('app.user_identities')
      .select(['provider', 'provider_subject'])
      .where('user_id', '=', user.id)
      .orderBy('provider')
      .execute();
    expect(identities).toEqual([
      { provider: 'google', provider_subject: googleId },
      { provider: 'local', provider_subject: user.sub },
    ]);
    expect(await auditEvents(user.id)).toContain('auth.identity.linked');
  });

  it('activates an invited user who signs in with a verified provider email', async () => {
    const user = await createUser({ status: 'invited' });
    await preSignUp(deps, signUpEvent(`Facebook_${randomUUID()}`, { email: user.email }));
    const row = await ownerDb.selectFrom('app.users').select('status').where('id', '=', user.id).executeTakeFirstOrThrow();
    expect(row.status).toBe('active');
  });

  it('rejects unverified emails, unknown users, inactive users and roles that require MFA', async () => {
    await expect(preSignUp(deps, signUpEvent(`Google_${randomUUID()}`, { email: 'x@test.cl', email_verified: 'false' }))).rejects.toThrow('EMAIL_NOT_VERIFIED');
    await expect(preSignUp(deps, signUpEvent(`Google_${randomUUID()}`, { email: 'nobody@test.cl', email_verified: 'true' }))).rejects.toThrow('NOT_REGISTERED');
    const inactive = await createUser({ status: 'inactive' });
    await expect(preSignUp(deps, signUpEvent(`Google_${randomUUID()}`, { email: inactive.email, email_verified: 'true' }))).rejects.toThrow('ACCOUNT_DISABLED');
    const admin = await createUser({ role: 'admin', mfaEnabled: true });
    await expect(preSignUp(deps, signUpEvent(`Google_${randomUUID()}`, { email: admin.email, email_verified: 'true' }))).rejects.toThrow(
      'MFA_REQUIRED_USE_PASSWORD',
    );
  });

  it('blocks public sign-up and lets our own AdminCreateUser through', async () => {
    await expect(preSignUp(deps, signUpEvent('x@test.cl', {}, 'PreSignUp_SignUp'))).rejects.toThrow('SIGNUP_DISABLED');
    const event = signUpEvent('x@test.cl', {}, 'PreSignUp_AdminCreateUser');
    expect(await preSignUp(deps, event)).toBe(event);
    await expect(preSignUp(deps, signUpEvent('Twitter_1', { email: 'x@test.cl' }))).rejects.toThrow('LOGIN_FAILED');
  });

  it('with self registration, creates the client, its native Cognito user and both identities', async () => {
    await ownerDb.updateTable('app.app_settings').set({ self_registration_enabled: true }).execute();
    const email = `apple-${randomUUID()}@test.cl`;
    const appleId = `00${randomUUID()}`;
    await preSignUp(deps, signUpEvent(`SignInWithApple_${appleId}`, { email, email_verified: 'true', given_name: 'Ana' }));

    const user = await ownerDb.selectFrom('app.users').select(['id', 'status', 'first_name', 'role_id']).where('email', '=', email).executeTakeFirstOrThrow();
    expect(user).toMatchObject({ status: 'active', first_name: 'Ana', role_id: 3 });
    const providers = await ownerDb.selectFrom('app.user_identities').select('provider').where('user_id', '=', user.id).orderBy('provider').execute();
    expect(providers.map((p) => p.provider)).toEqual(['apple', 'local']);
  });

  it('self registration is refused when clients require MFA', async () => {
    await ownerDb.updateTable('app.app_settings').set({ self_registration_enabled: true }).execute();
    await ownerDb.updateTable('app.roles').set({ mfa_required: true }).where('code', '=', 'client').execute();
    await expect(preSignUp(deps, signUpEvent(`Google_${randomUUID()}`, { email: `n-${randomUUID()}@test.cl`, email_verified: 'true' }))).rejects.toThrow(
      'MFA_REQUIRED_USE_PASSWORD',
    );
  });
});

function authEvent<T>(sub: string, clientId = 'web-client'): T {
  return { request: { userAttributes: { sub } }, callerContext: { clientId }, response: {} } as unknown as T;
}

describe('Pre/Post authentication: lockout', () => {
  it('locks the account after the configured failed attempts, revokes sessions and emails the user', async () => {
    await ownerDb.updateTable('app.security_policy').set({ max_failed_attempts: 3 }).execute();
    const user = await createUser();
    const { sessionId } = await createSession(user);
    const attempt = () => preAuthentication(deps, authEvent<PreAuthenticationTriggerEvent>(user.sub));

    for (let i = 0; i < 3; i++) await attempt(); // three wrong passwords: no Post authentication follows
    await expect(attempt()).rejects.toThrow('ACCOUNT_LOCKED');
    await expect(attempt()).rejects.toThrow('ACCOUNT_LOCKED');

    const row = await ownerDb.selectFrom('app.users').select('locked_until').where('id', '=', user.id).executeTakeFirstOrThrow();
    expect(row.locked_until!.getTime()).toBeGreaterThan(Date.now());
    const session = await ownerDb.selectFrom('app.user_sessions').select('revoked_reason').where('id', '=', sessionId).executeTakeFirstOrThrow();
    expect(session.revoked_reason).toBe('locked');
    expect(deps.mailer.sent.at(-1)).toMatchObject({ to: user.email, subject: expect.stringContaining('bloqueada') });
    expect(await auditEvents(user.id)).toContain('auth.locked');
  });

  it('a successful sign-in resets the counter', async () => {
    await ownerDb.updateTable('app.security_policy').set({ max_failed_attempts: 3 }).execute();
    const user = await createUser();
    const attempt = () => preAuthentication(deps, authEvent<PreAuthenticationTriggerEvent>(user.sub));
    await attempt();
    await attempt();
    await postAuthentication(deps, authEvent<PostAuthenticationTriggerEvent>(user.sub));
    for (let i = 0; i < 3; i++) await attempt();
    const row = await ownerDb.selectFrom('app.users').select(['locked_until', 'failed_login_count']).where('id', '=', user.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ locked_until: null, failed_login_count: 3 });
    expect(await auditEvents(user.id)).toContain('auth.login.success');
  });

  it('rejects unknown and inactive users, and non-client roles on the mobile client', async () => {
    await expect(preAuthentication(deps, authEvent('missing'))).rejects.toThrow('NOT_REGISTERED');
    const inactive = await createUser({ status: 'inactive' });
    await expect(preAuthentication(deps, authEvent(inactive.sub))).rejects.toThrow('ACCOUNT_DISABLED');
    const admin = await createUser({ role: 'admin', mfaEnabled: true });
    await expect(preAuthentication(deps, authEvent(admin.sub, 'mobile-client'))).rejects.toThrow('ROLE_NOT_ALLOWED');
    await expect(postAuthentication(deps, authEvent('missing'))).rejects.toThrow('NOT_REGISTERED');
  });
});

describe('Custom message', () => {
  function messageEvent(sub: string, triggerSource = 'CustomMessage_ForgotPassword'): CustomMessageTriggerEvent {
    return {
      triggerSource,
      request: { userAttributes: { sub }, codeParameter: '{####}' },
      response: { emailSubject: null, emailMessage: null },
    } as unknown as CustomMessageTriggerEvent;
  }

  it('renders the password reset template in the user language with the code placeholder', async () => {
    const user = await createUser();
    await ownerDb.updateTable('app.users').set({ locale: 'en' }).where('id', '=', user.id).execute();
    const event = await customMessage(deps, messageEvent(user.sub));
    expect(event.response.emailSubject).toBe('Password recovery for Sistema Base');
    expect(event.response.emailMessage).toContain('{####}');
    expect(event.response.emailMessage).toContain('1 hour');
  });

  it('leaves other messages and unknown users untouched', async () => {
    const other = await customMessage(deps, messageEvent('x', 'CustomMessage_SignUp'));
    expect(other.response.emailMessage).toBeNull();
    const unknown = await customMessage(deps, messageEvent('missing'));
    expect(unknown.response.emailMessage).toBeNull();
  });
});
