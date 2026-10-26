# Spec 03 — Mantenedores de usuarios, roles y perfiles (web)

Estado: **IMPLEMENTADO** (fase 3). Navegable en local; despliegue en AWS pendiente de validar.

## Alcance

1. **API `admin`** (Lambda, rol BD `app_api`): mantenedores de usuarios y perfiles.
2. **Web** `apps/web` (Vue 3 + Vite + Vuetify 3 + Pinia + vue-router + vue-i18n, es/en):
   - login (local, Google, Facebook, Apple) con Turnstile y sus desafíos (código MFA, alta de MFA con QR, cambio de contraseña obligatorio);
   - recuperación de contraseña, activación por invitación y Mi cuenta;
   - menú según permisos, mantenedor de usuarios y mantenedor de perfiles con matriz de permisos.
3. **`packages/ui`**: componentes Vue reutilizables.
4. **Entorno local navegable sin AWS**: servidor de desarrollo que expone las mismas rutas de la API sobre la BD del contenedor, con Cognito, SES y S3 simulados. Nunca se despliega.
5. **Infraestructura web**: bucket S3 privado + CloudFront (OAC) con WAF, HTTPS, HSTS, CSP y cabeceras de seguridad. CloudFront enruta `/api/*` a API Gateway con una cabecera secreta de origen que las Lambdas exigen.

Fuera de alcance: configuración y auditoría (fase 4; sus menús muestran "disponible próximamente"), app móvil (fase 5).

## API `admin`

Todas las rutas exigen permiso. El backend valida en cada request y RLS es la segunda capa.

### Usuarios

| Método y ruta | Permiso | Notas |
|---|---|---|
| `GET /admin/users` | `security.users:view` | `search` (nombre, apellidos, email, RUT), `status`, `role`, `profileId`, `page`, `pageSize` (máx. 100), `sort` |
| `GET /admin/users/export` | `security.users:export` | CSV con los mismos filtros; celdas protegidas contra inyección de fórmulas |
| `GET /admin/users/{id}` | `security.users:view` | datos, rol, perfiles, métodos de ingreso vinculados, bloqueo, sesiones activas, invitación pendiente |
| `GET /admin/users/{id}/permissions` | `security.users:view` | permisos efectivos (suma de perfiles activos) |
| `POST /admin/users` | `security.users:create` | crea el usuario nativo en Cognito y el usuario `invited`; asigna perfiles y envía la invitación |
| `PATCH /admin/users/{id}` | `security.users:edit` | nombre, apellidos, RUT, teléfono, cargo, rol. El email no se edita: es la clave de las cuentas vinculadas |
| `PUT /admin/users/{id}/profiles` | `security.users:edit` | reemplaza los perfiles; solo perfiles cuyos permisos tiene el actor |
| `POST /admin/users/{id}/deactivate`, `/activate` | `security.users:edit` | desactivar revoca sesiones y deshabilita en Cognito; nunca el último superusuario (409) ni uno mismo |
| `POST /admin/users/{id}/unlock` | `security.users:unlock` | |
| `POST /admin/users/{id}/reset-password` | `security.users:reset_password` | `AdminResetUserPassword`: el usuario recibe un código por email y usa "recuperar contraseña"; se revocan sus sesiones |
| `POST /admin/users/{id}/revoke-sessions` | `security.users:revoke_sessions` | |
| `POST /admin/users/{id}/invitation` | `security.users:create` | reenvía la invitación (anula la anterior); solo para `invited` |

Reglas de jerarquía:
- el administrador solo crea y gestiona usuarios cliente; solo el superusuario gestiona administradores y superusuarios;
- nadie cambia su propio rol o estado.

### Perfiles

| Método y ruta | Permiso | Notas |
|---|---|---|
| `GET /admin/profiles` | `security.profiles:view` | búsqueda, estado, paginación; cantidad de usuarios y de permisos |
| `GET /admin/profiles/{id}` | `security.profiles:view` | datos y permisos (ids de `menu_actions`) |
| `GET /admin/profiles/{id}/users` | `security.profiles:view` + `security.users:view` | usuarios del perfil (son datos personales: exige ambos permisos) |
| `POST /admin/profiles` | `security.profiles:create` | nombre, descripción y permisos |
| `PATCH /admin/profiles/{id}` | `security.profiles:edit` | |
| `PUT /admin/profiles/{id}/permissions` | `security.profiles:edit` | reemplaza la matriz; agregados y quitados quedan en la auditoría |
| `POST /admin/profiles/{id}/duplicate` | `security.profiles:create` | copia los permisos con un nombre nuevo |
| `POST /admin/profiles/{id}/deactivate` | `security.profiles:delete` | baja lógica |
| `POST /admin/profiles/{id}/activate` | `security.profiles:edit` | |
| `GET /admin/permission-catalog` | `security.profiles:view` | árbol de menús con sus acciones; marca cuáles puede otorgar el actor. Excluye los menús solo de superusuario |
| `GET /admin/roles` | `security.users:view` | roles que el actor puede asignar |

### Errores
- Violación de RLS → 403 `FORBIDDEN`.
- Email, RUT o nombre de perfil duplicado → 409 `EMAIL_TAKEN` / `RUT_TAKEN` / `NAME_TAKEN`.
- Último superusuario → 409 `LAST_SUPERUSER`.
- Permisos que el actor no tiene → 403 `UNGRANTABLE_PERMISSIONS`, con la lista de claves.

### Auditoría
`user.create`, `user.update` (valor anterior y nuevo), `user.profiles.update`, `user.activate`, `user.deactivate`, `user.unlock`, `user.password.reset`, `user.sessions.revoked`, `user.invitation.sent`, `profile.create`, `profile.update`, `profile.duplicate`, `profile.activate`, `profile.deactivate`, `profile.permissions.update` (agregados y quitados).

### Cambios en la BD (migración nueva)
- `app_api` puede crear la identidad `local` de un usuario que gestiona.
- Quien tiene `security.profiles:view` puede contar los usuarios de cada perfil; quien tiene `security.users:view` ve los nombres de los perfiles.
- Índice para el orden por defecto del listado de usuarios.

## Web

### Sesión
- El access token vive en memoria (Pinia) y nunca se guarda en `localStorage` ni en la URL.
- Al cargar la app se llama `/auth/refresh` (cookie HttpOnly) y la renovación es automática antes de vencer. Ante un 401 se intenta un único refresh y luego se vuelve a login.
- Las llamadas con cookie llevan `X-CSRF-Token`, leído de la cookie `__Secure-bf_csrf`.
- Inactividad: la API la impone; la web muestra el aviso y cierra la sesión.

### Navegación y permisos
- El menú lateral sale de `GET /me` (árbol filtrado por permisos).
- La directiva y composable `can('security.users:edit')` ocultan botones. Solo oculta: la API valida siempre.
- Guardias de ruta: sin sesión → `/login`; sin permiso de ver → 403. Con cambio de contraseña o MFA pendiente → Mi cuenta.

### Pantallas
- **Login**, **Recuperar contraseña**, **Activar cuenta** (lee `#token` del fragmento y lo borra de la barra de direcciones) y **Callback federado** (reintenta una vez ante `RETRY`).
- **Mi cuenta**: datos, foto, contraseña, MFA con QR y sesiones activas.
- **Usuarios**: tabla paginada en servidor con búsqueda y filtros; ficha de creación y edición con RUT validado; acciones por usuario (activar o desactivar, desbloquear, restablecer contraseña, cerrar sesiones, reenviar invitación, ver permisos efectivos); exportación CSV.
- **Perfiles**: tabla, ficha y matriz de permisos (menús en filas, acciones en columnas). Una casilla aparece deshabilitada si el actor no puede otorgarla o si la acción no existe para ese menú. Incluye duplicar, desactivar y la lista de usuarios del perfil.

## Entorno local (`pnpm dev`)

- `apps/api/dev/server.ts` expone `/api/*` en `localhost:3000` con los mismos routers de las Lambdas, conectado a la BD del contenedor como `app_api` / `app_auth`.
- Cognito simulado:
  - contraseña inicial `Local-Dev-2026!` para todo usuario local, y código TOTP `123456`;
  - tokens firmados con HMAC que vencen.
- Los emails se escriben en la consola (ahí aparecen los enlaces de invitación). Las fotos se guardan en memoria.
- Se niega a arrancar si `NODE_ENV=production`. No forma parte de ningún bundle de Lambda.
- Vite (`localhost:5173`) redirige `/api` al servidor local: mismo origen, como en CloudFront.

## Infraestructura web
- S3 privado con Origin Access Control y una CloudFront Function para el ruteo SPA.
- Política de cabeceras:
  - HSTS (2 años, preload), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`;
  - CSP: `default-src 'self'`, Turnstile permitido en `script-src`/`frame-src`, el bucket de fotos en `img-src`/`connect-src`, `frame-ancestors 'none'`, `object-src 'none'`.
- `/api/*` → API Gateway sin caché, con `CloudFront-Viewer-Address` y la cabecera secreta `X-Origin-Verify`. Las Lambdas rechazan requests sin ella (403), así que acceder directo a `execute-api` no sirve.
- WAF global (CloudFront): reglas administradas de AWS, límite por IP general y uno más estricto para `/api/auth/*`.

## Pruebas
- **API**:
  - cada endpoint `admin`, con 403 sin permiso;
  - el administrador no otorga perfiles ni permisos que no tiene;
  - el administrador no gestiona administradores;
  - no se desactiva el último superusuario;
  - auditoría con valores anterior y nuevo;
  - CSV protegido;
  - verificación de la cabecera de origen.
- **Web y `packages/ui`** (Vitest + Vue Test Utils + happy-dom), con cobertura ≥ 80% en la lógica:
  - stores de sesión y permisos y cliente HTTP (refresh, CSRF, reintento ante 401);
  - guardias de ruta y validaciones (RUT, contraseña);
  - modelo de la matriz de permisos y componentes de `packages/ui`.
