# Spec 04 — Mantenedores de configuración y auditoría (web)

Estado: **IMPLEMENTADO** (fase 4). Navegable en local; despliegue en AWS pendiente.

## Alcance

Mantenedores **solo de superusuario**. Sus menús son `superuser_only`, así que sus permisos no se pueden poner en perfiles:

1. **Parámetros generales**: nombre del sistema, logo, colores, idioma y zona horaria por defecto, y registro libre (encendido o apagado).
2. **Menús y módulos**:
   - crear, editar, activar o desactivar y ordenar menús jerárquicos (módulo > menú > submenú);
   - asignar sus acciones;
   - crear acciones especiales.
3. **Políticas de seguridad**: largo y complejidad de la contraseña, vencimiento, intentos antes de bloqueo, minutos de bloqueo, inactividad, duración máxima de la sesión, vigencia de la invitación y MFA obligatorio para el rol cliente. Para superusuario y administrador el MFA es siempre obligatorio.
4. **Plantillas de email**: invitación, activación, recuperación y cuenta bloqueada, en es/en, con variables y vista previa.

Y la **pantalla de auditoría** (permiso `security.audit:view`; exportar con `security.audit:export`; asignable con el perfil "Auditor"):
- filtros por fecha, tipo de evento, actor, entidad y resultado; paginación;
- detalle con el valor anterior y el nuevo;
- exportación CSV;
- verificación de la cadena de hashes.

## API — Lambda `config` (rol BD `app_api`)

| Ruta | Permiso |
|---|---|
| `GET/PUT /config/settings`, `POST /config/settings/logo/upload-url`, `PUT /config/settings/logo` | `config.settings:view` / `:edit` |
| `GET /config/menus`, `POST /config/menus`, `PATCH /config/menus/{id}`, `PUT /config/menus/{id}/actions`, `POST /config/menus/reorder` | `config.menus:view` / `:create` / `:edit` |
| `GET /config/actions`, `POST /config/actions`, `PATCH /config/actions/{id}` | `config.menus:view` / `:create` / `:edit` |
| `GET/PUT /config/security-policy` (incluye el MFA del rol cliente) | `config.security_policy:view` / `:edit` |
| `GET /config/email-templates`, `GET/PUT /config/email-templates/{id}`, `POST /config/email-templates/preview` | `config.email_templates:view` / `:edit` |
| `GET /audit/events`, `GET /audit/events/{id}`, `GET /audit/event-types`, `GET /audit/integrity` | `security.audit:view` |
| `GET /audit/events/export` | `security.audit:export` |

- Todo cambio de configuración se audita con el valor anterior y el nuevo (`config.*`). La exportación de auditoría también queda registrada (`audit.export`).
- Los menús de sistema (`is_system`) no cambian su `code` ni se desactivan. No hay borrado físico: los menús se desactivan.
- Plantillas:
  - se rechazan variables no permitidas para el tipo de plantilla;
  - el HTML se sanea en el servidor con una lista blanca (`sanitize-html`): sin scripts, sin atributos `on*` y solo enlaces `https:`/`mailto:`;
  - la vista previa usa datos de ejemplo y se muestra en un `iframe` con `sandbox`.
- Logo: va al bucket privado (prefijo `branding/`) y se sirve con una URL firmada, también en `/auth/config` para la pantalla de login.
- Integridad: `app.audit_chain_status()` (SECURITY DEFINER, exige `security.audit:view`) indica si la cadena verifica y en qué id se rompe.

## Política de contraseñas y Cognito

- La política configurada la aplica **el backend** en cada contraseña que se crea o cambia (invitación, recuperación, cambio, primer ingreso).
- No se modifica el User Pool en tiempo de ejecución, por dos razones:
  - `UpdateUserPool` reinicia a sus valores por defecto los campos que no se envían;
  - CloudFormation revertiría el cambio en el siguiente despliegue.
- Cognito queda como **piso mínimo fijo**: 12 caracteres, sin exigencias de complejidad. Así nunca rechaza algo que la política permite.
- La validez del refresh token de Cognito se fija en el máximo (720 h). La duración real de la sesión y la inactividad las impone `app.authenticate()` según la política.
- **Riesgo residual:** las páginas del login administrado de Cognito (móvil) solo aplican ese piso. La app móvil (fase 5) usará los endpoints de la API para cambiar y recuperar la contraseña.

## Web

- Pantallas `/config/settings`, `/config/menus`, `/config/security-policy`, `/config/email-templates` y `/security/audit`.
- Los cambios de marca (nombre, colores) se aplican al guardar.

## Pruebas

- **API:**
  - 403 para quien no es superusuario en todas las rutas `config`, incluido un administrador con todos los perfiles;
  - validación de rangos;
  - auditoría de cambios;
  - menús de sistema protegidos y jerarquía válida;
  - orden;
  - saneamiento de HTML y variables desconocidas;
  - filtros y exportación de auditoría;
  - detección de alteración en la cadena.
- **pgTAP:** `app.audit_chain_status()` exige permiso.
- **Web:** lógica nueva (árbol de menús, diff JSON de auditoría) con cobertura ≥ 80%.
