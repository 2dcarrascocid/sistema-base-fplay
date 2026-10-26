import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../src/services/types';

const authApi = vi.hoisted(() => ({
  refresh: vi.fn(),
  login: vi.fn(),
  challenge: vi.fn(),
  logout: vi.fn(),
}));
const accountApi = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('../src/services/api', () => ({ authApi, accountApi }));

const { useSessionStore } = await import('../src/stores/session');
const { configureAuth } = await import('../src/services/http');

const me = (overrides: Partial<Me> = {}): Me =>
  ({
    user: { id: 'u1', email: 'a@b.cl', first_name: 'Ana', last_name: 'P', locale: null },
    role: 'admin',
    permissions: ['security.users:view'],
    menu: [],
    settings: { system_name: 'Sistema', default_locale: 'es' },
    pending: { passwordChange: false, mfaSetup: false },
    ...overrides,
  }) as Me;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  for (const fn of [...Object.values(authApi), accountApi.me]) fn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  configureAuth(null);
});

describe('session store', () => {
  it('restores the session from the refresh cookie on start', async () => {
    authApi.refresh.mockResolvedValue({ accessToken: 'tok', expiresIn: 600 });
    accountApi.me.mockResolvedValue(me());
    const session = useSessionStore();
    await session.init();
    expect(session.status).toBe('authenticated');
    expect(session.accessToken).toBe('tok');
    await session.init(); // only once
    expect(authApi.refresh).toHaveBeenCalledOnce();
  });

  it('is anonymous when there is no valid refresh cookie or /me fails', async () => {
    authApi.refresh.mockRejectedValue(new Error('401'));
    const session = useSessionStore();
    await session.init();
    expect(session.status).toBe('anonymous');

    setActivePinia(createPinia());
    authApi.refresh.mockResolvedValue({ accessToken: 'tok', expiresIn: 600 });
    accountApi.me.mockRejectedValue(new Error('500'));
    const other = useSessionStore();
    await other.init();
    expect(other.status).toBe('anonymous');
    expect(other.accessToken).toBeNull();
  });

  it('logs in directly or returns the challenge', async () => {
    const session = useSessionStore();
    authApi.login.mockResolvedValueOnce({ status: 'challenge', challenge: 'SOFTWARE_TOKEN_MFA', session: 's' });
    expect(await session.login('a@b.cl', 'x', 'c')).toMatchObject({ status: 'challenge' });
    expect(session.status).toBe('unknown');

    authApi.challenge.mockResolvedValueOnce({ status: 'authenticated', accessToken: 'tok', expiresIn: 600 });
    accountApi.me.mockResolvedValue(me());
    await session.answerChallenge('s', 'SOFTWARE_TOKEN_MFA', { code: '123456' });
    expect(session.status).toBe('authenticated');
    expect(authApi.challenge).toHaveBeenCalledWith('s', 'SOFTWARE_TOKEN_MFA', { code: '123456' });
  });

  it('refreshes the access token before it expires', async () => {
    authApi.login.mockResolvedValue({ status: 'authenticated', accessToken: 'first', expiresIn: 600 });
    authApi.refresh.mockResolvedValue({ accessToken: 'second', expiresIn: 600 });
    accountApi.me.mockResolvedValue(me());
    const session = useSessionStore();
    await session.login('a@b.cl', 'x', 'c');
    await vi.advanceTimersByTimeAsync(540_000);
    expect(session.accessToken).toBe('second');
  });

  it('shares one refresh between concurrent callers', async () => {
    let resolve!: (value: unknown) => void;
    authApi.refresh.mockReturnValue(new Promise((r) => (resolve = r)));
    const session = useSessionStore();
    const both = Promise.all([session.refresh(), session.refresh()]);
    resolve({ accessToken: 'tok', expiresIn: 600 });
    expect(await both).toEqual([true, true]);
    expect(authApi.refresh).toHaveBeenCalledOnce();
  });

  it('checks permissions as a UI hint; the superuser sees everything', async () => {
    const session = useSessionStore();
    authApi.login.mockResolvedValue({ status: 'authenticated', accessToken: 't', expiresIn: 600 });
    accountApi.me.mockResolvedValueOnce(me());
    await session.login('a', 'b', 'c');
    expect(session.can('security.users:view')).toBe(true);
    expect(session.can('security.users:edit')).toBe(false);
    accountApi.me.mockResolvedValueOnce(me({ role: 'superuser', permissions: [] }));
    await session.loadMe();
    expect(session.can('config.menus:edit')).toBe(true);
  });

  it('logs out, and flags a session lost on its own', async () => {
    authApi.login.mockResolvedValue({ status: 'authenticated', accessToken: 't', expiresIn: 600 });
    accountApi.me.mockResolvedValue(me());
    const session = useSessionStore();
    await session.login('a', 'b', 'c');
    session.sessionLost();
    expect(session.lost).toBe(true);
    expect(session.status).toBe('anonymous');

    await session.login('a', 'b', 'c');
    authApi.logout.mockResolvedValue(undefined);
    await session.logout();
    expect(session.lost).toBe(false);
    expect(session.accessToken).toBeNull();
  });

  it('completes a federated login with the cookie the API set', async () => {
    authApi.refresh.mockResolvedValue({ accessToken: 'tok', expiresIn: 600 });
    accountApi.me.mockResolvedValue(me());
    const session = useSessionStore();
    expect(await session.completeFederated()).toBe(true);
  });

  it('wires the HTTP client to the store', async () => {
    const session = useSessionStore();
    session.attach();
    authApi.refresh.mockResolvedValue({ accessToken: 'tok', expiresIn: 600 });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await session.refresh();
    const { http } = await import('../src/services/http');
    await http.get('/me');
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer tok' });
    vi.unstubAllGlobals();
  });
});
