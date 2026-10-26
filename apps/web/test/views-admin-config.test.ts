import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  choose,
  click,
  clickLabel,
  clickLast,
  confirmDialog,
  currentPath,
  field,
  fill,
  installBackend,
  mountApp,
  pageText,
  reply,
  rows,
  submit,
  unmountApp,
  wait,
} from './harness';

afterEach(unmountApp);
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:csv');
  URL.revokeObjectURL = vi.fn();
});

function chooseFile(file: File): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  return wait(0);
}

const name = (es: string) => ({ es, en: `${es} (en)` });

// Profiles --------------------------------------------------------------------------------------

const PROFILE = { id: 'p-1', name: 'Consulta', description: 'Solo lectura', is_active: true, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' };
const CATALOG = {
  actions: [
    { code: 'view', name: name('Ver'), is_standard: true, sort_order: 1 },
    { code: 'edit', name: name('Editar'), is_standard: true, sort_order: 2 },
  ],
  menus: [
    {
      id: 'm-sec',
      code: 'security',
      kind: 'module',
      name: name('Seguridad'),
      actions: [],
      children: [
        {
          id: 'm-users',
          code: 'security.users',
          kind: 'menu',
          name: name('Usuarios'),
          actions: [
            { menuActionId: 'ma-1', code: 'view', name: name('Ver'), grantable: true },
            { menuActionId: 'ma-2', code: 'edit', name: name('Editar'), grantable: true },
          ],
          children: [],
        },
      ],
    },
  ],
};

function profilesBackend(extra: Record<string, unknown> = {}) {
  return installBackend({
    'GET /admin/profiles': {
      items: [{ ...PROFILE, user_count: 2, permission_count: 1 }, { ...PROFILE, id: 'p-2', name: 'Auditor', description: null, is_active: false, user_count: 0, permission_count: 4 }],
      total: 2,
      page: 1,
      pageSize: 20,
    },
    'GET /admin/profiles/p-1': { profile: PROFILE, menuActionIds: ['ma-1'], canEdit: true },
    'GET /admin/profiles/p-2': { profile: { ...PROFILE, id: 'p-2', name: 'Auditor', is_active: false }, menuActionIds: [], canEdit: true },
    'GET /admin/profiles/p-9': { profile: { ...PROFILE, id: 'p-9', name: 'Nuevo' }, menuActionIds: [], canEdit: true },
    'GET /admin/permission-catalog': CATALOG,
    'GET /admin/profiles/:id/users': { users: [{ id: 'u-2', email: 'bob@test.cl', first_name: 'Bob', last_name: 'Soto', status: 'active', role: 'client', granted_at: '2026-10-01T10:00:00Z' }] },
    'PUT /admin/profiles/:id/permissions': reply(204),
    'PATCH /admin/profiles/:id': { id: 'p-1' },
    'POST /admin/profiles/:id/duplicate': reply(201, { id: 'p-2' }),
    'POST /admin/profiles/:id/:action': reply(204),
    ...extra,
  });
}

describe('profiles list', () => {
  it('lists, searches and opens a profile', async () => {
    const api = profilesBackend();
    await mountApp('/security/profiles');
    expect(pageText()).toContain('Consulta');
    expect(pageText()).toContain('Inactivo');
    await fill('Buscar', 'aud');
    await wait(400);
    expect(api.called('GET /admin/profiles').at(-1)!.query.get('search')).toBe('aud');
    await choose('Estado', 'Activo');
    expect(api.called('GET /admin/profiles').at(-1)!.query.get('status')).toBe('active');
    await click(rows()[0]!);
    expect(currentPath()).toBe('/security/profiles/p-1');
  });

  it('creates a profile and opens it', async () => {
    const api = profilesBackend({ 'POST /admin/profiles': reply(201, { id: 'p-9' }) });
    await mountApp('/security/profiles');
    await click('Nuevo perfil');
    await fill('Nombre', ' Nuevo ');
    await fill('Descripción', 'Para pruebas');
    await clickLast('Crear');
    expect(api.called('POST /admin/profiles')[0]!.body).toEqual({ name: 'Nuevo', description: 'Para pruebas', menuActionIds: [] });
    expect(currentPath()).toBe('/security/profiles/p-9');
  });
});

describe('profile detail', () => {
  it('edits permissions in the matrix, discards and saves', async () => {
    const api = profilesBackend();
    await mountApp('/security/profiles/p-1');
    expect(pageText()).toContain('Solo lectura');

    await clickLabel('Usuarios: Editar');
    expect(pageText()).toContain('Hay cambios sin guardar');
    await click('Cancelar');
    expect(pageText()).not.toContain('Hay cambios sin guardar');

    await clickLabel('Marcar toda la fila: Usuarios');
    await click('Guardar');
    expect(api.called('PUT /admin/profiles/p-1/permissions')[0]!.body.menuActionIds.sort()).toEqual(['ma-1', 'ma-2']);
    expect(pageText()).toContain('Permisos guardados');
  });

  it('asks before leaving with unsaved changes', async () => {
    profilesBackend();
    const ask = vi.fn(() => false);
    vi.stubGlobal('confirm', ask);
    await mountApp('/security/profiles/p-1');
    await clickLabel('Usuarios: Editar');
    await click('Volver');
    expect(ask).toHaveBeenCalled();
    expect(currentPath()).toBe('/security/profiles/p-1');
  });

  it('shows users, edits the data, duplicates and deactivates', async () => {
    const api = profilesBackend();
    await mountApp('/security/profiles/p-1');
    await clickLast('Usuarios');
    expect(pageText()).toContain('bob@test.cl · Usuario cliente');

    await click('Editar datos');
    await fill('Nombre', 'Consulta general');
    await clickLast('Guardar');
    expect(api.called('PATCH /admin/profiles/p-1')[0]!.body).toEqual({ name: 'Consulta general', description: 'Solo lectura' });

    await click('Desactivar');
    expect(pageText()).toContain('perderán sus permisos');
    await confirmDialog();
    expect(api.called('POST /admin/profiles/p-1/deactivate')).toHaveLength(1);

    await click('Duplicar');
    expect(document.activeElement).toBeDefined();
    await clickLast('Duplicar');
    expect(api.called('POST /admin/profiles/p-1/duplicate')[0]!.body).toEqual({ name: 'Consulta (copia)' });
    expect(currentPath()).toBe('/security/profiles/p-2');
  });

  it('reactivates an inactive profile and is read only without rights', async () => {
    const api = profilesBackend();
    await mountApp('/security/profiles/p-2');
    await click('Activar');
    expect(api.called('POST /admin/profiles/p-2/activate')).toHaveLength(1);
    unmountApp();

    profilesBackend({ 'GET /admin/profiles/p-1': { profile: PROFILE, menuActionIds: ['ma-1'], canEdit: false } });
    await mountApp('/security/profiles/p-1');
    expect(pageText()).toContain('solo puedes verlo');
    expect((document.querySelector('[aria-label="Usuarios: Ver"]') as HTMLInputElement).disabled).toBe(true);
  });
});

// Configuration ---------------------------------------------------------------------------------

const SETTINGS = {
  system_name: 'Sistema Base',
  logo_key: 'branding/logo.png',
  primary_color: '#1565C0',
  secondary_color: '#424242',
  default_locale: 'es',
  default_time_zone: 'America/Santiago',
  self_registration_enabled: false,
  updated_at: '2026-10-01T10:00:00Z',
};

describe('general settings', () => {
  it('validates and saves the settings, then reloads the brand', async () => {
    const api = installBackend({ 'GET /config/settings': { settings: SETTINGS, logoUrl: 'https://bucket.test/logo.png' }, 'PUT /config/settings': { settings: SETTINGS } });
    await mountApp('/config/settings');
    await fill('Color principal', '#12');
    await submit();
    expect(api.called('PUT /config/settings')).toHaveLength(0);

    await fill('Color principal', '#00897B');
    await fill('Nombre del sistema', 'Mi Sistema');
    await click(field('Permitir registro libre de usuarios cliente'));
    await submit();
    expect(api.called('PUT /config/settings')[0]!.body).toEqual({
      systemName: 'Mi Sistema',
      primaryColor: '#00897B',
      secondaryColor: '#424242',
      defaultLocale: 'es',
      defaultTimeZone: 'America/Santiago',
      selfRegistrationEnabled: true,
    });
    expect(api.called('GET /me').length).toBeGreaterThan(1);
  });

  it('uploads and removes the logo', async () => {
    const api = installBackend({
      'GET /config/settings': { settings: SETTINGS, logoUrl: null },
      'POST /config/settings/logo/upload-url': { url: 'https://bucket.test/upload', fields: { key: 'branding/x.png' }, key: 'branding/x.png', maxBytes: 524288 },
      'POST /upload': reply(204),
      'PUT /config/settings/logo': (call: { body: { key: string | null } }) => ({ logoUrl: call.body.key ? 'https://bucket.test/x.png' : null }),
    });
    await mountApp('/config/settings');
    await chooseFile(new File([new Uint8Array(600 * 1024)], 'big.png', { type: 'image/png' }));
    expect(pageText()).toContain('El logo no es válido');

    await chooseFile(new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' }));
    expect(api.called('PUT /config/settings/logo')[0]!.body).toEqual({ key: 'branding/x.png' });
    expect(document.querySelector('img.logo')?.getAttribute('src')).toBe('https://bucket.test/x.png');

    await click('Quitar logo');
    expect(api.called('PUT /config/settings/logo')[1]!.body).toEqual({ key: null });
    expect(document.querySelector('img.logo')).toBeNull();
  });

  it('reports a failed logo upload', async () => {
    installBackend({
      'GET /config/settings': { settings: SETTINGS, logoUrl: null },
      'POST /config/settings/logo/upload-url': { url: 'https://bucket.test/upload', fields: {}, key: 'k', maxBytes: 524288 },
      'POST /upload': reply(403),
    });
    await mountApp('/config/settings');
    await chooseFile(new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' }));
    expect(pageText()).toContain('No se pudo completar la acción');
  });
});

const POLICY = {
  password_min_length: 12,
  password_require_upper: true,
  password_require_lower: true,
  password_require_digit: true,
  password_require_symbol: true,
  password_max_age_days: 0,
  max_failed_attempts: 5,
  lockout_minutes: 15,
  idle_timeout_minutes: 15,
  session_max_hours: 12,
  invitation_ttl_hours: 72,
};

describe('security policy', () => {
  it('checks ranges and saves numbers', async () => {
    const api = installBackend({
      'GET /config/security-policy': { policy: POLICY, roles: [{ code: 'client', mfa_required: false }] },
      'PUT /config/security-policy': { policy: { ...POLICY, password_min_length: 14 }, roles: [{ code: 'client', mfa_required: true }] },
    });
    await mountApp('/config/security-policy');
    await fill('Largo mínimo', '5');
    await submit();
    expect(pageText()).toContain('Entre 12 y 128');
    expect(api.called('PUT /config/security-policy')).toHaveLength(0);

    await fill('Largo mínimo', '14');
    await click(field('Exigir MFA a los usuarios cliente'));
    await submit();
    expect(api.called('PUT /config/security-policy')[0]!.body).toMatchObject({ passwordMinLength: 14, maxFailedAttempts: 5, clientMfaRequired: true });
    expect(pageText()).toContain('Política guardada');
  });
});

const menu = (id: string, parent: string | null, kind: string, sort: number, extra: object = {}) => ({
  id,
  parent_id: parent,
  kind,
  code: id,
  name: name(id),
  icon: null,
  route: null,
  sort_order: sort,
  show_in_mobile: false,
  superuser_only: false,
  is_system: false,
  is_active: true,
  action_ids: [],
  ...extra,
});
const MENUS = [
  menu('security', null, 'module', 10, { is_system: true, superuser_only: true }),
  menu('security.users', 'security', 'menu', 10, { is_system: true, route: '/security/users', action_ids: [1], show_in_mobile: true }),
  menu('sales', null, 'module', 20),
  menu('sales.orders', 'sales', 'menu', 10, { route: '/sales/orders' }),
  menu('sales.clients', 'sales', 'menu', 20, { is_active: false }),
];
const ACTIONS = [
  { id: 1, code: 'view', name: name('Ver'), is_standard: true, sort_order: 1 },
  { id: 10, code: 'approve', name: name('Aprobar'), is_standard: false, sort_order: 100 },
];

function menusBackend() {
  return installBackend({
    'GET /config/menus': { menus: MENUS },
    'GET /config/actions': { actions: ACTIONS },
    'POST /config/menus/reorder': reply(204),
    'POST /config/menus': reply(201, { id: 'new' }),
    'PATCH /config/menus/:id': { id: 'x' },
    'PUT /config/menus/:id/actions': reply(204),
    'POST /config/actions': reply(201, { id: 11 }),
  });
}

describe('menus and modules', () => {
  it('shows the tree and reorders siblings', async () => {
    const api = menusBackend();
    await mountApp('/config/menus');
    expect(pageText()).toContain('/security/users');
    expect(pageText()).toContain('Sistema');
    expect(pageText()).toContain('Solo superusuario');
    await clickLabel('Bajar', 3);
    expect(api.called('POST /config/menus/reorder')[0]!.body).toEqual({ parentId: 'sales', orderedIds: ['sales.clients', 'sales.orders'] });
    await clickLabel('Subir', 0);
    expect(api.called('POST /config/menus/reorder')).toHaveLength(1);
  });

  it('creates a menu under a module', async () => {
    const api = menusBackend();
    await mountApp('/config/menus');
    await clickLabel('Agregar debajo', 2);
    expect((field('Código') as HTMLInputElement).value).toBe('sales.');
    await fill('Código', 'sales.invoices');
    await fill('Nombre (español)', 'Facturas');
    await fill('Nombre (inglés)', 'Invoices');
    await fill('Ruta web', 'mal ruta');
    await clickLast('Guardar');
    expect(api.called('POST /config/menus')).toHaveLength(0);
    await fill('Ruta web', '/sales/invoices');
    await fill('Ícono', 'mdi-file');
    await clickLast('Guardar');
    expect(api.called('POST /config/menus')[0]!.body).toEqual({
      name: { es: 'Facturas', en: 'Invoices' },
      icon: 'mdi-file',
      route: '/sales/invoices',
      showInMobile: false,
      parentId: 'sales',
      code: 'sales.invoices',
      superuserOnly: false,
      isActive: true,
      actionIds: [],
    });
    expect(pageText()).toContain('Menú guardado');
  });

  it('creates a module without route', async () => {
    const api = menusBackend();
    await mountApp('/config/menus');
    await click('Nuevo módulo');
    await fill('Código', 'reports');
    await fill('Nombre (español)', 'Reportes');
    await fill('Nombre (inglés)', 'Reports');
    await clickLast('Guardar');
    expect(api.called('POST /config/menus')[0]!.body).toMatchObject({ parentId: null, code: 'reports', route: null });
  });

  it('edits a system menu without touching its code, and a normal menu with its actions', async () => {
    const api = menusBackend();
    await mountApp('/config/menus');
    await clickLabel('Editar menú', 1);
    expect(pageText()).toContain('Menú del sistema');
    await fill('Nombre (español)', 'Usuarios y cuentas');
    await clickLast('Guardar');
    expect(api.called('PATCH /config/menus/security.users')[0]!.body).toEqual({
      name: { es: 'Usuarios y cuentas', en: 'security.users (en)' },
      icon: null,
      route: '/security/users',
      showInMobile: true,
    });

    await clickLabel('Editar menú', 3);
    await choose('Acciones', 'Aprobar');
    await click(field('Activo'));
    await clickLast('Guardar');
    expect(api.called('PATCH /config/menus/sales.orders')[0]!.body).toMatchObject({ code: 'sales.orders', isActive: false });
    expect(api.called('PUT /config/menus/sales.orders/actions')[0]!.body).toEqual({ actionIds: [10] });
  });

  it('lists actions and creates a special one', async () => {
    const api = menusBackend();
    await mountApp('/config/menus');
    await click('Acciones especiales');
    expect(pageText()).toContain('approve');
    expect(pageText()).toContain('Especial');
    await fill('Código de la acción', 'Mal Código');
    await submit();
    expect(api.called('POST /config/actions')).toHaveLength(0);
    await fill('Código de la acción', 'sign');
    await fill('Nombre (español)', 'Firmar');
    await fill('Nombre (inglés)', 'Sign');
    await submit();
    expect(api.called('POST /config/actions')[0]!.body).toEqual({ code: 'sign', name: { es: 'Firmar', en: 'Sign' } });
    expect(pageText()).toContain('Acción guardada');
  });
});

const TEMPLATE = {
  id: 't-1',
  code: 'invitation',
  locale: 'es',
  subject: 'Bienvenido',
  updated_at: '2026-10-01T10:00:00Z',
  body_html: '<p>Hola {{firstName}}</p>',
  body_text: 'Hola {{firstName}}',
};

describe('email templates', () => {
  it('edits a template with variables, preview and sanitizing notice', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const api = installBackend({
      'GET /config/email-templates': { templates: [TEMPLATE, { ...TEMPLATE, id: 't-2', locale: 'en' }], variables: {} },
      'GET /config/email-templates/:id': (_call: unknown, [id]: string[]) => ({ template: { ...TEMPLATE, id }, variables: ['firstName', 'link'] }),
      'POST /config/email-templates/preview': { subject: 'Bienvenido', html: '<p>Hola Ana</p>', text: 'Hola Ana' },
      'PUT /config/email-templates/:id': { template: { ...TEMPLATE, body_html: '<p>Hola</p>' }, sanitized: true },
    });
    await mountApp('/config/email-templates');
    expect(pageText()).toContain('Invitación · Español');

    await click([...document.querySelectorAll('.v-chip')].find((c) => c.textContent?.trim() === '{{firstName}}')!);
    expect(writeText).toHaveBeenCalledWith('{{firstName}}');

    await click('Vista previa');
    expect(api.called('POST /config/email-templates/preview')[0]!.body).toMatchObject({ code: 'invitation', subject: 'Bienvenido' });
    const frame = document.querySelector('iframe.preview')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toBe('<p>Hola Ana</p>');

    await fill('Contenido HTML', '<p onclick="x()">Hola</p>');
    await click('Guardar');
    expect(api.called('PUT /config/email-templates/t-1')[0]!.body.bodyHtml).toBe('<p onclick="x()">Hola</p>');
    expect(pageText()).toContain('Se quitó contenido no permitido');
    expect(field('Contenido HTML').value).toBe('<p>Hola</p>');

    await click(/^English/);
    expect(api.called('GET /config/email-templates/t-2')).toHaveLength(1);
  });

  it('shows unknown variables as an error', async () => {
    installBackend({
      'GET /config/email-templates': { templates: [TEMPLATE], variables: {} },
      'GET /config/email-templates/:id': { template: TEMPLATE, variables: ['firstName'] },
      'PUT /config/email-templates/:id': apiError(400, 'UNKNOWN_VARIABLES'),
    });
    await mountApp('/config/email-templates');
    await click('Guardar');
    expect(pageText()).toContain('variables que no existen');
  });
});

// Audit -----------------------------------------------------------------------------------------

const EVENT = {
  id: '42',
  occurred_at: '2026-10-20T12:00:00Z',
  actor_user_id: 'u-1',
  actor_email: 'super@test.cl',
  event_type: 'config.settings.update',
  entity_type: 'app_settings',
  entity_id: '1234567890abcdef',
  result: 'success',
  ip: '10.0.0.1',
};

function auditBackend(integrity = { valid: true, brokenId: null as string | null, total: 10 }) {
  return installBackend({
    'GET /audit/event-types': { eventTypes: ['auth.login.failure', 'config.settings.update'] },
    'GET /audit/integrity': integrity,
    'GET /audit/events': { items: [EVENT, { ...EVENT, id: '43', actor_email: null, entity_type: null, entity_id: null, result: 'failure', event_type: 'auth.login.failure' }], total: 2, page: 1, pageSize: 50 },
    'GET /audit/events/export': 'fecha;evento\n',
    'GET /audit/events/42': { event: { ...EVENT, user_agent: 'Firefox', request_id: 'req-1', old_value: { system_name: 'A' }, new_value: { system_name: 'B' } } },
    'GET /audit/events/43': { event: { ...EVENT, id: '43', actor_email: null, user_agent: null, request_id: null, old_value: null, new_value: null } },
  });
}

describe('audit', () => {
  it('lists events, filters, exports and shows the detail with before/after', async () => {
    const api = auditBackend();
    await mountApp('/security/audit');
    expect(pageText()).toContain('Integridad verificada · 10 registros');
    expect(pageText()).toContain('config.settings.update');
    expect(pageText()).toContain('12345678');
    expect(pageText()).toContain('Fallido');
    expect(pageText()).toContain('Sistema');

    await fill('Actor (email)', 'super@');
    await fill('Desde', '2026-10-01');
    await wait(400);
    const last = api.called('GET /audit/events').at(-1)!;
    expect(last.query.get('actor')).toBe('super@');
    expect(last.query.get('from')).toBeTruthy();

    await click('Exportar CSV');
    expect(api.called('GET /audit/events/export')[0]!.query.get('actor')).toBe('super@');

    await click(rows()[0]!);
    expect(pageText()).toContain('Detalle del evento #42');
    expect(pageText()).toContain('req-1');
    expect(pageText()).toContain('system_name');
    await clickLast('Cerrar');

    await click(rows()[1]!);
    expect(pageText()).toContain('Sin valores registrados');
  });

  it('warns when the chain was tampered with', async () => {
    auditBackend({ valid: false, brokenId: '7', total: 10 });
    await mountApp('/security/audit');
    expect(pageText()).toContain('Se detectó una alteración en el registro 7');
  });
});
