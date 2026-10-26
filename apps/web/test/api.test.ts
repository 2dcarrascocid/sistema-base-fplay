import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountApi, adminApi, authApi } from '../src/services/api';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Method and URL of the last request. */
function last(): string {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return `${init?.method} ${String(url)}`;
}

describe('API endpoints', () => {
  it('auth', async () => {
    const calls: [() => Promise<unknown>, string][] = [
      [() => authApi.config(), 'GET /api/auth/config'],
      [() => authApi.login('a@b.cl', 'p', 'c'), 'POST /api/auth/login'],
      [() => authApi.challenge('s', 'SOFTWARE_TOKEN_MFA', { code: '1' }), 'POST /api/auth/challenge'],
      [() => authApi.mfaSetup('s'), 'POST /api/auth/mfa/setup'],
      [() => authApi.refresh(), 'POST /api/auth/refresh'],
      [() => authApi.logout(), 'POST /api/auth/logout'],
      [() => authApi.forgot('a@b.cl', 'c'), 'POST /api/auth/password/forgot'],
      [() => authApi.reset('a@b.cl', '1', 'p', 'c'), 'POST /api/auth/password/reset'],
      [() => authApi.acceptInvitation('t', 'p', 'c'), 'POST /api/auth/invitations/accept'],
      [() => authApi.register({ email: 'a@b.cl', firstName: 'A', lastName: 'B', captchaToken: 'c' }), 'POST /api/auth/register'],
    ];
    for (const [call, expected] of calls) {
      await call();
      expect(last()).toBe(expected);
    }
    expect(authApi.federatedStartUrl('apple')).toBe('/api/auth/federated/apple/start');
  });

  it('account', async () => {
    const calls: [() => Promise<unknown>, string][] = [
      [() => accountApi.me(), 'GET /api/me'],
      [() => accountApi.update({ firstName: 'A' }), 'PATCH /api/me'],
      [() => accountApi.changePassword('a', 'b'), 'POST /api/me/password'],
      [() => accountApi.sessions(), 'GET /api/me/sessions'],
      [() => accountApi.revokeSession('s/1'), 'DELETE /api/me/sessions/s%2F1'],
      [() => accountApi.revokeOtherSessions(), 'POST /api/me/sessions/revoke-others'],
      [() => accountApi.mfaSetup(), 'POST /api/me/mfa/setup'],
      [() => accountApi.mfaVerify('123456'), 'POST /api/me/mfa/verify'],
      [() => accountApi.mfaDisable(), 'DELETE /api/me/mfa'],
      [() => accountApi.photoUploadUrl('image/png'), 'POST /api/me/photo/upload-url'],
      [() => accountApi.setPhoto('k'), 'PUT /api/me/photo'],
    ];
    for (const [call, expected] of calls) {
      await call();
      expect(last()).toBe(expected);
    }
  });

  it('admin', async () => {
    const calls: [() => Promise<unknown>, string][] = [
      [() => adminApi.roles(), 'GET /api/admin/roles'],
      [() => adminApi.users({ search: 'ana', page: 2 }), 'GET /api/admin/users?search=ana&page=2'],
      [() => adminApi.exportUsers({ status: 'active' }), 'GET /api/admin/users/export?status=active'],
      [() => adminApi.user('u1'), 'GET /api/admin/users/u1'],
      [() => adminApi.userPermissions('u1'), 'GET /api/admin/users/u1/permissions'],
      [() => adminApi.createUser({ email: 'a@b.cl', firstName: 'A', lastName: 'B', secondLastName: null, rut: null, phone: null, jobTitle: null, role: 'client' }), 'POST /api/admin/users'],
      [() => adminApi.updateUser('u1', { firstName: 'A' }), 'PATCH /api/admin/users/u1'],
      [() => adminApi.setUserProfiles('u1', []), 'PUT /api/admin/users/u1/profiles'],
      [() => adminApi.userAction('u1', 'unlock'), 'POST /api/admin/users/u1/unlock'],
      [() => adminApi.catalog(), 'GET /api/admin/permission-catalog'],
      [() => adminApi.profiles({ status: 'active' }), 'GET /api/admin/profiles?status=active'],
      [() => adminApi.profile('p1'), 'GET /api/admin/profiles/p1'],
      [() => adminApi.profileUsers('p1'), 'GET /api/admin/profiles/p1/users'],
      [() => adminApi.createProfile({ name: 'P', description: null, menuActionIds: [] }), 'POST /api/admin/profiles'],
      [() => adminApi.updateProfile('p1', { name: 'Q' }), 'PATCH /api/admin/profiles/p1'],
      [() => adminApi.setProfilePermissions('p1', ['m']), 'PUT /api/admin/profiles/p1/permissions'],
      [() => adminApi.duplicateProfile('p1', 'Copia'), 'POST /api/admin/profiles/p1/duplicate'],
      [() => adminApi.setProfileActive('p1', false), 'POST /api/admin/profiles/p1/deactivate'],
      [() => adminApi.setProfileActive('p1', true), 'POST /api/admin/profiles/p1/activate'],
    ];
    for (const [call, expected] of calls) {
      await call();
      expect(last()).toBe(expected);
    }
  });
});
