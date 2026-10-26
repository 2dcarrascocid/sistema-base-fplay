import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditDiff, dateRange } from '../src/models/auditDiff';
import { buildMenuTree, childKind, flattenTree, moveSibling } from '../src/models/menuTree';
import { auditApi, configApi } from '../src/services/api';
import type { ConfigMenu } from '../src/services/types';

const menu = (id: string, parent: string | null, kind: ConfigMenu['kind'], sort: number, code = id): ConfigMenu => ({
  id,
  parent_id: parent,
  kind,
  code,
  name: { es: id, en: id },
  icon: null,
  route: null,
  sort_order: sort,
  show_in_mobile: false,
  superuser_only: false,
  is_system: false,
  is_active: true,
  action_ids: [],
});

describe('menu tree', () => {
  const menus = [menu('b', null, 'module', 20), menu('a', null, 'module', 10), menu('a2', 'a', 'menu', 20), menu('a1', 'a', 'menu', 10), menu('a1x', 'a1', 'submenu', 10)];

  it('nests and orders by sort_order', () => {
    const tree = buildMenuTree(menus);
    expect(tree.map((n) => n.id)).toEqual(['a', 'b']);
    expect(flattenTree(tree).map((n) => [n.id, n.depth])).toEqual([
      ['a', 0],
      ['a1', 1],
      ['a1x', 2],
      ['a2', 1],
      ['b', 0],
    ]);
  });

  it('moves a menu among its siblings only', () => {
    expect(moveSibling(menus, 'a2', -1)).toEqual({ parentId: 'a', orderedIds: ['a2', 'a1'] });
    expect(moveSibling(menus, 'a1', -1)).toBeNull();
    expect(moveSibling(menus, 'b', 1)).toBeNull();
    expect(moveSibling(menus, 'missing', 1)).toBeNull();
  });

  it('knows which level a new child gets', () => {
    expect(childKind(null)).toBe('module');
    expect(childKind(menus[1]!)).toBe('menu');
    expect(childKind(menus[3]!)).toBe('submenu');
    expect(childKind(menus[4]!)).toBeNull();
  });
});

describe('audit diff', () => {
  it('lists every key with before/after and flags changes', () => {
    expect(auditDiff({ a: 1, b: 'x', c: null }, { a: 2, b: 'x', d: { e: true } })).toEqual([
      { key: 'a', before: '1', after: '2', changed: true },
      { key: 'b', before: 'x', after: 'x', changed: false },
      { key: 'c', before: 'null', after: '—', changed: true },
      { key: 'd', before: '—', after: '{"e":true}', changed: true },
    ]);
    expect(auditDiff(null, null)).toEqual([]);
  });

  it('turns local dates into an inclusive ISO range', () => {
    const range = dateRange('2026-10-01', '2026-10-01');
    expect(new Date(range.to!).getTime() - new Date(range.from!).getTime()).toBe(86_400_000);
    expect(dateRange(null, null)).toEqual({});
  });
});

describe('configuration and audit endpoints', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return `${init?.method} ${String(url)}`;
  };

  it('call the expected routes', async () => {
    const name = { es: 'A', en: 'A' };
    const policy = {
      passwordMinLength: 12,
      passwordRequireUpper: true,
      passwordRequireLower: true,
      passwordRequireDigit: true,
      passwordRequireSymbol: true,
      passwordMaxAgeDays: 0,
      maxFailedAttempts: 5,
      lockoutMinutes: 15,
      idleTimeoutMinutes: 15,
      sessionMaxHours: 12,
      invitationTtlHours: 72,
      clientMfaRequired: false,
    };
    const template = { subject: 's', bodyHtml: 'h', bodyText: 't' };
    const calls: [() => Promise<unknown>, string][] = [
      [() => configApi.settings(), 'GET /api/config/settings'],
      [() => configApi.updateSettings({ systemName: 'S', primaryColor: '#000000', secondaryColor: '#000000', defaultLocale: 'es', defaultTimeZone: 'UTC', selfRegistrationEnabled: false }), 'PUT /api/config/settings'],
      [() => configApi.logoUploadUrl('image/png'), 'POST /api/config/settings/logo/upload-url'],
      [() => configApi.setLogo(null), 'PUT /api/config/settings/logo'],
      [() => configApi.menus(), 'GET /api/config/menus'],
      [() => configApi.createMenu({ parentId: null, code: 'x', name, actionIds: [] }), 'POST /api/config/menus'],
      [() => configApi.updateMenu('m1', { name }), 'PATCH /api/config/menus/m1'],
      [() => configApi.setMenuActions('m1', [1]), 'PUT /api/config/menus/m1/actions'],
      [() => configApi.reorderMenus(null, ['m1']), 'POST /api/config/menus/reorder'],
      [() => configApi.actions(), 'GET /api/config/actions'],
      [() => configApi.createAction('approve', name), 'POST /api/config/actions'],
      [() => configApi.updateAction(9, name), 'PATCH /api/config/actions/9'],
      [() => configApi.policy(), 'GET /api/config/security-policy'],
      [() => configApi.updatePolicy(policy), 'PUT /api/config/security-policy'],
      [() => configApi.templates(), 'GET /api/config/email-templates'],
      [() => configApi.template('t1'), 'GET /api/config/email-templates/t1'],
      [() => configApi.updateTemplate('t1', template), 'PUT /api/config/email-templates/t1'],
      [() => configApi.previewTemplate('invitation', template), 'POST /api/config/email-templates/preview'],
      [() => auditApi.events({ result: 'failure', page: 2 }), 'GET /api/audit/events?result=failure&page=2'],
      [() => auditApi.event('42'), 'GET /api/audit/events/42'],
      [() => auditApi.exportEvents({ eventType: 'auth.locked' }), 'GET /api/audit/events/export?eventType=auth.locked'],
      [() => auditApi.eventTypes(), 'GET /api/audit/event-types'],
      [() => auditApi.integrity(), 'GET /api/audit/integrity'],
    ];
    for (const [call, expected] of calls) {
      await call();
      expect(last()).toBe(expected);
    }
  });
});
