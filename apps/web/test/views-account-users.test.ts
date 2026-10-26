import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../src/services/types';
import {
  apiError,
  choose,
  click,
  clickLast,
  confirmDialog,
  currentPath,
  fill,
  installBackend,
  ME,
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

const client = (changes: Partial<Me['user']> = {}, pending = { passwordChange: false, mfaSetup: false }): Me => ({
  ...ME,
  role: 'client',
  menu: [],
  user: { ...ME.user, ...changes },
  pending,
});

function chooseFile(file: File): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  return wait(0);
}

describe('my account', () => {
  it('updates personal data and reloads the profile', async () => {
    const api = installBackend({ 'PATCH /me': { user: ME.user } });
    await mountApp('/account');
    expect(pageText()).toContain('Ana Pérez · super@test.cl');
    await fill('Nombre', ' Anita ');
    await fill('Teléfono', '+56912345678');
    await submit();
    expect(api.called('PATCH /me')[0]!.body).toMatchObject({ firstName: 'Anita', phone: '+56912345678', secondLastName: null });
    expect(api.called('GET /me').length).toBeGreaterThan(1);
    expect(pageText()).toContain('Cambios guardados');
  });

  it('uploads a photo through the presigned form and rejects big files', async () => {
    const api = installBackend({
      'POST /me/photo/upload-url': { url: 'https://bucket.test/upload', fields: { key: 'photos/u-1.png' }, key: 'photos/u-1.png', maxBytes: 2097152 },
      'POST /upload': reply(204),
      'PUT /me/photo': { photoUrl: 'https://bucket.test/u-1.png' },
    });
    await mountApp('/account?tab=photo');
    await chooseFile(new File([new Uint8Array(3 * 1024 * 1024)], 'big.png', { type: 'image/png' }));
    expect(pageText()).toContain('La foto supera los 2 MB');
    expect(api.called('POST /me/photo/upload-url')).toHaveLength(0);

    await chooseFile(new File([new Uint8Array(10)], 'me.png', { type: 'image/png' }));
    expect(api.called('POST /me/photo/upload-url')[0]!.body).toEqual({ contentType: 'image/png' });
    expect(api.called('POST /upload')).toHaveLength(1);
    expect(api.called('PUT /me/photo')[0]!.body).toEqual({ key: 'photos/u-1.png' });
    expect(pageText()).toContain('Foto actualizada');
  });

  it('reports a failed upload', async () => {
    installBackend({
      'POST /me/photo/upload-url': { url: 'https://bucket.test/upload', fields: {}, key: 'k', maxBytes: 2097152 },
      'POST /upload': reply(403),
    });
    await mountApp('/account?tab=photo');
    await chooseFile(new File([new Uint8Array(10)], 'me.png', { type: 'image/png' }));
    expect(pageText()).toContain('No se pudo completar la acción');
  });

  it('changes the password', async () => {
    const api = installBackend({ 'POST /me/password': reply(204) });
    await mountApp('/account?tab=password');
    await fill('Contraseña actual', 'Old-Pass-2026!');
    await fill('Nueva contraseña', 'New-Pass-2026!');
    await fill('Repite la contraseña', 'New-Pass-2026!');
    await submit();
    expect(api.called('POST /me/password')[0]!.body).toEqual({ currentPassword: 'Old-Pass-2026!', newPassword: 'New-Pass-2026!' });
    expect(pageText()).toContain('Se cerraron tus otras sesiones');
  });

  it('shows a wrong current password', async () => {
    installBackend({ 'POST /me/password': apiError(400, 'INVALID_CURRENT_PASSWORD') });
    await mountApp('/account?tab=password');
    await fill('Contraseña actual', 'Old-Pass-2026!');
    await fill('Nueva contraseña', 'New-Pass-2026!');
    await fill('Repite la contraseña', 'New-Pass-2026!');
    await submit();
    expect(pageText()).toContain('La contraseña actual no es correcta');
  });

  it('activates MFA with a code', async () => {
    const api = installBackend(
      { 'POST /me/mfa/setup': { secretCode: 'ABC', otpauthUri: 'otpauth://totp/x?secret=ABC' }, 'POST /me/mfa/verify': reply(204) },
      { me: client({ mfa_enabled: false }) },
    );
    await mountApp('/account?tab=mfa');
    expect(pageText()).toContain('La verificación en dos pasos está desactivada');
    await click('Activar');
    expect(pageText()).toContain('ABC');
    await click('Confirmar activación');
    expect(api.called('POST /me/mfa/verify')).toHaveLength(0);
    await fill('Código', '123456');
    await click('Confirmar activación');
    expect(api.called('POST /me/mfa/verify')[0]!.body).toEqual({ code: '123456' });
    expect(pageText()).toContain('Verificación en dos pasos activada');
  });

  it('lets a client disable MFA after confirming; other roles cannot', async () => {
    const api = installBackend({ 'DELETE /me/mfa': reply(204) }, { me: client({ mfa_enabled: true }) });
    await mountApp('/account?tab=mfa');
    await click('Desactivar');
    expect(pageText()).toContain('Tu cuenta quedará menos protegida');
    await confirmDialog();
    expect(api.called('DELETE /me/mfa')).toHaveLength(1);
    unmountApp();

    installBackend();
    await mountApp('/account?tab=mfa');
    expect(pageText()).toContain('Tu rol exige verificación en dos pasos.');
  });

  it('lists sessions and closes one or all the others', async () => {
    const sessions = [
      { id: 's-1', client_type: 'web', ip: '10.0.0.1', user_agent: 'Firefox', created_at: '2026-10-20T10:00:00Z', last_seen_at: '2026-10-26T10:00:00Z', current: true },
      { id: 's-2', client_type: 'mobile', ip: '10.0.0.2', user_agent: 'App', created_at: '2026-10-21T10:00:00Z', last_seen_at: '2026-10-25T10:00:00Z', current: false },
    ];
    const api = installBackend({ 'GET /me/sessions': { sessions }, 'DELETE /me/sessions/:id': reply(204), 'POST /me/sessions/revoke-others': reply(204) });
    await mountApp('/account');
    await click('Sesiones');
    expect(currentPath()).toBe('/account?tab=sessions');
    expect(pageText()).toContain('Esta sesión');
    expect(pageText()).toContain('App móvil');
    await click('Cerrar');
    expect(api.called('DELETE /me/sessions/s-2')).toHaveLength(1);
    await click('Cerrar las demás sesiones');
    expect(api.called('POST /me/sessions/revoke-others')).toHaveLength(1);
    expect(pageText()).toContain('Se cerraron las demás sesiones');
  });

  it('sends users with a pending password change to that tab', async () => {
    installBackend({}, { me: client({}, { passwordChange: true, mfaSetup: false }) });
    await mountApp('/');
    expect(currentPath()).toBe('/account?tab=password');
    expect(pageText()).toContain('Debes cambiar tu contraseña antes de usar el sistema');
  });

  it('sends users with a pending MFA setup to that tab', async () => {
    installBackend({}, { me: client({ mfa_enabled: false }, { passwordChange: false, mfaSetup: true }) });
    await mountApp('/security/users');
    expect(currentPath()).toBe('/account?tab=mfa');
    expect(pageText()).toContain('Tu rol exige verificación en dos pasos. Actívala para continuar.');
  });
});

// Users maintainer ------------------------------------------------------------------------------

const future = new Date(Date.now() + 3_600_000).toISOString();
const bob = {
  id: 'u-2',
  email: 'bob@test.cl',
  first_name: 'Bob',
  last_name: 'Soto',
  second_last_name: 'Lara',
  rut: '11111111-1',
  status: 'active',
  locked_until: future,
  mfa_enabled: false,
  last_login_at: null,
  created_at: '2026-10-01T10:00:00Z',
  role: 'client',
};
const carla = { ...bob, id: 'u-3', email: 'carla@test.cl', first_name: 'Carla', last_name: 'Díaz', second_last_name: null, rut: null, status: 'invited', locked_until: null, last_login_at: '2026-10-02T10:00:00Z', role: 'admin' };
const detailOf = (user: Record<string, unknown>, extra: object = {}) => ({
  user: { ...user, phone: '+56911111111', job_title: 'Analista', locale: null, time_zone: null, must_change_password: false, updated_at: '2026-10-01T10:00:00Z' },
  profiles: [{ id: 'p-1', name: 'Consulta', is_active: true }],
  identities: [
    { provider: 'local', linked_at: '2026-10-01T10:00:00Z', last_used_at: null },
    { provider: 'google', linked_at: '2026-10-01T10:00:00Z', last_used_at: null },
  ],
  activeSessions: 2,
  pendingInvitation: null,
  canManage: true,
  ...extra,
});
const ROLES = {
  roles: [
    { id: 1, code: 'superuser', name: { es: 'Superusuario', en: 'Superuser' }, mfa_required: true, can_assign: false },
    { id: 2, code: 'admin', name: { es: 'Administrador', en: 'Administrator' }, mfa_required: true, can_assign: true },
    { id: 3, code: 'client', name: { es: 'Usuario cliente', en: 'Client user' }, mfa_required: false, can_assign: true },
  ],
};
const PROFILE_PAGE = {
  items: [{ id: 'p-1', name: 'Consulta', description: 'Solo lectura', is_active: true, updated_at: '2026-10-01T10:00:00Z', user_count: 1, permission_count: 3 }],
  total: 1,
  page: 1,
  pageSize: 100,
};

function usersBackend(extra: Record<string, unknown> = {}) {
  return installBackend({
    'GET /admin/users': { items: [bob, carla], total: 2, page: 1, pageSize: 20 },
    'GET /admin/users/export': 'email;nombre\n',
    'GET /admin/users/u-2': detailOf(bob),
    'GET /admin/users/u-3': detailOf(carla, { pendingInvitation: { expires_at: future, created_at: '2026-10-01T10:00:00Z' }, profiles: [], activeSessions: 0 }),
    'GET /admin/users/:id/permissions': { permissions: ['security.users:view'] },
    'POST /admin/users/:id/:action': reply(204),
    'GET /admin/roles': ROLES,
    'GET /admin/profiles': PROFILE_PAGE,
    ...extra,
  });
}

describe('users list', () => {
  it('lists users with their state, filters by search and exports CSV', async () => {
    const api = usersBackend();
    await mountApp('/security/users');
    expect(pageText()).toContain('Bob Soto Lara');
    expect(pageText()).toContain('11.111.111-1');
    expect(pageText()).toContain('Bloqueado');
    expect(pageText()).toContain('Invitado');
    expect(pageText()).toContain('Nunca');

    await fill('Buscar', ' bob ');
    await wait(400);
    expect(api.called('GET /admin/users').at(-1)!.query.get('search')).toBe('bob');

    await choose('Estado', 'Activo');
    expect(api.called('GET /admin/users').at(-1)!.query.get('status')).toBe('active');

    await click('Exportar CSV');
    const exported = api.called('GET /admin/users/export')[0]!;
    expect(exported.query.get('page')).toBeNull();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('creates a user and sends the invitation', async () => {
    const api = usersBackend({ 'POST /admin/users': reply(201, { id: 'u-9' }) });
    await mountApp('/security/users');
    await click('Nuevo usuario');
    expect(api.called('GET /admin/roles')).toHaveLength(1);
    expect(pageText()).toContain('El usuario recibirá un email');

    await click('Crear');
    expect(api.called('POST /admin/users')).toHaveLength(0);

    await fill('Email', 'nuevo@test.cl');
    await fill('Nombre', 'Nuevo');
    await fill('Apellido paterno', 'Usuario');
    await fill('RUT', '11.111.111-1');
    await click('Crear');
    expect(api.called('POST /admin/users')[0]!.body).toEqual({
      firstName: 'Nuevo',
      lastName: 'Usuario',
      secondLastName: null,
      rut: '11.111.111-1',
      phone: null,
      jobTitle: null,
      role: 'client',
      email: 'nuevo@test.cl',
      profileIds: [],
    });
    expect(pageText()).toContain('Usuario creado');
  });

  it('shows API errors when creating', async () => {
    usersBackend({ 'POST /admin/users': apiError(409, 'EMAIL_TAKEN') });
    await mountApp('/security/users');
    await click('Nuevo usuario');
    await fill('Email', 'bob@test.cl');
    await fill('Nombre', 'Bob');
    await fill('Apellido paterno', 'Soto');
    await click('Crear');
    expect(pageText()).toContain('Ya existe un usuario con ese email');
  });
});

describe('user detail', () => {
  it('shows the detail, effective permissions and runs confirmed actions', async () => {
    const api = usersBackend();
    await mountApp('/security/users');
    await click(rows()[0]!);
    expect(pageText()).toContain('bob@test.cl');
    expect(pageText()).toContain('Analista');
    expect(pageText()).toContain('Email y contraseña');
    expect(pageText()).toContain('Google');
    expect(pageText()).toContain('Bloqueado hasta');

    await click('Ver permisos efectivos');
    expect(pageText()).toContain('security.users:view');

    await click('Acciones');
    await click('Desbloquear');
    expect(api.called('POST /admin/users/u-2/unlock')).toHaveLength(1);
    expect(pageText()).toContain('Usuario desbloqueado');

    await click('Acciones');
    await click('Desactivar');
    expect(pageText()).toContain('se cerrarán sus sesiones');
    await confirmDialog();
    expect(api.called('POST /admin/users/u-2/deactivate')).toHaveLength(1);

    await click('Acciones');
    await click('Cerrar sesiones');
    await confirmDialog();
    expect(api.called('POST /admin/users/u-2/revoke-sessions')).toHaveLength(1);
  });

  it('resends a pending invitation', async () => {
    const api = usersBackend();
    await mountApp('/security/users');
    await click(rows()[1]!);
    expect(pageText()).toContain('Invitación pendiente');
    expect(pageText()).toContain('Sin perfiles');
    await click('Acciones');
    await click('Reenviar invitación');
    expect(api.called('POST /admin/users/u-3/invitation')).toHaveLength(1);
  });

  it('edits a user and updates the profiles', async () => {
    const api = usersBackend({ 'PATCH /admin/users/:id': { id: 'u-2' }, 'PUT /admin/users/:id/profiles': reply(204) });
    await mountApp('/security/users');
    await click(rows()[0]!);
    await clickLast('Editar');
    expect(pageText()).toContain('Editar usuario');
    expect(pageText()).toContain('El email no se puede cambiar');
    await fill('Cargo', 'Jefe');
    await choose('Rol', 'Administrador');
    await clickLast('Guardar');
    expect(api.called('PATCH /admin/users/u-2')[0]!.body).toMatchObject({ jobTitle: 'Jefe', role: 'admin' });
    expect(pageText()).toContain('Usuario actualizado');
  });

  it('is read only when the user is out of the actor reach', async () => {
    usersBackend({ 'GET /admin/users/u-2': detailOf(bob, { canManage: false }) });
    await mountApp('/security/users');
    await click(rows()[0]!);
    expect(pageText()).toContain('está fuera de tu nivel');
    expect(pageText()).not.toContain('Acciones');
  });
});
