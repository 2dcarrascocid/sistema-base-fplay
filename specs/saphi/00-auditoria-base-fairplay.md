# Saphi Chile — Fase 0: auditoría de Base Fairplay

Fecha: 2026-10-27. Referencia inspeccionada: commit `1666d45`.

Estado: **inspección estática terminada; validación ejecutable pendiente por entorno**. Este informe no aprueba la arquitectura ni autoriza implementación. Solo se agrega este documento: no se modifican código, dependencias, semillas, migraciones ni infraestructura. Las propuestas siguientes son insumos de Fase 1, no decisiones aprobadas.

## A. Diagnóstico del repositorio

### Alcance y evidencia

Se revisaron manifiestos y lockfile, API, servidor local, web, paquetes compartidos, nueve migraciones, estructura de siete archivos pgTAP, especificaciones existentes, configuración Serverless, CI y scripts de desarrollo/pruebas. No hay `AGENTS.md` encontrado en el inventario del repositorio ni un grafo `graphify-out/graph.json`; el análisis se hizo directamente sobre las fuentes, sin generar un grafo adicional. No se accedió a AWS ni a bases remotas.

| Aspecto | Estado comprobado | Evidencia |
|---|---|---|
| Monorepo | Cuatro paquetes: `@base/api`, `@base/web`, `@base/shared`, `@base/ui`; workspaces `apps/*`, `packages/*` | [workspace](../../pnpm-workspace.yaml), [manifiesto raíz](../../package.json) |
| API | Funciones de negocio agrupadas en `auth`, `me`, `admin`, `config`; cuatro triggers Cognito adicionales | [Serverless](../../apps/api/serverless.yml) |
| Rutas | Tabla `Record<string, Route>` con claves `METHOD /resource`; composición manual y adaptador API Gateway REST v1 | [router HTTP](../../apps/api/src/lib/http.ts), [rutas admin](../../apps/api/src/admin/routes.ts) |
| Autenticación | JWT de acceso Cognito, verificación de firma/emisor/cliente/caducidad y `origin_jti`; sesión y estado del usuario comprobados en BD | [autenticación](../../apps/api/src/lib/authenticate.ts), [adaptadores AWS](../../apps/api/src/lib/aws/services.ts) |
| Autorización | Permiso `menu:action`, unión de perfiles activos, jerarquía de roles; superusuario implícito en TypeScript | [permisos compartidos](../../packages/shared/src/permissions.ts), [modelo SQL](../../supabase/migrations/20261024000300_permissions.sql) |
| Persistencia | Kysely + pg, nombres de tablas calificados por esquema, transacción con actor por operación autenticada | [BD](../../apps/api/src/lib/db.ts), [tipos de BD](../../apps/api/src/lib/db-types.ts) |
| RLS | Políticas y grants explícitos para `app_api` y `app_auth`; funciones privilegiadas con `search_path` fijo | [control de acceso](../../supabase/migrations/20261024000600_access_control.sql) |
| Auditoría | Log append-only con cadena SHA-256, bloqueo transaccional para serializar inserciones, consulta de integridad | [SQL de auditoría](../../supabase/migrations/20261024000500_security.sql), [servicio](../../apps/api/src/lib/audit.ts) |
| Frontend | Vue/Vuetify, rutas lazy declaradas en código, menús dinámicos recibidos por `/me`, guards y Pinia | [rutas](../../apps/web/src/router/index.ts), [layout](../../apps/web/src/layouts/AppLayout.vue) |
| Multiempresa | No se encontró modelo de empresas, membresías ni contexto de tenant | [identidad](../../supabase/migrations/20261024000200_identity.sql), [tipos actuales](../../apps/api/src/lib/db-types.ts) |
| Desarrollo local | PostgreSQL 17 por Supabase CLI; demás servicios Supabase deshabilitados; proveedores externos simulados | [configuración](../../supabase/config.toml), [servidor local](../../apps/api/dev/server.ts) |
| CI/CD | CI de tipos, pruebas, build web, bundle API y secretos; no hay despliegue automático en el workflow revisado | [CI](../../.github/workflows/ci.yml) |
| Móvil / agricultura | No existe app móvil ni módulos agrícolas en el inventario actual | [árbol documentado](../../README.md) y archivos inspeccionados |

La API actual combina casos de uso y persistencia en archivos funcionales. Tiene puertos para servicios externos y composición explícita por funciones; no usa contenedor de inyección de dependencias ni una estructura hexagonal completa por módulo. No corresponde reordenar esos módulos para incorporar Saphi.

### Dependencias y versiones

Versiones declaradas y reflejadas en los importadores del [lockfile](../../pnpm-lock.yaml); no equivalen a versiones ejecutadas en esta sesión:

| Grupo | Versiones |
|---|---|
| Runtime y herramientas | Node `>=24.0.0 <25`, `.nvmrc` 24; pnpm 10.34.8; TypeScript 6.0.3; Supabase CLI 2.117.0 |
| API | Serverless 4.43.0, AWS SDK 3.1152.0, aws-jwt-verify 5.2.1, Kysely 0.28.18, pg 8.23.1, Zod 4.6.7, sanitize-html 2.18.1 |
| Web | Vue 3.5.43, Vuetify 3.13.7, Pinia 3.0.4, Vue Router 4.6.4, Vue I18n 11.4.12, Vite 7.3.7 |
| Pruebas | Vitest y coverage-v8 4.1.12, Vue Test Utils 2.4.11, happy-dom 21.0.4 |
| BD / AWS | PostgreSQL major 17 configurado localmente; Lambda `nodejs24.x`, arm64, 512 MB, timeout 10 s |

No hay dependencias de mapas, gráficos, IoT, PostGIS cliente ni TimescaleDB declaradas. No se instaló ninguna. El contrato compartido actual contiene utilidades de permisos, RUT, contraseñas y plantillas; los DTO de la web viven en [tipos de servicios](../../apps/web/src/services/types.ts). Zod pertenece hoy a la API, no a `@base/shared`.

## B. Componentes reutilizables y extensiones

| Componente | Reutilización prevista | Extensión necesaria |
|---|---|---|
| [authed](../../apps/api/src/lib/authenticate.ts) | Conservar JWT, sesión, estado, MFA pendiente, permisos y transacción con actor | Componer autorización de empresa dentro de la transacción; no modificar `app.authenticate()` de entrada |
| [withActor](../../apps/api/src/lib/db.ts) | `set_config('app.user_id', ..., true)` evita que el contexto sobreviva al commit/rollback | Contexto de empresa adicional, local a la misma transacción, validado por membresía |
| [Deps](../../apps/api/src/lib/deps.ts), [puertos](../../apps/api/src/lib/ports.ts), [composición AWS](../../apps/api/src/lib/aws/deps.ts) | Inyección manual y dobles para pruebas | Dependencias Saphi específicas, sin incorporar proveedores IoT al contrato global innecesariamente |
| [HTTP](../../apps/api/src/lib/http.ts), [errores](../../apps/api/src/lib/errors.ts), [errores BD](../../apps/api/src/lib/db-errors.ts) | Parseo Zod, errores sin datos sensibles, cabeceras, request ID, protección de origen | Contratos agrícolas y límites por endpoint; el cuerpo está limitado actualmente a 16 KiB |
| [modelo de permisos](../../supabase/migrations/20261024000300_permissions.sql) | Roles, perfiles, menús, acciones y vista efectiva existentes | Nuevos menús y asociaciones; usar `saphi.farms:edit`, no `saphi.farms.update` |
| [menús del usuario](../../apps/api/src/me/menu.ts) | Árbol módulo → menú → submenú, nombres es/en, filtro por `:view` | Registrar catálogo Saphi; menú dinámico no registra automáticamente componentes Vue |
| [auditoría](../../apps/api/src/lib/audit.ts) y [consulta](../../apps/api/src/audit/events.ts) | Registrar operaciones administrativas en el log existente, con redacción y request ID | Definir exposición a empresas: la lectura actual es global y el log no tiene `company_id` |
| [cliente HTTP](../../apps/web/src/services/http.ts), [sesión](../../apps/web/src/stores/session.ts), [guards](../../apps/web/src/router/guards.ts) | Token en memoria, refresh, CSRF en flujos con cookies, permisos y pasos pendientes | Servicios y estado agrícola separado; invalidar datos al cambiar de empresa o cerrar sesión |
| [AppLayout](../../apps/web/src/layouts/AppLayout.vue), [notificaciones](../../apps/web/src/stores/notify.ts), [UI](../../packages/ui/src/index.ts), [i18n](../../apps/web/src/plugins/i18n.ts) | Layout responsive y componentes existentes, locales es/en | Vistas agrícolas solo después de especificarlas; evaluar mapas/gráficos y su CSP |
| [RUT](../../packages/shared/src/rut.ts), helpers SQL | Validación y normalización de RUT existente | Confirmar reglas de RUT empresarial y unicidad; no duplicar algoritmo |
| [rate limit](../../supabase/migrations/20261027000100_rate_limit_sliding_window.sql) | Función existente y WAF | Cuotas de ingesta y consultas según volumen; no asumir límite por tenant ya existente |

La autenticación llama `app.authenticate()` en autocommit antes de la transacción del handler: así las revocaciones persisten aunque la solicitud se rechace. Debe conservarse ese orden. Los permisos se vuelven a cargar desde BD en cada petición.

## C. Estructura modular candidata

Propuesta basada en las convenciones observadas, pendiente de formalizar y aprobar en Fase 1. Solo crear cada archivo cuando su fase lo requiera; no generar directorios vacíos ni mover módulos existentes.

```text
apps/api/src/saphi/
  index.ts                       # entrada Lambda agrupada inicial
  routes.ts                      # compone tablas de rutas por dominio
  tenancy/                       # autorización de empresa, no identidad paralela
  companies/ farms/ plots/ geo/ soil-samples/ laboratory/
  devices/ telemetry/ satellite/ irrigation/ indicators/ dashboard/
  integrations/iot/               # puertos, adaptadores, normalización
  integrations/satellite/

Dentro de cada dominio que lo necesite:
  routes.ts                      # adaptador HTTP
  application/                   # casos de uso y orquestación
  domain/                        # entidades, reglas documentadas, puertos de repositorio
  infrastructure/                # repositorios Kysely que reciben la transacción existente

apps/api/test/saphi/              # conserva descubrimiento actual test/**/*.test.ts
apps/web/src/modules/saphi/
  routes.ts
  companies/ farms/ plots/ maps/ laboratory/ devices/
  telemetry/ satellite/ irrigation/ indicators/ dashboard/
  services/ stores/               # solo responsabilidades compartidas de Saphi
apps/web/test/saphi/
packages/saphi/
  package.json
  tsconfig.json
  vitest.config.ts
  src/index.ts
  src/contracts/ src/schemas/ src/types/ src/constants/
supabase/migrations/             # nuevas migraciones cronológicas, sin editar las nueve actuales
supabase/tests/                  # pruebas Saphi inicialmente en el directorio ya utilizado
specs/saphi/                     # este informe; especificaciones de Fase 1 después
```

El paquete candidato `@base/saphi` tendría código TypeScript compartido entre API y web, sin importar AWS, Vue, pg ni Kysely. Los esquemas requerirían evaluar Zod como dependencia explícita de ese paquete. `@base/shared` seguirá siendo transversal y no dependerá de Saphi. La aplicación depende de puertos del dominio; infraestructura los implementa; las rutas ensamblan con dependencias explícitas. No importar repositorios internos entre dominios ni usar una segunda conexión fuera de la transacción autorizada.

La Lambda Saphi inicial seguiría el patrón agrupado de la base. La ingesta y el procesamiento satelital podrán necesitar funciones asíncronas separadas, sujetas a volumen y autorización de infraestructura. Cada entrada nueva deberá incluirse tanto en Serverless como en el servidor local y el script de bundle.

Las pruebas dentro de `src/saphi/**/tests` propuestas en el adjunto no serían descubiertas por la configuración actual de la API. Se recomienda conservar `test/saphi/**/*.test.ts`. Para pgTAP, no asumir ejecución recursiva de una futura carpeta `tests/saphi`; verificarlo antes o usar archivos en el directorio actual.

## D. Modelo de datos preliminar

Se recomienda **evaluar el esquema `saphi`** para mantener clara la propiedad agrícola y dejar `app` transversal. No se crea todavía: exige decisión explícita, grants mínimos, tipos Kysely y pruebas. Compartir BD facilita FKs hacia `app.users` y transacciones; separar esquema no aísla por sí solo a las empresas.

| Entidad candidata | Relación y propósito |
|---|---|
| `companies` | Empresa, RUT normalizado, nombres, contacto y estado |
| `company_users` | Relación explícita empresa ↔ `app.users`; estado de membresía; sin contraseña, rol ni permisos duplicados |
| `farms` | Empresa 1:N predios, superficie y ubicación |
| `plots` | Predio 1:N cuarteles; variedad, año, suelo y geometría bajo contrato aprobado |
| `sampling_points` | Cuartel 1:N puntos; coordenadas y referencia estable |
| `soil_samples` | Cuartel y punto opcional, fecha de toma y trazabilidad |
| `physicochemical_analyses`, `microbiological_analyses` | Muestra 1:N resultados; método, laboratorio, unidad y parámetros por definir |
| `devices` | Cuartel, identificador externo con ámbito de proveedor, metadatos y estado |
| `sensor_readings` | Dispositivo, instante observado y recibido, magnitud, unidad, valor e identidad de origen |
| `satellite_observations` | Cuartel, proveedor, adquisición, metadatos, índices recibidos y referencias a objetos |
| `irrigation_events` | Cuartel, fechas, cantidad/unidad documentada y fuente |
| `indicator_results` | Cuartel/ámbito aprobado, período, estrategia y versión, entradas trazables y resultado |

No fijar ahora unidades, catálogos de laboratorio, rangos agronómicos, fórmulas ni cardinalidades especiales no documentadas. Guardar imágenes/archivos como objetos con referencias autorizadas, no como blobs en tablas de series. No implementar tablas de identidades, sesiones, roles o permisos agrícolas.

Se propone propagar `company_id` en las entidades agrícolas, además de sus FKs de negocio, y usar unicidad/FKs compuestas como `(company_id, farm_id)` para impedir que un hijo de A referencie un padre de B. Una FK simple por UUID no protege esa coherencia. El detalle de índices, borrado lógico y retención corresponde a Fase 1/3.

La idempotencia de telemetría debe incluir ámbito de proveedor/dispositivo e identidad de mensaje; la clave definitiva depende del protocolo. Si se particiona por fecha, revisar las restricciones de unicidad de PostgreSQL: una clave única de la tabla particionada debe incluir las columnas de partición. No prometer deduplicación global mediante una clave incompatible con esa regla.

## E. Estrategia de seguridad propuesta

1. Mantener Cognito, `authed`, MFA, sesiones y permisos actuales. Un permiso habilita una operación; una membresía habilita acceso a la empresa. Exigir ambos y no derivar membresías de `role = admin`.
2. Recibir la empresa como selector no confiable. Dentro del `tx` que ya tiene `app.user_id`, validar membresía activa y empresa activa desde BD; recién entonces establecer `set_config('saphi.company_id', ..., true)`. Para rutas por recurso, comprobar pertenencia en BD, aunque el cliente envíe IDs válidos de otra empresa.
3. En tablas Saphi, políticas RLS específicas por operación con `USING` y `WITH CHECK`, permiso existente y membresía vigente. Contexto ausente o inválido debe denegar. Revalidar membresía en políticas para que el selector de empresa no sea suficiente como prueba de autorización.
4. No conceder acceso agrícola a `app_auth`. Mantener a `app_api` sin propiedad de tablas ni `BYPASSRLS`. Los propietarios y funciones `SECURITY DEFINER` pueden eludir RLS: reducir su superficie, fijar `search_path`, calificar objetos y revocar ejecución a `PUBLIC`, siguiendo la base. Evaluar `FORCE ROW LEVEL SECURITY` en tablas nuevas sin alterar políticas históricas mecánicamente.
5. La creación de una empresa y su primera membresía requiere un flujo de bootstrap autorizado y atómico. Una política que exija membresía previa para toda inserción impediría crear la primera. Resolver quién administra altas y membresías y cómo evitar autoasignación/escalamiento.
6. El superusuario recibe permisos implícitos en TypeScript; eso **no decide** su alcance sobre datos de empresas. Recomendación inicial: exigir membresía también en Saphi. Un eventual acceso de soporte transversal necesita una decisión explícita y auditoría; no cambiar la semántica global de la base.
7. Los perfiles actuales son globales. En la propuesta mínima, un permiso Saphi se aplica a todas las empresas donde el usuario tenga membresía. Si necesita ser editor en A y lector en B, hay que especificar cómo extender el modelo existente antes de implementarlo; una tabla de membresías sola no cubre esa diferencia.
8. Conservar auditoría en `app.audit_log` para operaciones relevantes y registrar empresa en metadatos estructurados. Su política de lectura actual solo exige `security.audit:view` y no segmenta por empresa: reservar esa pantalla a operadores transversales autorizados mientras no exista un contrato de consulta tenant. No otorgar ese permiso como solución de auditoría empresarial. No modificar filas históricas ni la cadena de hashes.
9. Evitar auditar cada lectura de sensor en la cadena global: el bloqueo advisory serializa inserciones. Definir auditoría de ingestas/lotes y errores relevantes, con trazabilidad técnica separada y volumen medido.
10. Cambiar empresa debe limpiar cachés, selecciones y resultados web pendientes. Las URLs firmadas, exportaciones, agregados, comparaciones y mapas también requieren autorización empresarial; ocultar menús no garantiza aislamiento.

Permisos candidatos: `saphi.companies:view/create/edit`, `saphi.farms:view/create/edit`, `saphi.plots:view/create/edit`, `saphi.samples:view/create/edit`, `saphi.laboratory:view/create/edit`, `saphi.devices:view/create/edit`, `saphi.telemetry:view`, `saphi.satellite:view`, `saphi.irrigation:view/create/edit`, `saphi.indicators:view` y `saphi.dashboard:view`. La barra abrevia acciones, no forma parte de una clave real: por ejemplo `saphi.farms:edit`. Reutilizar las acciones existentes y registrar menús/acciones antes de conceder permisos. Sin roles nuevos ni asignaciones masivas por defecto.

Las rutas futuras usarían `/saphi/...` en API Gateway y `/api/saphi/...` desde el navegador, porque [el cliente](../../apps/web/src/services/http.ts) ya agrega `/api`. Cada endpoint deberá especificar método, permiso, ámbito, validaciones, paginación, límites temporales, respuesta y errores. Ninguna ruta se registra en Fase 0.

La ingesta máquina a máquina no debe pasar por login humano ni aceptar un `company_id` de la carga como autoridad. Necesita identidad de dispositivo/proveedor, vínculo validado con la empresa, protección contra repetición, cuotas e idempotencia. Ese contrato queda pendiente, sin modificar Cognito ni relajar la protección de origen para resolverlo.

## F. Compatibilidad geoespacial y series temporales

### PostGIS

El proyecto configura PostgreSQL 17, pero no instala ni utiliza PostGIS. La especificación base [del modelo de datos](../01-modelo-de-datos.md) restringe extensiones externas; incorporar PostGIS requiere documentar y aprobar esa excepción. PostgreSQL major 17 por sí solo no demuestra que una extensión esté disponible.

PostGIS es un candidato apropiado para polígonos, validación geométrica e índices espaciales, condicionado a una versión que soporte PG17 y esté disponible tanto en la imagen local como en el proveedor real. No se confirmó versión instalada, catálogo disponible ni compatibilidad del servicio desplegado. No ejecutar `CREATE EXTENSION` en esta fase.

Validaciones necesarias en un entorno autorizado: consultar `version()`, `pg_available_extensions` y `pg_extension`; comprobar la matriz de soporte de la versión ofrecida; ensayar instalación en BD descartable y migraciones reproducibles. Después probar GeoJSON de ida/vuelta, SRID acordado (candidato 4326), validez de polígonos, límites de tamaño y consultas con índices. No calcular hectáreas como si grados fueran metros: acordar geografía/proyección y precisión.

Alternativa evaluable: GeoJSON validado como JSONB para almacenamiento/intercambio inicial sin consultas GIS avanzadas. No equivale a PostGIS en validez topológica, superficie ni rendimiento espacial. El compromiso debe quedar explícito si se elige.

### Telemetría / TimescaleDB

No hay evidencia de TimescaleDB instalado ni configurado. Su disponibilidad depende de la versión concreta, imagen, proveedor, privilegios y requisitos operativos; comprobar soporte de PG17 y condiciones de licencia/costo antes de adoptarlo. La guía de [API](../../apps/api/README.md) menciona Supabase alojado como BD de producción, mientras el stack AWS solo recibe un host externo: no hay una BD administrada aprovisionada en Serverless ni certeza de que producción use PG17. Confirmar proveedor y versión antes de cerrar esta decisión.

| Alternativa | Ventaja | Condición o costo |
|---|---|---|
| PostgreSQL nativo con índices | Menor cambio y paridad con la base | Medir volumen y consultas antes de particionar |
| PostgreSQL nativo particionado por tiempo | Retención por partición y pruning temporal | Automatizar particiones futuras, retención, índices y deduplicación compatible |
| TimescaleDB | Funciones especializadas de series y agregación | Extensión aprobada y soportada en local/producción; evaluar operación/licencia |
| Almacenamiento de histórico en objetos y procesamiento asíncrono | Archivo de gran volumen y posible menor costo de histórico frío | Infraestructura nueva, latencia y consistencia adicionales; sin aprovisionar ahora |

Recomendación provisional: PostgreSQL nativo; no imponer particiones ni TimescaleDB por el tamaño de cinco hectáreas. El área no permite estimar mediciones. Estimar `filas/día = dispositivos × magnitudes por envío × 86400 / intervalo_en_segundos`, ajustando por lotes y retransmisiones. Solicitar frecuencia, dispositivos, retención, crecimiento y consultas; medir filas/bytes, percentiles de latencia, conexiones y costo. La decisión definitiva debe preceder a la migración de telemetría.

## G. Integraciones y riesgos técnicos

| Riesgo o decisión | Implicación y mitigación propuesta |
|---|---|
| Proveedor IoT desconocido | Faltan fabricante/modelo, protocolo, payload, autenticación, reloj, frecuencia y entrega. Especificar `TelemetryProvider` y `NormalizedMeasurement` validado, sin adaptador real aún |
| AWS versus Azure | Mantener AWS. Comparar webhook autenticado, AWS IoT Core y proveedor externo; Azure solo con decisión explícita, costos y operación documentados |
| Protección de origen | Las rutas actuales exigen secreto añadido por CloudFront. Un webhook directo o ingesta IoT requiere diseño propio de entrada; no desactivar esa protección global |
| Satélite | Faltan fuente/licencia, resolución, cobertura, nubes, periodicidad y formato. Diseñar puerto independiente; NDVI/NDWI solo recibidos/trazables hasta aprobar fórmulas |
| Riego e indicadores | Unidades, precisión, zona horaria, métodos y fórmulas no definidos. Estrategias versionadas y resultados sin presentar datos sintéticos como reales |
| Mapas y navegador | CSP permite conexión al propio origen y bucket de fotos; `Permissions-Policy` deshabilita geolocalización. Teselas, workers y ubicación GPS requieren evaluación y cambios puntuales justificados |
| UI | No hay biblioteca de mapas/gráficos. Comparar alternativas por licencia, accesibilidad, peso, CSP y uso real; no incorporar dependencias todavía |
| Concurrencia Lambda/BD | Pool `max: 2` por contenedor, timeout SQL 10 s y Lambda 10 s. Evaluar margen de timeout, concurrencia, consultas acotadas y pool/proxy según proveedor |
| Procesamiento pesado | Ingesta masiva e imágenes no caben en un handler síncrono general de 10 s y cuerpo 16 KiB. Evaluar lotes, objetos y colas sin crear recursos |
| Auditoría global | Permiso de lectura transversal y serialización de la cadena. Evitar exposición a tenants y escritura por medición sin diseño |
| Privilegios globales | Roles/perfiles y mantenedores de usuarios no están segmentados por empresa. No delegar administración global a gestores agrícolas como atajo |
| Despliegue documentado | La tabla inicial de Lambdas del README de API omite `admin`/`config`; algunos parámetros antiguos difieren del YAML (`webUrl` frente a `webDomain`). Usar configuración real como fuente de verdad y corregir documentación en fase autorizada |
| Seguridad declarada | ASVS L2 es objetivo y existe revisión previa; esta auditoría no es certificación ni prueba del despliegue real |

## H. Plan incremental y archivos previstos

| Fase | Entregable / dependencia | Verificación de salida |
|---|---|---|
| 0 — actual | Este informe, sin implementación | Evidencia estática, enlaces y estado de herramientas; pruebas ejecutables pendientes |
| 1 | Especificaciones `01-arquitectura`, `02-modelo-datos`, `03-seguridad`, `04-api`, `05-frontend`, `06-integraciones`, `07-pruebas` dentro de esta carpeta | Resolver decisiones bloqueantes y obtener aprobación explícita antes de código |
| 2 | Contratos, puertos y composición modular; rutas solo según contrato aprobado | Tipos, pruebas de contratos/rutas y bundle; no interfaces definitivas ni reglas agronómicas |
| 3 | Nuevas migraciones, catálogo de permisos, membresías, constraints y RLS | pgTAP y API con usuarios/empresas A/B, permisos y contextos inválidos |
| 4 | Empresas, predios, cuarteles y puntos de muestreo | CRUD autorizado, integridad tenant y navegación/componentes |
| 5 | Muestras y laboratorio con catálogos/unidades aprobados | Validación, trazabilidad e históricos |
| 6 | Dispositivos, ingesta y consultas tras aprobar proveedor/volumen | Autenticación de máquina, replay, duplicados, orden temporal y carga |
| 7 | Satélite tras aprobar fuente | Contratos de proveedor, datos inválidos, aislamiento de archivos |
| 8 | Indicadores con fórmulas aprobadas | Casos de referencia aprobados, unidades y versionado |
| 9 | Dashboard con mapas/gráficos previamente evaluados | Filtros por empresa, agregados, accesibilidad, i18n y responsive |
| 10 | Validación integral y de seguridad | Regresiones base, cobertura mínima y verificación de infraestructura en entorno autorizado |

Archivos a crear en fases futuras, todavía no creados:

- Especificaciones enumeradas de Fase 1: contratos y decisiones antes de implementar.
- Módulos y pruebas del árbol candidato de la sección C: responsabilidades agrícolas aisladas y compatibles con los globs actuales.
- Migraciones SQL nuevas en [migraciones](../../supabase/migrations/), pruebas en [tests SQL](../../supabase/tests/): esquema aprobado, relaciones, RLS, grants y catálogo de menús/acciones. Los datos requeridos en entornos existentes deben introducirse mediante migraciones, no depender de volver a cargar semillas.
- Documentación operativa Saphi cuando existan flujos concretos, sin directorios vacíos.

Archivos existentes que probablemente deban extenderse, con justificación:

| Archivo | Motivo previsto |
|---|---|
| [Serverless](../../apps/api/serverless.yml) | Registrar únicamente funciones/rutas e IAM aprobados; no desplegar automáticamente |
| [servidor local](../../apps/api/dev/server.ts) | Montar las mismas rutas Saphi que en Lambda y adaptadores locales explícitos |
| [bundle check](../../apps/api/scripts/bundle-check.mjs) | Verificar las entradas nuevas; su lista actual es explícita |
| [tipos de BD](../../apps/api/src/lib/db-types.ts) | Conectar tablas Saphi con Kysely sin tipos inseguros ni dependencias inversas |
| [router web](../../apps/web/src/router/index.ts) | Incorporar rutas lazy Saphi con permisos existentes |
| [español](../../apps/web/src/locales/es.ts), [inglés](../../apps/web/src/locales/en.ts) | Textos de interfaz agrícola y errores traducidos |
| [CI](../../.github/workflows/ci.yml) | Ejecutar pruebas del paquete nuevo: `pnpm typecheck` es recursivo, los comandos de test actuales enumeran paquetes |
| [lockfile](../../pnpm-lock.yaml), manifiestos afectados | Registrar solo dependencias aprobadas y enlaces workspace reproducibles |
| [README raíz](../../README.md), [README API](../../apps/api/README.md) | Instrucciones locales/operativas y corrección de divergencias observadas |

No se prevé modificar autenticación, sesiones ni migraciones históricas. Cualquier extensión de auditoría o helpers transversales necesitará especificación, justificación y pruebas de regresión propias.

## I. Validación y preguntas pendientes

### Verificación realizada y límites

- Inventario y lectura de fuentes, búsqueda de tenant/extensiones y revisión de contratos, políticas, descubrimiento de pruebas y CI.
- Estado Git inicial sin cambios de trabajo reportados; Git advierte falta de acceso al archivo global de ignore. Eso no impidió la lectura del repositorio.
- `node --version` y `pnpm --version`: comandos no encontrados en el PATH. `node_modules` existe, pero no demuestra ejecutabilidad ni instalación válida.
- `pnpm typecheck` y `pnpm db:test`: intentados, no iniciaron por falta de pnpm. No hubo resultados de pruebas ni cobertura nuevos.
- `docker --version`: cliente 28.5.1. `docker ps` no logró conectar al pipe del motor y advirtió acceso denegado a configuración de usuario. No se comprobó PostgreSQL activo ni catálogo de extensiones. No se inició ni reinició Docker ni se aplicaron migraciones.
- Las cifras de [la revisión anterior](../06-revision-seguridad-y-cobertura.md) son históricas, no una validación de este informe. Los cuatro paquetes configuran umbral de 80% en líneas, funciones, ramas y sentencias; la API excluye adaptadores AWS y entradas `index.ts`.

La suite API usa BD real `app_test` y dobles externos. Su [global setup](../../apps/api/test/global-setup.ts) elimina y recrea **esa base de pruebas**; no debe ejecutarse apuntando a producción. Los tests SQL utilizan transacciones y pgTAP. No se requiere credencial cloud para las suites locales.

Para cerrar la validación técnica cuando el entorno esté disponible: Node 24 y pnpm 10.34.8, Docker operativo y PostgreSQL local; ejecutar `pnpm typecheck`, tests de shared/ui/web/API, build web, `bundle:check` y `pnpm db:test` según CI. No ejecutar `db:reset` sobre una BD de trabajo para esta auditoría. Verificar además la ejecución de los nuevos tests pgTAP cuando se incorporen.

Pruebas mínimas a especificar para multiempresa: A no lee, modifica, exporta ni referencia datos de B; contexto ausente deniega; empresa/membresía inactiva deniega; permiso sin membresía y membresía sin permiso deniegan; no hay fuga entre transacciones; revocación de sesión y membresía surte efecto; protección de altas de membresía; comportamiento explícito del superusuario; mapas, auditoría, objetos firmados y agregados respetan el mismo ámbito. Mantener regresiones de autenticación, MFA, usuarios/perfiles y permisos base.

### Decisiones para la Fase 1

1. ¿Quién crea empresas y administra la primera membresía? ¿Hay usuarios en varias empresas y permisos distintos en cada una?
2. ¿El superusuario debe acceder a datos agrícolas sin membresía? ¿Quién puede consultar auditoría global y quién necesita auditoría empresarial?
3. ¿Se aprueba evaluar el esquema `saphi`, el paquete `@base/saphi` y la composición agrupada propuesta, preservando la plataforma transversal?
4. ¿Cuál es el proveedor real de PostgreSQL, versión, región, conectividad, backups y catálogo de extensiones? ¿Se permite la excepción PostGIS respecto de la especificación base?
5. ¿Cuántos dispositivos/magnitudes habrá, con qué intervalo, retención, crecimiento y consultas? ¿Qué presupuesto/latencia determinan almacenamiento y procesamiento?
6. ¿Cuáles son fabricante, modelo, protocolo, mensajes, credenciales y garantías de entrega IoT? ¿Existe una dependencia contractual de Azure?
7. ¿Qué fuente/licencia satelital, periodicidad y manejo de nubes se usarán? ¿Se reciben índices calculados o se aprobarán fórmulas propias?
8. ¿Cuáles son parámetros, unidades, precisión, métodos y catálogos de laboratorio/riego? ¿Quién valida fórmulas e indicadores?
9. ¿Se necesita GPS del navegador, carga/dibujo de polígonos, mapas offline o imágenes de laboratorio? Eso determina CSP, límites de carga, almacenamiento y bibliotecas.
10. ¿Cuáles son criterios funcionales medibles del piloto, responsables de aprobación y requisitos de conservación de datos?

Estas respuestas no bloquean la utilidad de la auditoría; sí condicionan las especificaciones y migraciones. La siguiente actividad autorizable es Fase 1. No se inicia esqueleto, modelo físico, integración externa ni despliegue con este documento.
