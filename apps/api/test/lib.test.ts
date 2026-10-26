import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { federatedErrorCode } from '../src/auth/federated.js';
import { loadConfig } from '../src/lib/config.js';
import { clearCookie, COOKIES, parseCookies, serializeCookie } from '../src/lib/cookies.js';
import { cognitoSecretHash, open, pkceChallenge, safeEqual, seal, sha256 } from '../src/lib/crypto.js';
import { AppError } from '../src/lib/errors.js';
import { pwnedPasswordsChecker, turnstileVerifier } from '../src/lib/external.js';
import { createRouter, errorResponse, json, toRequest } from '../src/lib/http.js';
import { logger, redact } from '../src/lib/logger.js';
import { assertCsrf, rejectionFor } from '../src/lib/security.js';
import { buildMenuTree, type MenuRow } from '../src/me/menu.js';
import { parseFederatedUsername } from '../src/triggers/pre-sign-up.js';
import { apiEvent } from './helpers.js';

describe('crypto', () => {
  const key = randomBytes(32);

  it('seals and opens data for the same purpose', () => {
    const sealed = seal(key, 'p', { a: 1 }, 60);
    expect(open(key, 'p', sealed)).toEqual({ a: 1 });
  });

  it('rejects another purpose, another key, tampering and expiry', () => {
    const sealed = seal(key, 'p', { a: 1 }, 60);
    expect(open(key, 'other', sealed)).toBeNull();
    expect(open(randomBytes(32), 'p', sealed)).toBeNull();
    const tampered = Buffer.from(sealed, 'base64url');
    tampered[tampered.length - 1]! ^= 1;
    expect(open(key, 'p', tampered.toString('base64url'))).toBeNull();
    expect(open(key, 'p', sealed, Date.now() + 61_000)).toBeNull();
    expect(open(key, 'p', 'short')).toBeNull();
  });

  it('computes RFC 7636 PKCE challenges', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('compares strings in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('hashes values', () => {
    expect(sha256('x')).toHaveLength(32);
    expect(cognitoSecretHash('secret', 'user', 'client')).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('cookies', () => {
  it('serializes secure cookies', () => {
    expect(serializeCookie(COOKIES.refresh, 'a b', { path: '/api/auth', httpOnly: true, sameSite: 'Strict', maxAge: 60 })).toBe(
      '__Secure-bf_rt=a%20b; Path=/api/auth; Secure; SameSite=Strict; HttpOnly; Max-Age=60',
    );
    expect(clearCookie('x', { path: '/', httpOnly: false, sameSite: 'Lax' })).toBe('x=; Path=/; Secure; SameSite=Lax; Max-Age=0');
  });

  it('parses cookie headers and ignores malformed parts', () => {
    expect(parseCookies('a=1; b=x%20y; broken; c=%E0%A4%A')).toEqual({ a: '1', b: 'x y' });
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('logger', () => {
  it('redacts sensitive keys at any depth', () => {
    expect(
      redact({ email: 'a@b.cl', password: 'x', nested: { refreshToken: 'y', list: [{ code: '1', ok: 2 }] }, error: new Error('boom') }),
    ).toEqual({
      email: 'a@b.cl',
      password: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', list: [{ code: '[REDACTED]', ok: 2 }] },
      error: { name: 'Error', message: 'boom' },
    });
  });

  it('truncates deep structures and writes JSON lines', () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 10; i++) deep = deep['n'] = {};
    expect(JSON.stringify(redact(root))).toContain('[TRUNCATED]');

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.info('hello', { token: 't' });
    logger.debug('debug');
    logger.warn('careful');
    logger.error('bad');
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ level: 'info', msg: 'hello', token: '[REDACTED]' });
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});

describe('http', () => {
  it('builds requests with lowercased headers, cookies and the CloudFront viewer IP', () => {
    const request = toRequest(
      apiEvent('POST', '/x', {
        body: { a: 1 },
        cookies: { c: 'v' },
        headers: { 'CloudFront-Viewer-Address': '203.0.113.9:4431' },
      }),
    );
    expect(request.ip).toBe('203.0.113.9');
    expect(request.cookies).toEqual({ c: 'v' });
    expect(request.body).toEqual({ a: 1 });
    expect(request.headers['content-type']).toBe('application/json');
  });

  it('rejects oversized, non-JSON and malformed bodies', () => {
    const big = apiEvent('POST', '/x', { body: { a: 'x'.repeat(17_000) } });
    expect(() => toRequest(big)).toThrow(expect.objectContaining({ status: 413 }));
    const text = { ...apiEvent('POST', '/x', { body: 'x' }), headers: { 'Content-Type': 'text/plain' } };
    expect(() => toRequest(text)).toThrow(expect.objectContaining({ status: 415 }));
    const bad = { ...apiEvent('POST', '/x', { body: {} }), body: '{bad' };
    expect(() => toRequest(bad)).toThrow(expect.objectContaining({ code: 'INVALID_JSON' }));
    const encoded = { ...apiEvent('POST', '/x', { body: {} }), body: Buffer.from('{"a":2}').toString('base64'), isBase64Encoded: true };
    expect(toRequest(encoded).body).toEqual({ a: 2 });
  });

  it('adds security headers, cookies and hides internal errors', async () => {
    const router = createRouter({
      'GET /ok': async () => json({ ok: true }, 200, ['a=b']),
      'GET /boom': async () => {
        throw new Error('database password is xyz');
      },
    });
    const ok = await router(apiEvent('GET', '/ok'));
    expect(ok.headers).toMatchObject({ 'Strict-Transport-Security': expect.any(String), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    expect(ok.multiValueHeaders).toEqual({ 'Set-Cookie': ['a=b'] });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = await router(apiEvent('GET', '/boom'));
    expect(boom.statusCode).toBe(500);
    expect(boom.body).not.toContain('password');
    expect(JSON.parse(boom.body).error.code).toBe('INTERNAL_ERROR');

    const missing = await router(apiEvent('GET', '/missing'));
    expect(missing.statusCode).toBe(404);
    vi.restoreAllMocks();
  });

  it('includes safe details of client errors and logs 5xx app errors', () => {
    expect(errorResponse(new AppError(400, 'X', undefined, ['d']), 'r').body).toEqual({ error: { code: 'X', requestId: 'r', details: ['d'] } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(errorResponse(new AppError(503, 'DOWN'), 'r').status).toBe(503);
    vi.restoreAllMocks();
  });
});

describe('security', () => {
  const request = (headers: Record<string, string>, cookies: Record<string, string>) =>
    toRequest(apiEvent('POST', '/auth/refresh', { headers, cookies }));

  it('accepts matching origin and double-submit token', () => {
    expect(() => assertCsrf(request({ Origin: 'https://app', 'X-CSRF-Token': 't' }, { [COOKIES.csrf]: 't' }), 'https://app')).not.toThrow();
  });

  it('rejects wrong origin or missing/mismatched token', () => {
    expect(() => assertCsrf(request({ Origin: 'https://evil', 'X-CSRF-Token': 't' }, { [COOKIES.csrf]: 't' }), 'https://app')).toThrow(
      expect.objectContaining({ code: 'CSRF_ORIGIN' }),
    );
    expect(() => assertCsrf(request({ Origin: 'https://app' }, { [COOKIES.csrf]: 't' }), 'https://app')).toThrow(
      expect.objectContaining({ code: 'CSRF_TOKEN' }),
    );
    expect(() => assertCsrf(request({ Origin: 'https://app', 'X-CSRF-Token': 'u' }, { [COOKIES.csrf]: 't' }), 'https://app')).toThrow(
      expect.objectContaining({ code: 'CSRF_TOKEN' }),
    );
  });

  it('maps authenticate outcomes', () => {
    expect(rejectionFor('ok')).toBeNull();
    expect(rejectionFor('role_not_allowed')?.status).toBe(403);
    expect(rejectionFor('session_revoked')?.status).toBe(401);
  });
});

describe('external services', () => {
  const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => body }) as unknown as Response;

  it('validates Turnstile tokens', async () => {
    const fetchFn = vi.fn(async () => response({ success: true, hostname: 'app.example.test' }));
    expect(await turnstileVerifier('s', 'app.example.test', fetchFn).verify('tok', '1.2.3.4')).toBe(true);
    expect(await turnstileVerifier('s', 'other', fetchFn).verify('tok', '1.2.3.4')).toBe(false);
    expect(await turnstileVerifier('s', undefined, fetchFn).verify('', '1.2.3.4')).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await turnstileVerifier('s', undefined, failing).verify('tok', '1.2.3.4')).toBe(false);
    vi.restoreAllMocks();
  });

  it('detects breached passwords by hash suffix and fails open', async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fetchFn = vi.fn(async () => response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3\r\nAAAA:0'));
    expect(await pwnedPasswordsChecker(fetchFn).isBreached('password')).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('https://api.pwnedpasswords.com/range/5BAA6', expect.anything());
    expect(await pwnedPasswordsChecker(fetchFn).isBreached('another one')).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await pwnedPasswordsChecker(vi.fn(async () => response('', false))).isBreached('password')).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('menu tree', () => {
  const row = (code: string, parent: string | null, extra: Partial<MenuRow> = {}): MenuRow => ({
    id: code,
    parent_id: parent,
    kind: parent ? 'menu' : 'module',
    code,
    name: { es: code, en: code },
    icon: null,
    route: parent ? `/${code}` : null,
    sort_order: 0,
    show_in_mobile: false,
    ...extra,
  });
  const rows = [row('security', null), row('security.users', 'security'), row('security.audit', 'security'), row('config', null), row('config.menus', 'config')];

  it('shows only menus with view permission and their modules', () => {
    const tree = buildMenuTree(rows, 'admin', new Set(['security.users:view']), 'web');
    expect(tree).toHaveLength(1);
    expect(tree[0]!.code).toBe('security');
    expect(tree[0]!.children.map((child) => child.code)).toEqual(['security.users']);
  });

  it('shows everything to the superuser and only mobile menus on mobile', () => {
    expect(buildMenuTree(rows, 'superuser', new Set(), 'web')).toHaveLength(2);
    expect(buildMenuTree(rows, 'superuser', new Set(), 'mobile')).toHaveLength(0);
  });
});

describe('federated helpers', () => {
  it('parses Cognito federated usernames', () => {
    expect(parseFederatedUsername('Google_1234')).toMatchObject({ provider: 'google', idpName: 'Google', subject: '1234' });
    expect(parseFederatedUsername('signinwithapple_00.ab_c')).toMatchObject({ provider: 'apple', subject: '00.ab_c' });
    expect(parseFederatedUsername('unknown_1')).toBeNull();
    expect(parseFederatedUsername('nounderscore')).toBeNull();
  });

  it('maps hosted UI errors to codes the web understands', () => {
    expect(federatedErrorCode('PreSignUp failed with error NOT_REGISTERED.')).toBe('NOT_REGISTERED');
    expect(federatedErrorCode('Already found an entry for username Google_1')).toBe('RETRY');
    expect(federatedErrorCode('something else')).toBe('LOGIN_FAILED');
    expect(federatedErrorCode(undefined)).toBe('LOGIN_FAILED');
  });
});

describe('config', () => {
  it('loads and normalizes the environment', () => {
    const config = loadConfig({
      STAGE: 'dev',
      AWS_REGION: 'us-east-1',
      COGNITO_USER_POOL_ID: 'p',
      COGNITO_WEB_CLIENT_ID: 'w',
      COGNITO_MOBILE_CLIENT_ID: 'm',
      COGNITO_DOMAIN: 'https://auth.example.test/',
      WEB_URL: 'https://app.example.test/',
      DB_HOST: 'db',
      DB_PORT: '5432',
      DB_NAME: 'postgres',
      EMAIL_FROM: 'a@b.cl',
      PHOTO_BUCKET: 'b',
    });
    expect(config.apiUrl).toBe('https://app.example.test/api');
    expect(config.cognito.domain).toBe('https://auth.example.test');
    expect(config.db).toEqual({ host: 'db', port: 5432, database: 'postgres', ssl: true });
  });

  it('fails fast on missing variables', () => {
    expect(() => loadConfig({})).toThrow();
  });
});

describe('origin verification, database errors and CSV', async () => {
  const { mapDbError } = await import('../src/lib/db-errors.js');
  const { csvCell, toCsv } = await import('../src/lib/csv.js');

  it('refuses requests without the CloudFront origin secret when configured', async () => {
    const router = createRouter({ 'GET /ok': async () => json({ ok: true }) }, { originSecret: 's3cret' });
    expect((await router(apiEvent('GET', '/ok'))).statusCode).toBe(403);
    expect((await router(apiEvent('GET', '/ok', { headers: { 'X-Origin-Verify': 'wrong' } }))).statusCode).toBe(403);
    expect((await router(apiEvent('GET', '/ok', { headers: { 'X-Origin-Verify': 's3cret' } }))).statusCode).toBe(200);
  });

  it('maps rule violations from PostgreSQL to client errors', () => {
    expect(mapDbError({ code: '42501' })?.status).toBe(403);
    expect(mapDbError({ code: '23505', constraint: 'users_email_key' })?.code).toBe('EMAIL_TAKEN');
    expect(mapDbError({ code: '23505', constraint: 'other' })?.code).toBe('CONFLICT');
    expect(mapDbError({ code: '23514', message: 'at least one active superuser is required' })?.code).toBe('LAST_SUPERUSER');
    expect(mapDbError({ code: '23514', message: 'other check' })).toBeNull();
    expect(mapDbError(null)).toBeNull();
  });

  it('writes CSV cells safely', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(toCsv(['a'], [[1]])).toBe('\uFEFFa\r\n1\r\n');
  });
});
