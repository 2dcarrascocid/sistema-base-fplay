# Spec 02 — Multi login y seguridad del backend

Estado: **IMPLEMENTADO** (fase 2). Pendiente de validar contra AWS real (ver "Pendientes").

## Alcance

- Amazon Cognito (User Pool) como único autenticador: login local, Google, Facebook y Sign in with Apple.
- API de autenticación (web) y "Mi cuenta" (web y móvil) en AWS Lambda + API Gateway (REST), Serverless Framework v4, stages `dev` y `prod`.
- Triggers de Cognito: Pre sign-up, Pre authentication, Post authentication, Custom message.
- Infraestructura de seguridad de la API: WAF, Secrets Manager, un rol IAM por Lambda, bucket S3 privado para fotos.
- Script de instalación del superusuario.

Fuera de esta fase: mantenedores (fases 3–4), web (fase 3), móvil (fase 5), CloudFront de la web (fase 3).

## Arquitectura

```
Navegador ──► CloudFront + WAF ──► /api/* ──► API Gateway REST + WAF ──► Lambdas ──► PostgreSQL (SSL)
                                                                     └──► Cognito / SES / S3 / Secrets Manager
App móvil ──► navegador del sistema + PKCE ──► Cognito (login administrado) ; API con Bearer token
```

- La web y la API comparten origen (CloudFront enruta `/api/*`), así que no hay CORS con credenciales.
- Lambdas: `auth` (pública, rol BD `app_auth`), `me` (autenticada, rol BD `app_api`) y 4 triggers (`app_auth`). Cada una tiene su propio rol IAM con permisos mínimos.

## Tokens y sesión

| Cliente | Access token | Refresh token |
|---|---|---|
| Web | solo en memoria (respuesta JSON) | cookie `__Secure-bf_rt`: HttpOnly, Secure, SameSite=Strict, Path=/api/auth |
| Móvil | memoria / flutter_secure_storage | flutter_secure_storage (lo obtiene la app con PKCE) |

- Cliente Cognito **web**: confidencial (secreto en Secrets Manager), flujos `USER_PASSWORD_AUTH` y `REFRESH_TOKEN_AUTH`, y code flow para los proveedores federados. **Móvil**: público, code flow + PKCE.
- Access token de 10 minutos. Refresh token según `security_policy.session_max_hours` (por defecto 12 h).
- Cada request autenticado llama a `app.authenticate(sub, origin_jti, client_type)`. Esa función:
  - rechaza si el usuario está inactivo, bloqueado o la sesión está revocada o vencida (inactividad o máximo);
  - rechaza roles distintos de cliente en móvil;
  - actualiza `last_seen_at`;
  - registra automáticamente la sesión móvil la primera vez.
- Revocar una sesión corta también el access token vigente, porque se comprueba `origin_jti` en cada request.
- CSRF en `/auth/refresh` y `/auth/logout` (únicos endpoints que usan cookie):
  1. la cabecera `Origin` debe estar en la lista permitida;
  2. doble envío: la cookie `__Secure-bf_csrf`, legible por JS y SameSite=Strict, debe coincidir con la cabecera `X-CSRF-Token`;
  3. SameSite=Strict.
- Los demás endpoints usan `Authorization: Bearer` y no son vulnerables a CSRF.

## Flujos

### Login local web — `POST /api/auth/login`
1. Valida con Zod y verifica Turnstile.
2. Aplica límite por IP (20 cada 5 min) y por email (10 cada 15 min).
3. Llama a Cognito `InitiateAuth`. Los triggers Pre/Post authentication llevan el conteo de intentos y el bloqueo.
4. Respuestas posibles:
   - tokens: se crea la sesión;
   - `{challenge, session}` con `SOFTWARE_TOKEN_MFA`, `NEW_PASSWORD_REQUIRED`, `MFA_SETUP` (el rol exige MFA y el usuario no lo tiene) o `PASSWORD_CHANGE` (primer ingreso o contraseña vencida).
5. Para los desafíos propios, `session` es un sobre cifrado AES-256-GCM, de 5 minutos, que guarda los tokens de Cognito. Nunca sale un token en claro antes de completar los desafíos.
6. Los errores son genéricos (`INVALID_CREDENTIALS`), sin distinguir usuario inexistente, contraseña errónea ni cuenta bloqueada. La cuenta bloqueada se avisa por email.

### Desafíos — `POST /api/auth/challenge`, `POST /api/auth/mfa/setup`
- `SOFTWARE_TOKEN_MFA` y `NEW_PASSWORD_REQUIRED` se responden a Cognito.
- `MFA_SETUP`: `AssociateSoftwareToken` entrega el secreto TOTP; luego `VerifySoftwareToken` y la preferencia TOTP. Queda `users.mfa_enabled = true`.
- `PASSWORD_CHANGE`: se valida la política y se llama `AdminSetUserPassword`. Queda `must_change_password = false`.

### Federado web — `GET /api/auth/federated/{google|facebook|apple}/start` y `/callback`
1. **start**: genera `state` y un `code_verifier` PKCE, los guarda en la cookie cifrada `__Secure-bf_oauth` (SameSite=Lax, 10 min, Path=/api/auth/federated) y redirige a Cognito `/oauth2/authorize?identity_provider=...`.
2. **callback**: valida `state`, canjea el código con el secreto del cliente y el verifier, y crea la sesión. Redirige a `WEB_URL/auth/callback`; la web pide el access token con `/auth/refresh`. Ningún token viaja en la URL.
3. Los errores redirigen a `WEB_URL/login?error=<CODIGO>`.

### Cuentas vinculadas — trigger Pre sign-up
- Todo usuario de la BD tiene un usuario **nativo** en Cognito, que es la identidad `local`. Su `sub` es el `sub` de todos los tokens.
- En el primer login federado con un email verificado por el proveedor:
  - si ya existe un usuario con ese email, se llama `AdminLinkProviderForUser(nativo ← federado)` y se registra la identidad. Si el usuario estaba `invited`, queda `active`;
  - si no existe: con registro libre se crea el usuario cliente y el usuario nativo, y se vinculan; sin registro libre se rechaza (`NOT_REGISTERED`).
- Google y Apple exigen `email_verified = true`. Facebook solo entrega emails confirmados; se acepta y queda documentado como riesgo residual.
- Problema conocido de Cognito: el primer login justo después de vincular puede devolver un error. La web reintenta automáticamente una vez (fase 3).

### Bloqueo por intentos — triggers Pre/Post authentication
- **Pre authentication** llama a `app.register_login_attempt()`. Esa función:
  - rechaza si la cuenta está bloqueada;
  - si los intentos sin éxito acumulados llegan a `max_failed_attempts`, bloquea por `lockout_minutes`, revoca sesiones, envía el email `account_locked` y audita;
  - si no, suma un intento.
- **Post authentication** llama a `app.register_login_success()`, que pone el contador en 0, y audita `auth.login.success`.
- Así se cubre igual el login web (API) y el móvil (login administrado de Cognito).
- Pre authentication también rechaza usuarios inactivos y, en el cliente móvil, roles distintos de cliente.

### MFA obligatorio por rol
- Cognito queda con MFA `OPTIONAL` (solo TOTP) y la obligatoriedad por rol la impone el backend con `roles.mfa_required`.
- **Un rol con MFA obligatorio no puede entrar con Google, Facebook ni Apple**: Cognito no aplica TOTP a usuarios federados. El callback rechaza con `MFA_REQUIRED_USE_PASSWORD`.

### Recuperación de contraseña — `POST /api/auth/password/forgot`, `/reset`
- Turnstile y límite de solicitudes. Cognito `ForgotPassword` responde siempre 202 genérico.
- El email sale de la plantilla `password_reset` (trigger Custom message) en el idioma del usuario.
- `ConfirmForgotPassword` revoca todas las sesiones y audita.

### Invitación — `POST /api/auth/invitations/accept`
1. Recibe el token; la BD guarda solo su SHA-256. El token es de un solo uso y vence.
2. Valida la contraseña, llama `AdminSetUserPassword` permanente y marca `email_verified`.
3. El usuario pasa a `active`.

### Registro libre — `POST /api/auth/register` (solo si `self_registration_enabled`)
- Crea un cliente `invited` y su usuario nativo en Cognito sin contraseña, y envía la invitación.
- Si el email ya existe responde igual (202), para no revelar qué emails están registrados.

### Mi cuenta (web y móvil, `app_api`)
| Método y ruta | Descripción |
|---|---|
| `GET /api/me` | datos, rol, permisos, árbol de menús permitido, parámetros de la app, URL firmada de la foto |
| `PATCH /api/me` | nombre, apellidos, teléfono, idioma, zona horaria |
| `POST /api/me/password` | `ChangePassword` y revoca las demás sesiones |
| `GET /api/me/sessions`, `DELETE /api/me/sessions/{id}`, `POST /api/me/sessions/revoke-others` | sesiones activas |
| `POST /api/me/mfa/setup`, `POST /api/me/mfa/verify`, `DELETE /api/me/mfa` | TOTP; no se puede desactivar si el rol lo exige |
| `POST /api/me/photo/upload-url`, `PUT /api/me/photo` | POST firmado a S3 (JPEG/PNG/WebP, máx. 2 MB) |

Con `must_change_password` o con MFA pendiente solo se permiten `GET /me`, `/me/password` y `/me/mfa/*` (403 `PASSWORD_CHANGE_REQUIRED` / `MFA_SETUP_REQUIRED`).

## Contraseñas (ASVS V2.1)
- Política de `security_policy` validada en el backend (`packages/shared`) y sincronizada en Cognito.
- Largo máximo de 128 caracteres; se aceptan espacios y Unicode.
- Se rechazan contraseñas filtradas consultando Have I Been Pwned por rango (k-anonimato, solo se envían 5 caracteres del SHA-1; ASVS 2.1.7). Si el servicio no responde se permite la contraseña y se registra una advertencia.

## Endurecimiento transversal
- Zod en toda entrada. Cuerpo máximo de 16 KB. Errores `{error: {code, message}}` sin detalles internos y con `requestId`.
- Logs JSON sin contraseñas, tokens, cookies, códigos ni secretos (redacción por nombre de campo).
- Cabeceras en toda respuesta: HSTS, `X-Content-Type-Options`, `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` y `Referrer-Policy: no-referrer`.
- Secretos en Secrets Manager: credenciales `app_api` / `app_auth`, secreto del cliente web, Turnstile y clave de cifrado. Se cachean por contenedor.
- PostgreSQL con `ssl.rejectUnauthorized = true` (CA configurable) y una transacción por request con `set_config('app.user_id', ...)`.
- WAF regional en la API **y** en el User Pool de Cognito, que protege el login móvil: reglas administradas de AWS (Common, KnownBadInputs, SQLi, IpReputation) y límite por IP.
- Auditoría en `app.audit_log` de: login correcto, fallido y federado; bloqueo; cambio y recuperación de contraseña; MFA activado o desactivado; sesiones revocadas; invitación aceptada; registro; cuenta vinculada.

## Pruebas
- Vitest con cobertura ≥ 80% en `apps/api`.
- Lógica pura: cripto, cookies, CSRF, plantillas, política de contraseñas, redacción de logs.
- Handlers con Cognito, Turnstile, SES, S3 y HIBP falsos, y BD real en contenedor con los roles `app_api` / `app_auth`.
- Casos obligatorios de la fase:
  - un usuario sin permiso recibe 403;
  - el bloqueo ocurre tras los intentos fallidos;
  - una cuenta se vincula por email;
  - una sesión revocada recibe 401;
  - un rol no cliente en móvil recibe 403.
- pgTAP: `app.authenticate()` y `app.register_login_attempt()`.

## Desviaciones y pendientes

- **WAF de la API**: en esta fase el WAF regional protege el User Pool de Cognito. El de la API y la web se asocia a CloudFront en la fase 3, junto con el bloqueo del acceso directo al endpoint de API Gateway (cabecera secreta de origen).
- **Superusuario inicial**: no está en `seed.sql` (que se aplica en todos los entornos). Lo crea `apps/api/scripts/create-superuser.ts` en dev/prod y `seed.local.sql` en local.
- **Sin validar en AWS real**: el despliegue (`serverless deploy`), el reintento por el problema conocido de vinculación de Cognito y la configuración de cada proveedor requieren una cuenta AWS y credenciales de Google, Facebook y Apple.
- **Sincronización de la política con Cognito**: el largo de la contraseña y la validez del refresh token se fijan en la plantilla; la sincronización desde `security_policy` llega con el mantenedor de políticas (fase 4).
