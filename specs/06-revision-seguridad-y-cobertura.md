# Spec 06 — Revisión final de seguridad y cobertura

Estado: **IMPLEMENTADO** (fase 6). Cubre las fases 1 a 4. La app móvil (fase 5) aún no existe y necesitará su propia revisión.

## Alcance

1. Dependencias con vulnerabilidades conocidas (`pnpm audit`).
2. Secretos en el repositorio (gitleaks, en el historial y en los cambios sin commit).
3. Revisión del código contra OWASP ASVS L2 y Top 10: inyección, control de acceso, sesión, CSRF, XSS, subida de archivos, registros, configuración y despliegue.
4. Privilegios de la base de datos.
5. Cobertura ≥ 80% en todos los paquetes, **incluidas las vistas web**.

## Hallazgos y correcciones

| # | Hallazgo | Severidad | Corrección |
|---|---|---|---|
| 1 | 7 vulnerabilidades en dependencias: zod (DoS), sanitize-html (3 bypass de saneamiento), undici (2 DoS, vía Serverless) y happy-dom (ejecución de código, solo en pruebas) | Alta | zod 4.6.7, sanitize-html 2.18.1 y happy-dom 21.0.4. Para undici, override `undici@6 → 6.29.1` (parche), sin subir Serverless. `pnpm audit` queda limpio |
| 2 | El rate limit usaba ventanas fijas: en el borde de dos ventanas se permitía el doble del límite. Era también la causa de la prueba intermitente de la API | Media | Ventana deslizante: los intentos de la ventana anterior cuentan en proporción a lo que aún se superpone (migración `20261027000100`, prueba pgTAP `06_rate_limit`) |
| 3 | La guía de despliegue decía que `supabase db push` carga `seed.sql`. En realidad no carga ninguna semilla, y con `--include-seed` cargaría también `seed.local.sql` (superusuario y contraseñas locales) | Alta (si se seguía la guía) | `apps/api/README.md`: migraciones con `db push` (nunca `--include-seed`) y `seed.sql` aparte con `psql` |
| 4 | El logo acepta SVG. Abierto directamente desde la URL firmada de S3, un SVG con scripts se ejecutaría en el dominio del bucket | Baja | Las URL firmadas fuerzan `Content-Disposition: attachment`: `<img>` lo sigue mostrando y el navegador nunca lo ejecuta como documento |
| 5 | Al perderse la sesión en una página protegida, la vista se redibujaba con `session.me = null` y lanzaba errores antes de volver al login | Baja | `App.vue` solo dibuja páginas protegidas si hay sesión cargada |
| 6 | El reintento del login federado armaba la URL con el proveedor guardado en `sessionStorage` sin validarlo | Baja | Solo se aceptan proveedores conocidos |
| 7 | La cobertura web solo medía la lógica: con todo `src` (vistas, layouts, componentes) era ~20% | — | Pruebas de vistas que montan la app real (router, Vuetify, i18n, Pinia) contra una API simulada: 97,7% de líneas sobre todo `src` |

Además:
- Se agregaron pruebas pgTAP que impiden regresiones: todas las funciones `SECURITY DEFINER` fijan `search_path` y ninguna es ejecutable por `PUBLIC`.
- Se eliminaron los textos `pages.comingSoon`, que habían quedado sin uso.

## Verificado sin cambios

- **Inyección:** todas las consultas son parametrizadas (Kysely y `sql` con parámetros). No hay `sql.raw`, `v-html`, `innerHTML` ni `eval`.
- **Control de acceso:**
  - RLS en todas las tablas y roles de aplicación sin propiedad de objetos;
  - nada concedido a `PUBLIC` ni a los roles de Supabase (`anon`, `authenticated`, `service_role`);
  - permiso revisado en la BD en cada request.
- **Sesión:**
  - access token solo en memoria; refresh en cookie `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/api/auth`;
  - las sesiones se revocan al cambiar o restablecer la contraseña, al desactivar al usuario y por acción del administrador;
  - la revocación queda en la BD, que se consulta en cada request y en cada refresh; las acciones del administrador y el restablecimiento también cierran la sesión en Cognito;
  - inactividad y duración máxima aplicadas en `app.authenticate()`.
- **CSRF:** se valida el `Origin` y el doble envío de token en refresh y logout.
- **Enumeración de usuarios:** login, recuperación y registro responden igual exista o no la cuenta.
- **Rate limit:**
  - en login, desafíos, federado, recuperación, restablecimiento, invitación y registro;
  - WAF con reglas administradas y límites por IP.
- **Cabeceras:**
  - API: HSTS, `nosniff`, `no-store`, CSP `default-src 'none'` y `frame-ancestors 'none'`;
  - web, desde CloudFront: CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y COOP;
  - TLS 1.2 como mínimo.
- **Registros:** el logger redacta claves sensibles a cualquier profundidad, y los errores 500 no exponen detalles.
- **Subidas:**
  - POST prefirmado con tipo fijo y rango de tamaño;
  - la API vuelve a validar el tamaño al confirmar.
- **Lo simulado del entorno local** (`apps/api/dev`, MFA `123456`) no entra en los bundles de las Lambdas.
- **Secretos:** gitleaks no encontró nada, ni en el historial ni en los cambios sin commit.

## Cobertura

| Paquete | Pruebas | Líneas | Ramas | Qué mide |
|---|---|---|---|---|
| shared | 29 | 100% | 100% | todo `src` |
| ui | 6 | 100% | 95,5% | todo `src` |
| web | 105 | 97,7% | 90,4% | todo `src` salvo `main.ts` (arranque) y `env.d.ts` (tipos) |
| api | 141 | 97,8% | 86,2% | todo `src` salvo los adaptadores AWS y los `index.ts` de cada Lambda, que solo conectan clientes reales |
| pgTAP | 103 | — | — | estructura, restricciones, control de acceso, autenticación, auditoría y rate limit |

Cada paquete falla si baja del 80% en líneas, funciones, ramas o sentencias.

## Riesgos residuales y pendientes

- **App móvil (fase 5):** sin revisar, porque no existe.
- **Infraestructura AWS:** el WAF, CloudFront y las cabeceras están revisados solo en `serverless.yml`. Hay que confirmarlos tras el primer despliegue (por ejemplo, con un escáner de cabeceras y una prueba de que API Gateway rechaza llamadas sin `X-Origin-Verify`).
- **CSP de la web:** mantiene `style-src 'unsafe-inline'`, que Vuetify necesita para los estilos dinámicos. Los scripts sí están restringidos.
- **Login administrado de Cognito (móvil):** solo aplica el piso de 12 caracteres (ver spec 04).
- **GitHub Actions:** falta fijar las acciones por SHA cuando exista el repositorio remoto.
