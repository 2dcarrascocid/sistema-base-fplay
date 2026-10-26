import { describe, expect, it } from 'vitest';
import { buildColumns, buildRows, diff, rowState, setRow, toggle } from '../src/models/permissionMatrix';
import { resolveNavigation, safeRedirect, type SessionView } from '../src/router/guards';
import { ApiError } from '../src/services/http';
import type { PermissionCatalog } from '../src/services/types';
import { errorMessage } from '../src/utils/errors';
import { formatDateTime, fullName, initials, isLocked, stateTone, userState } from '../src/utils/format';
import { email, maxLength, phone, required, rut, sameAs, totp } from '../src/utils/validation';

describe('route guards', () => {
  const session = (overrides: Partial<SessionView> = {}): SessionView => ({
    status: 'authenticated',
    pending: { passwordChange: false, mfaSetup: false },
    can: (permission) => permission === 'security.users:view',
    ...overrides,
  });
  const to = (name: string, meta = {}, fullPath = `/${name}`) => ({ name, fullPath, meta });

  it('sends anonymous users to login, keeping where they wanted to go', () => {
    expect(resolveNavigation(to('users', {}, '/security/users'), session({ status: 'anonymous' }))).toEqual({
      name: 'login',
      query: { redirect: '/security/users' },
    });
    expect(resolveNavigation(to('home', {}, '/'), session({ status: 'anonymous' }))).toEqual({ name: 'login', query: {} });
  });

  it('lets public pages through, but not login once signed in', () => {
    expect(resolveNavigation(to('activate', { public: true }), session({ status: 'anonymous' }))).toBe(true);
    expect(resolveNavigation(to('login', { public: true, guestOnly: true }), session())).toEqual({ name: 'home' });
    expect(resolveNavigation(to('activate', { public: true }), session())).toBe(true);
  });

  it('requires the view permission (403 page otherwise)', () => {
    expect(resolveNavigation(to('users', { permission: 'security.users:view' }), session())).toBe(true);
    expect(resolveNavigation(to('profiles', { permission: 'security.profiles:view' }), session())).toEqual({ name: 'forbidden' });
  });

  it('forces pending password change or MFA setup in Mi cuenta', () => {
    expect(resolveNavigation(to('users'), session({ pending: { passwordChange: true, mfaSetup: false } }))).toEqual({
      name: 'account',
      query: { tab: 'password' },
    });
    expect(resolveNavigation(to('users'), session({ pending: { passwordChange: false, mfaSetup: true } }))).toEqual({
      name: 'account',
      query: { tab: 'mfa' },
    });
    expect(resolveNavigation(to('account'), session({ pending: { passwordChange: true, mfaSetup: false } }))).toBe(true);
  });

  it('accepts only internal redirects', () => {
    expect(safeRedirect('/security/users')).toBe('/security/users');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('/\\evil.example')).toBe('/');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });
});

describe('permission matrix model', () => {
  const name = (text: string) => ({ es: text, en: text });
  const catalog: PermissionCatalog = {
    actions: [
      { code: 'view', name: name('Ver'), is_standard: true, sort_order: 10 },
      { code: 'edit', name: name('Editar'), is_standard: true, sort_order: 30 },
      { code: 'unlock', name: name('Desbloquear'), is_standard: false, sort_order: 100 },
      { code: 'unused', name: name('Nada'), is_standard: false, sort_order: 200 },
    ],
    menus: [
      {
        id: 'm',
        code: 'security',
        kind: 'module',
        name: name('Seguridad'),
        actions: [],
        children: [
          {
            id: 'u',
            code: 'security.users',
            kind: 'menu',
            name: name('Usuarios'),
            actions: [
              { menuActionId: 'u-view', code: 'view', name: name('Ver'), grantable: true },
              { menuActionId: 'u-unlock', code: 'unlock', name: name('Desbloquear'), grantable: false },
            ],
            children: [],
          },
        ],
      },
    ],
  };
  const rows = buildRows(catalog.menus);

  it('flattens menus with depth and keeps only used special actions as columns', () => {
    expect(rows.map((r) => [r.code, r.depth])).toEqual([
      ['security', 0],
      ['security.users', 1],
    ]);
    expect(buildColumns(catalog, rows).map((c) => c.code)).toEqual(['view', 'edit', 'unlock']);
  });

  it('toggles cells and rows (only grantable cells change)', () => {
    const users = rows[1]!;
    let selected = toggle(new Set(), 'u-view');
    expect(rowState(selected, users)).toBe('some');
    selected = toggle(selected, 'u-view');
    expect(rowState(selected, users)).toBe('none');
    selected = setRow(new Set(['u-unlock']), users, true);
    expect(rowState(selected, users)).toBe('all');
    expect([...setRow(selected, users, false)]).toEqual(['u-unlock']);
  });

  it('computes what to add and remove', () => {
    expect(diff(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({ added: ['c'], removed: ['a'] });
  });
});

describe('validation rules', () => {
  it('checks required, email, RUT, phone, TOTP, length and equality', () => {
    expect(required('')).toEqual({ key: 'validation.required' });
    expect(required([])).toEqual({ key: 'validation.required' });
    expect(required(null)).toEqual({ key: 'validation.required' });
    expect(required(['x'])).toBe(true);
    expect(email('a@b.cl')).toBe(true);
    expect(email('nope')).toEqual({ key: 'validation.email' });
    expect(email('')).toBe(true);
    expect(rut('12.345.678-5')).toBe(true);
    expect(rut('12.345.678-9')).toEqual({ key: 'validation.rut' });
    expect(phone('+56912345678')).toBe(true);
    expect(phone('912345678')).toEqual({ key: 'validation.phone' });
    expect(totp('123456')).toBe(true);
    expect(totp(12345)).toEqual({ key: 'validation.totp' });
    expect(maxLength(3)('abcd')).toEqual({ key: 'validation.max', params: { max: 3 } });
    expect(sameAs(() => 'x')('x')).toBe(true);
    expect(sameAs(() => 'x')('y')).toEqual({ key: 'validation.match' });
  });
});

describe('formatting', () => {
  const user = { first_name: 'Ana', last_name: 'Pérez', second_last_name: 'Soto', locked_until: null, status: 'active' as const };

  it('builds names and initials', () => {
    expect(fullName(user)).toBe('Ana Pérez Soto');
    expect(fullName({ ...user, second_last_name: null })).toBe('Ana Pérez');
    expect(initials(user)).toBe('AP');
  });

  it('derives the visible state; a lock wins', () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    expect(userState(user, now)).toBe('active');
    expect(isLocked({ locked_until: '2026-10-25T13:00:00Z' }, now)).toBe(true);
    expect(userState({ ...user, locked_until: '2026-10-25T13:00:00Z' }, now)).toBe('locked');
    expect(userState({ ...user, locked_until: '2026-10-25T11:00:00Z' }, now)).toBe('active');
    expect(stateTone('locked')).toBe('error');
    expect(stateTone('invited')).toBe('info');
  });

  it('formats dates in the given locale and zone', () => {
    expect(formatDateTime(null, 'es')).toBeNull();
    expect(formatDateTime('2026-10-25T12:00:00Z', 'es', 'America/Santiago')).toContain('2026');
    expect(formatDateTime(new Date('2026-10-25T12:00:00Z'), 'en')).toContain('2026');
  });
});

describe('error messages', () => {
  const messages: Record<string, string> = {
    'errors.default': 'Falló',
    'errors.FORBIDDEN': 'Sin permiso',
    'errors.PASSWORD_POLICY': 'No cumple.',
    'passwordRules.too_short': 'Corta.',
  };
  const t = (key: string) => messages[key] ?? key;
  const te = (key: string) => key in messages;

  it('translates known codes and falls back for unknown ones', () => {
    expect(errorMessage(new ApiError(403, 'FORBIDDEN'), t, te)).toBe('Sin permiso');
    expect(errorMessage(new ApiError(400, 'WHATEVER'), t, te)).toBe('Falló');
    expect(errorMessage(new Error('x'), t, te)).toBe('Falló');
  });

  it('lists the password rules that failed', () => {
    expect(errorMessage(new ApiError(400, 'PASSWORD_POLICY', ['too_short', 'unknown']), t, te)).toBe('No cumple. Corta.');
    expect(errorMessage(new ApiError(400, 'PASSWORD_POLICY', ['unknown']), t, te)).toBe('No cumple.');
  });
});
