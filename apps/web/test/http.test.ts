import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, configureAuth, http, readCookie } from '../src/services/http';

function reply(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  configureAuth(null);
  vi.unstubAllGlobals();
});

describe('http client', () => {
  it('sends the in-memory token, JSON body and query, same-origin', async () => {
    configureAuth({ getToken: () => 'tok', refresh: async () => true, onSessionLost: () => {} });
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));
    const result = await http.post('/x', { a: 1 }, { query: { page: 2, empty: '', none: undefined } });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/x?page=2');
    expect(init?.credentials).toBe('same-origin');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    expect(init?.body).toBe('{"a":1}');
  });

  it('does not send the token on public calls', async () => {
    configureAuth({ getToken: () => 'tok', refresh: async () => true, onSessionLost: () => {} });
    fetchMock.mockResolvedValueOnce(reply(204));
    await http.post('/auth/login', {}, { auth: false });
    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('adds the CSRF header from the cookie for cookie-authenticated calls', async () => {
    // happy-dom refuses __Secure- cookies outside HTTPS; the browser exposes it to JS (not HttpOnly).
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('other=1; __Secure-bf_csrf=abc123');
    fetchMock.mockResolvedValueOnce(reply(200, {}));
    await http.post('/auth/refresh', undefined, { auth: false, csrf: true });
    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe('abc123');
  });

  it('refreshes once on 401 and retries the request', async () => {
    let token = 'old';
    const refresh = vi.fn(async () => {
      token = 'new';
      return true;
    });
    configureAuth({ getToken: () => token, refresh, onSessionLost: vi.fn() });
    fetchMock.mockResolvedValueOnce(reply(401, { error: { code: 'SESSION_INVALID' } })).mockResolvedValueOnce(reply(200, { ok: 1 }));
    expect(await http.get('/me')).toEqual({ ok: 1 });
    expect(refresh).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[1]![1]?.headers as Record<string, string>)['Authorization']).toBe('Bearer new');
  });

  it('ends the session when the refresh fails', async () => {
    const onSessionLost = vi.fn();
    configureAuth({ getToken: () => 't', refresh: async () => false, onSessionLost });
    fetchMock.mockResolvedValueOnce(reply(401, { error: { code: 'SESSION_INVALID' } }));
    await expect(http.get('/me')).rejects.toMatchObject({ status: 401, code: 'SESSION_INVALID' });
    expect(onSessionLost).toHaveBeenCalledOnce();
  });

  it('turns error bodies into ApiError with code and details', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: { code: 'PASSWORD_POLICY', details: ['too_short'], requestId: 'r1' } }));
    const error = await http.post('/x', {}, { auth: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'PASSWORD_POLICY', details: ['too_short'], requestId: 'r1' });

    fetchMock.mockResolvedValueOnce(reply(502, 'Bad gateway', { 'Content-Type': 'text/plain' }));
    await expect(http.get('/x', { auth: false })).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    fetchMock.mockResolvedValueOnce(reply(404, 'nope', { 'Content-Type': 'text/plain' }));
    await expect(http.get('/x', { auth: false })).rejects.toMatchObject({ code: 'HTTP_ERROR' });
  });

  it('returns blobs for downloads and undefined for 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response('a;b', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    const blob = await http.get<Blob>('/admin/users/export', { auth: false, blob: true });
    expect(await blob.text()).toBe('a;b');
    fetchMock.mockResolvedValueOnce(reply(204));
    expect(await http.delete('/x', { auth: false })).toBeUndefined();
    fetchMock.mockResolvedValueOnce(reply(200, undefined, { 'Content-Length': '0' }));
    expect(await http.put('/x', {}, { auth: false })).toBeUndefined();
    fetchMock.mockResolvedValueOnce(reply(200, { a: 1 }));
    expect(await http.patch('/x', {}, { auth: false })).toEqual({ a: 1 });
  });

  it('reads cookies by name', () => {
    expect(readCookie('b', 'a=1; b=x%20y; c=3')).toBe('x y');
    expect(readCookie('z', 'a=1')).toBeNull();
  });
});
