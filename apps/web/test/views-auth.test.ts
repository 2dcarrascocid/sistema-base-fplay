import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  click,
  clickLabel,
  currentPath,
  fill,
  installBackend,
  ME,
  mountApp,
  pageText,
  reply,
  submit,
  unmountApp,
} from './harness';

afterEach(unmountApp);

const PASSWORD = 'Valid-Pass-2026!';

describe('login', () => {
  it('signs in with email and password and lands on the redirect target', async () => {
    const api = installBackend(
      { 'POST /auth/login': { status: 'authenticated', accessToken: 'token-2', expiresIn: 600 } },
      { anonymous: true },
    );
    await mountApp('/login?redirect=/account');
    expect(pageText()).toContain('Iniciar sesión');
    expect(pageText()).toContain('Crear una cuenta');

    await fill('Email', ' ana@test.cl ');
    await fill('Contraseña', PASSWORD);
    // The fake API answers /me now that a token exists.
    api.routes['POST /auth/refresh'] = { accessToken: 'token-2', expiresIn: 600 };
    await submit();

    expect(api.called('POST /auth/login')[0]!.body).toEqual({ email: 'ana@test.cl', password: PASSWORD, captchaToken: 'local-development' });
    expect(currentPath()).toBe('/account');
  });

  it('does not submit an invalid form', async () => {
    const api = installBackend({}, { anonymous: true });
    await mountApp('/login');
    await fill('Email', 'not-an-email');
    await submit();
    expect(api.called('POST /auth/login')).toHaveLength(0);
    expect(pageText()).toContain('Email no válido');
  });

  it('shows the API error and clears the password', async () => {
    installBackend({ 'POST /auth/login': apiError(401, 'INVALID_CREDENTIALS') }, { anonymous: true });
    await mountApp('/login');
    await fill('Email', 'ana@test.cl');
    await fill('Contraseña', 'Wrong-Pass-2026!');
    await submit();
    expect(pageText()).toContain('Email o contraseña incorrectos');
  });

  it('walks through the MFA setup challenge', async () => {
    const api = installBackend(
      {
        'POST /auth/login': { status: 'challenge', challenge: 'MFA_SETUP', session: 's-1' },
        'POST /auth/mfa/setup': { secretCode: 'SECRET123', otpauthUri: 'otpauth://totp/Base:ana?secret=SECRET123' },
        'POST /auth/challenge': { status: 'authenticated', accessToken: 'token-2', expiresIn: 600 },
      },
      { anonymous: true },
    );
    await mountApp('/login');
    await fill('Email', 'ana@test.cl');
    await fill('Contraseña', PASSWORD);
    await submit();
    expect(pageText()).toContain('Activa la verificación en dos pasos');
    expect(pageText()).toContain('SECRET123');

    await fill('Código', '123456');
    api.routes['POST /auth/refresh'] = { accessToken: 'token-2', expiresIn: 600 };
    await submit();
    expect(api.called('POST /auth/challenge')[0]!.body).toEqual({ session: 's-1', challenge: 'MFA_SETUP', code: '123456' });
    expect(currentPath()).toBe('/');
  });

  it('asks for a TOTP code and can go back to the credentials', async () => {
    installBackend({ 'POST /auth/login': { status: 'challenge', challenge: 'SOFTWARE_TOKEN_MFA', session: 's-1' } }, { anonymous: true });
    await mountApp('/login');
    await fill('Email', 'ana@test.cl');
    await fill('Contraseña', PASSWORD);
    await submit();
    expect(pageText()).toContain('Verificación en dos pasos');
    await click('Volver a iniciar sesión');
    expect(pageText()).toContain('Ingresa con tu cuenta institucional');
  });

  it('requires a new password when Cognito asks for one', async () => {
    const api = installBackend(
      {
        'POST /auth/login': { status: 'challenge', challenge: 'NEW_PASSWORD_REQUIRED', session: 's-1' },
        'POST /auth/challenge': apiError(400, 'PASSWORD_POLICY'),
      },
      { anonymous: true },
    );
    await mountApp('/login');
    await fill('Email', 'ana@test.cl');
    await fill('Contraseña', PASSWORD);
    await submit();
    expect(pageText()).toContain('Crea una nueva contraseña');
    await fill('Nueva contraseña', 'Other-Pass-2026!');
    await fill('Repite la contraseña', 'Other-Pass-2026!');
    await submit();
    expect(api.called('POST /auth/challenge')[0]!.body).toMatchObject({ challenge: 'NEW_PASSWORD_REQUIRED', newPassword: 'Other-Pass-2026!' });
    expect(pageText()).toContain('La contraseña no cumple la política de seguridad');
  });

  it('shows an error coming back from a federated login and offers the providers', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, pathname: '/login', hash: '', search: '' });
    installBackend({}, { anonymous: true });
    await mountApp('/login?error=EMAIL_NOT_VERIFIED');
    expect(pageText()).toContain('El proveedor no confirmó tu email');
    await click('Google');
    expect(assign).toHaveBeenCalledWith('/api/auth/federated/google/start');
  });

  it('retries a federated login once after a RETRY, and only for a known provider', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, pathname: '/login', hash: '', search: '' });
    installBackend({}, { anonymous: true });
    sessionStorage.setItem('federated-retry', JSON.stringify({ provider: 'google', retried: false }));
    await mountApp('/login?error=RETRY');
    expect(assign).toHaveBeenCalledWith('/api/auth/federated/google/start');
    unmountApp();

    vi.stubGlobal('location', { ...window.location, assign, pathname: '/login', hash: '', search: '' });
    installBackend({}, { anonymous: true });
    sessionStorage.setItem('federated-retry', JSON.stringify({ provider: '../../evil', retried: false }));
    assign.mockClear();
    await mountApp('/login?error=RETRY');
    expect(assign).not.toHaveBeenCalled();
    expect(pageText()).toContain('No se pudo completar el ingreso');
    sessionStorage.clear();
  });

  it('keeps signed-in users away from the login page', async () => {
    installBackend();
    await mountApp('/login');
    expect(currentPath()).toBe('/');
  });
});

describe('password recovery', () => {
  it('requests a code, then sets the new password', async () => {
    const api = installBackend({ 'POST /auth/password/forgot': reply(202, { status: 'accepted' }), 'POST /auth/password/reset': reply(204) }, { anonymous: true });
    await mountApp('/forgot-password');
    await fill('Email', 'ana@test.cl');
    await submit();
    expect(pageText()).toContain('recibirás un código');

    await fill('Código recibido por email', '123456');
    await fill('Nueva contraseña', PASSWORD);
    await fill('Repite la contraseña', PASSWORD);
    await submit();
    expect(api.called('POST /auth/password/reset')[0]!.body).toEqual({ email: 'ana@test.cl', code: '123456', newPassword: PASSWORD, captchaToken: 'local-development' });
    expect(pageText()).toContain('Contraseña actualizada');
  });

  it('shows rate limiting errors', async () => {
    installBackend({ 'POST /auth/password/forgot': apiError(429, 'RATE_LIMITED') }, { anonymous: true });
    await mountApp('/forgot-password');
    await fill('Email', 'ana@test.cl');
    await submit();
    expect(pageText()).toContain('Demasiados intentos');
  });
});

describe('invitation activation', () => {
  it('reads the token from the fragment, removes it from the address bar and activates', async () => {
    const api = installBackend({ 'POST /auth/invitations/accept': reply(204) }, { anonymous: true });
    const replace = vi.spyOn(window.history, 'replaceState');
    await mountApp('/activate#token=abc%2F123');
    expect(replace).toHaveBeenCalledWith(null, '', '/activate');

    await fill('Nueva contraseña', PASSWORD);
    await fill('Repite la contraseña', 'Different-2026!');
    await submit();
    expect(pageText()).toContain('Las contraseñas no coinciden');
    expect(api.called('POST /auth/invitations/accept')).toHaveLength(0);

    await fill('Repite la contraseña', PASSWORD);
    await submit();
    expect(api.called('POST /auth/invitations/accept')[0]!.body).toEqual({ token: 'abc/123', password: PASSWORD, captchaToken: 'local-development' });
    expect(pageText()).toContain('Tu cuenta está activa');
  });

  it('explains a missing token and shows API errors', async () => {
    installBackend({ 'POST /auth/invitations/accept': apiError(400, 'INVITATION_INVALID') }, { anonymous: true });
    await mountApp('/activate');
    expect(pageText()).toContain('El enlace no es válido');
    unmountApp();

    installBackend({ 'POST /auth/invitations/accept': apiError(400, 'INVITATION_INVALID') }, { anonymous: true });
    await mountApp('/activate#token=t');
    await fill('Nueva contraseña', PASSWORD);
    await fill('Repite la contraseña', PASSWORD);
    await submit();
    expect(pageText()).toContain('La invitación no es válida');
  });
});

describe('self registration', () => {
  it('sends the registration and confirms', async () => {
    const api = installBackend({ 'POST /auth/register': reply(202, { status: 'accepted' }) }, { anonymous: true });
    await mountApp('/register');
    await fill('Nombre', 'Ana');
    await fill('Apellido', 'Pérez');
    await fill('Email', 'ana@test.cl');
    await submit();
    expect(api.called('POST /auth/register')[0]!.body).toMatchObject({ email: 'ana@test.cl', firstName: 'Ana', lastName: 'Pérez' });
    expect(pageText()).toContain('Revisa tu email');
  });

  it('shows errors', async () => {
    installBackend({ 'POST /auth/register': apiError(400, 'VALIDATION_ERROR') }, { anonymous: true });
    await mountApp('/register');
    await fill('Nombre', 'Ana');
    await fill('Apellido', 'Pérez');
    await fill('Email', 'ana@test.cl');
    await submit();
    expect(pageText()).toContain('Revisa los datos ingresados');
  });
});

describe('federated callback', () => {
  it('exchanges the refresh cookie and goes home', async () => {
    installBackend();
    await mountApp('/auth/callback');
    expect(currentPath()).toBe('/');
  });

  it('goes back to login when there is no session', async () => {
    installBackend({}, { anonymous: true });
    await mountApp('/auth/callback');
    // The login page shows the error and cleans the query.
    expect(currentPath()).toBe('/login');
    expect(pageText()).toContain('No se pudo completar el ingreso');
  });
});

describe('application shell', () => {
  it('shows the brand, the menu tree and the shortcuts on the home page', async () => {
    installBackend();
    await mountApp('/');
    expect(pageText()).toContain('Sistema Base');
    expect(pageText()).toContain('Hola, Ana');
    expect(pageText()).toContain('Seguridad');
    expect(pageText()).toContain('Usuarios');
    expect(document.querySelector('img.app-logo')?.getAttribute('src')).toBe('https://bucket.test/logo.png');
    expect(document.title).toBe('Sistema Base');
  });

  it('tells users without menus to ask for profiles', async () => {
    installBackend({}, { me: { ...ME, role: 'client', menu: [], user: { ...ME.user, last_login_at: null, photoUrl: 'https://bucket.test/me.png' } } });
    await mountApp('/');
    expect(pageText()).toContain('Todavía no tienes perfiles asignados');
  });

  it('switches the language', async () => {
    installBackend();
    await mountApp('/');
    await clickLabel('Idioma');
    await click('English');
    expect(pageText()).toContain('Home');
    expect(document.documentElement.lang).toBe('en');
  });

  it('logs out', async () => {
    const api = installBackend();
    await mountApp('/');
    await clickLabel('Mi cuenta');
    await click('Cerrar sesión');
    expect(api.called('POST /auth/logout')).toHaveLength(1);
    expect(currentPath()).toBe('/login');
    expect(pageText()).toContain('Cerraste sesión');
  });

  it('returns to login with a notice when the session is lost', async () => {
    const api = installBackend({ 'GET /me/sessions': apiError(401, 'SESSION_INVALID') });
    await mountApp('/account');
    api.routes['POST /auth/refresh'] = apiError(401, 'SESSION_INVALID');
    await click('Sesiones');
    expect(currentPath()).toBe('/login');
    expect(pageText()).toContain('Tu sesión terminó');
  });

  it('sends anonymous visitors to login and remembers where they were going', async () => {
    installBackend({}, { anonymous: true });
    await mountApp('/security/users');
    expect(currentPath()).toBe('/login?redirect=/security/users');
  });

  it('shows forbidden and not found pages', async () => {
    installBackend({}, { me: { ...ME, role: 'client', permissions: [] } });
    await mountApp('/security/users');
    expect(currentPath()).toBe('/forbidden');
    expect(pageText()).toContain('Sin acceso');
    unmountApp();

    installBackend();
    await mountApp('/no/such/page');
    expect(pageText()).toContain('Página no encontrada');
  });
});
