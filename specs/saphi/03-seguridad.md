# Saphi Chile — 03. Seguridad y aislamiento

Estado: **PROPUESTA DE FASE 1 — pendiente de aprobación**. Mantener mecanismos base está aprobado; las reglas de alcance/administración aquí propuestas requieren aprobación. No hay cambios de configuración ni políticas aplicadas.

Referencias: [modelo](./02-modelo-datos.md), [API](./04-api.md), [pruebas](./07-pruebas.md).

## Regla de autorización

Para una operación agrícola con permiso `p` y empresa `c`:

`permitir = sesión válida ∧ usuario activo ∧ pasos MFA/contraseña completos ∧ empresa activa ∧ membresía activa(c) ∧ permiso_global(p) ∧ concesión_empresarial(c,p)`.

`permiso_global` usa la base existente y el catálogo activo de menús/acciones; `concesión_empresarial` referencia ese mismo `menu_action_id`. No hay segundo catálogo, roles adicionales, contraseñas ni usuarios Saphi. Para superusuario, el permiso global implícito no reemplaza membresía/concesión contextual. La capacidad efectiva devuelta a la UI es una instantánea; cada petición vuelve a comprobar BD.

Ejemplo exigido: el mismo usuario tiene globalmente `saphi.farms:view` y `saphi.farms:edit`. En A se le asignan ambos; en B solo `view`. PATCH en A puede autorizarse; PATCH en B se rechaza aunque la UI conozca el permiso global. Permiso global sin fila contextual deniega. Concesión contextual sin permiso global también deniega. No usar `actor.permissions` como prueba completa de acceso empresarial.

## Membresías y administración recomendadas

R03/R07: membresía explícita por usuario/empresa, permisos por usuario vinculados al catálogo existente; sin herencia de rol `admin` a datos de todas las empresas.

| Operación | Propuesta de autoridad y controles |
|---|---|
| Alta de empresa y bootstrap | Solo superusuario global, endpoint específico, razón obligatoria; empresa + primera membresía + concesiones explícitas + auditoría en una transacción |
| Selección del primer gestor | Usuario existente y activo, sin crear identidad; concesiones limitadas al catálogo Saphi y al techo global efectivo del destinatario |
| Lectura de empresa y datos | Membresía y concesión contextual; sin bypass por ser superusuario |
| Editar/desactivar empresa | `saphi.companies:edit` efectivo; desactivar requiere además superusuario en propuesta inicial; denegación posterior a nuevos accesos |
| Ver miembros | `saphi.memberships:view` efectivo; devolver solo proyección mínima, sin endpoint global de usuarios |
| Añadir/reactivar/revocar miembros | `saphi.memberships:edit` efectivo; sin autoalta, autorreactivación ni autorevocación por este flujo |
| Asignar permisos | Mismo permiso anterior; actor solo concede permisos Saphi que posee efectivamente en esa empresa, y que destinatario puede ejercer globalmente |
| Modificar privilegios propios | Prohibido por API y BD, incluido superusuario; cambio por otro operador autorizado |
| Recuperación administrativa | Procedimiento excepcional pendiente; no diseñar puerta trasera sin aprobación |

Q01: confirmar quién crea empresas y quién administra membresías. Q02: aprobar el comportamiento restrictivo del superusuario. Q03: confirmar política del último gestor: recomendación impedir revocación de la última membresía activa con `saphi.memberships:edit` efectivo mientras la empresa esté activa. Serializar cambios sobre la fila de empresa para evitar dos revocaciones simultáneas. Cambios globales de perfiles también pueden retirar ese techo: detectar empresa sin gestor en consulta operativa y definir recuperación explícita; no modificar mantenedores globales silenciosamente. Bootstrap debe fallar si primer gestor no tiene techo global suficiente; no cambiar perfiles globales para forzar éxito.

La operación de bootstrap es una excepción de control de plataforma, no acceso genérico a datos tenant. Puede devolver la empresa recién creada y su estado de inicialización; no permite listar empresas ajenas ni consultar mediciones. Registrar actor, destinatario y razón. La futura función privilegiada comprueba por sí misma superusuario activo, argumentos y catálogo; no basta un booleano enviado desde Node.

## Contexto transaccional

1. Mantener [authed](../../apps/api/src/lib/authenticate.ts): JWT real y `app.authenticate()` en autocommit, persistiendo revocaciones aun ante rechazo.
2. Dentro de `withActor`, validar selector UUID empresarial y resolver membresía/empresa activa mediante helper estrecho. Las rutas de descubrimiento permiten consultar solo las membresías propias sin un tenant seleccionado.
3. Establecer `saphi.company_id` con `set_config(..., true)` en el mismo `tx`, jamás por sesión de conexión. No aceptar un GUC, rol o permiso suministrado por frontend como evidencia.
4. Verificar permiso global y contextual para la ruta; ejecutar consultas y auditoría de éxito dentro de ese `tx`. RLS vuelve a verificar actor, ámbito y concesión.
5. Commit/rollback elimina contexto. No abrir otra transacción ni cambiar de empresa dentro del callback. Tests reutilizan una conexión para probar ausencia de fuga.

Recomendación de serialización: lecturas autorizadas al inicio de cada sentencia con snapshots PostgreSQL; mutaciones mantienen bloqueos compartidos sobre empresa y membresía relevantes, y cambios de estado/concesiones obtienen bloqueos excluyentes en orden empresa → membresías ordenadas por UUID. Revocación se considera efectiva cuando confirma; una lectura ya iniciada puede finalizar con su snapshot. No prometer cancelación retroactiva. Retirada de permisos globales se observa en la siguiente sentencia/petición, conservando comportamiento base; probar límites de concurrencia expresamente.

## Políticas RLS propuestas (semántica, no SQL ejecutable)

| Objeto / operación | USING | WITH CHECK / entrada |
|---|---|---|
| Maestros SELECT | row.company_id = contexto y `can(company,menu,view)` | No aplica |
| Maestros INSERT | No aplica | Coincidencia de empresa, `can(...,create)` y padres de esa empresa |
| Maestros UPDATE | Coincidencia + `can(...,edit)` | Igual autorización sobre nueva fila; `company_id` inmutable; FK compuesta |
| Muestras/análisis/mediciones | SELECT por permiso del recurso; correcciones solo por flujo específico | Escritura restringida a caso de uso autorizado; sin UPDATE libre de histórico |
| Empresas SELECT | Membresía propia activa y permiso contextual de empresa | No permitir enumeración global |
| Membresías / concesiones SELECT | Propia membresía o `saphi.memberships:view` efectivo del tenant | Proyección API minimizada |
| Membresías / concesiones escritura | Sin DML directo para `app_api` | Funciones específicas revisadas, auditadas y con controles de concesión |
| DELETE | Sin política/grant inicial para históricos y maestros | Revocación de concesiones solo mediante función controlada |

`can` debe resolver membresía, empresa activa, permiso del catálogo vigente y techo global del usuario actual. Funciones de descubrimiento/consulta de concesiones no deben provocar recursión de RLS: preferir helpers `SECURITY DEFINER` mínimos que solo contesten alcance del actor, propietario de migración, `search_path` vacío, referencias calificadas y EXECUTE revocado a PUBLIC. No aceptar `actor_user_id` arbitrario. Denegar GUC ausente/malformado de forma controlada. Las pruebas como `app_api` y no como propietario son obligatorias.

El propietario de tablas y funciones privilegiadas puede eludir RLS: ese rol no es runtime. Evaluar FORCE RLS para tablas nuevas junto con helpers para no crear recursión; no presentarlo como sustituto de mínimo privilegio. Mantener `app_auth`, `anon`, `authenticated`, `service_role` y PUBLIC sin nuevos grants Saphi. No modificar políticas `app` históricas ni `app.authenticate()`.

## Auditoría y protección de información

Reutilizar `app.audit_log` y su cadena; eventos propuestos `saphi.company.created`, `saphi.membership.changed`, `saphi.permissions.changed`, `saphi.farm.updated`, `saphi.ingestion.accepted`. Incluir `companyId`, entidad, actor, requestId, resultado, versión y razón donde aplique. El servidor determina el actor. No registrar tokens, claves de dispositivo, payloads íntegros, datos sensibles innecesarios ni una fila de auditoría por medición.

La política actual `security.audit:view` permite lectura global. No otorgarla a gestores agrícolas. Auditoría empresarial de lectura queda fuera del API inicial hasta aprobar un modelo de alcance inmutable y proyección segura; no filtrar solo JSON en la UI. Mantener formato/hash histórico. Una denegación revierte la transacción del handler: registrar fallos sanitizados mediante logger base; si se exige persistencia de denegaciones en auditoría, diseñar escritura separada autorizada y sin bloquear la respuesta por errores del registro.

Consultas y exportaciones acotadas, objetos firmados tras autorizar referencias internas, y metadatos sin secretos. TLS, WAF, origen CloudFront, CSRF, tokens en memoria, expiración de sesiones y MFA permanecen. La ingesta máquina a máquina requiere autenticación independiente de proveedor, sin desactivar el secreto de origen para las rutas humanas.

## Verificación y riesgos residuales

IDs de prueba: SEC01 permiso global/contextual; SEC02 acceso A/B por todas las operaciones; SEC03 GUC ausente/forjado; SEC04 bootstrap y autoescalamiento; SEC05 superusuario; SEC06 revocaciones y snapshots; SEC07 auditoría y secretos; SEC08 objetos/exports/agregados; SEC09 regresión base. Matriz y criterios en [pruebas](./07-pruebas.md).

Capacidades diferenciadas por empresa son nuevas: no existen hoy en la base. Los mantenedores de usuarios/perfiles siguen siendo globales y solo para operadores autorizados de plataforma. No delegarlos a un gestor agrícola para habilitar techo global. Definir proceso operativo de habilitación del usuario y recuperación de empresas sin gestor antes de migraciones productivas.
