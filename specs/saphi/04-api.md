# Saphi Chile — 04. Contratos API

Estado: **PROPUESTA DE FASE 1 — pendiente de aprobación**. Ningún endpoint se implementa ni registra ahora. Métodos, límites y formatos siguientes son recomendaciones de contrato; unidades, reglas agronómicas y proveedores siguen pendientes.

Referencias: [modelo](./02-modelo-datos.md), [seguridad](./03-seguridad.md), [integraciones](./06-integraciones.md), [pruebas](./07-pruebas.md).

## Convenciones comunes

Base pública `/api/saphi`; en router Lambda `/saphi`. Reutilizar Bearer y sesión base, protección de origen y errores HTTP existentes. No crear JWT empresarial ni confiar en empresa de un claim o cuerpo. Selección en URL: `/companies/{companyId}/...`. Todos los identificadores son UUID. Rechazar `companyId` en cuerpo de recursos tenant; se deriva de URL validada, membresía y RLS. Sin cabecera empresarial paralela. El cliente HTTP ya agrega `/api`.

Respuesta individual recomendada `{data:T}`; listado `{data:T[],page:{nextCursor:string|null,hasMore:boolean}}`. Las respuestas base existentes conservan su forma; estos envelopes solo son contratos Saphi nuevos. `T` no incluye secretos, hash de payload, claves de objeto ni información ajena. POST creado →201 y `Location`; GET/PATCH/PUT →200; revocación →200 con estado/version; duplicado de integración según sección propia. Fechas RFC3339 con offset explícito, salida UTC `Z`. Fechas civiles no se interpretan como medianoche UTC implícita.

Validación: JSON estricto, campos desconocidos rechazados, UUID, códigos/textos según modelo, decimales como cadenas finitas, IDs de padres visibles y compatibles. Cuerpo máximo existente 16 KiB, sin aumentarlo globalmente. No permitir PATCH de `id`, `company_id`, auditoría de sistema ni identidad externa de dispositivo. PATCH requiere al menos un campo modificable y `expectedVersion` entero positivo. Conflictos →409, nunca último escritor silencioso. Estado inactivo impide nueva operación agrícola; no implica borrado.

### Paginación y filtros

`limit`: entero 1..100, default 25. Cursor opaco validado y firmado por servidor (mecanismo/clave por aprobar antes de implementar), ligado a empresa, recurso, filtros, orden y versión del contrato. No contiene PII ni autoriza acceso. Cambio de filtro/empresa invalida cursor →400 `INVALID_CURSOR`. Sin count total por defecto.

Orden estable de maestros `(created_at DESC,id DESC)`; históricos `(observed_at DESC,id DESC)` o fecha de negocio equivalente. Cursor por valores de orden, no OFFSET. Inserciones concurrentes no deben duplicar filas ya recorridas; no se garantiza snapshot de varias páginas. Para exportación consistente se requiere trabajo explícito posterior.

Históricos: `from` y `to` obligatorios, `[from,to)`, from < to; máximo recomendado 31 días para lecturas crudas; `limit` no sustituye rango. `metricCode`, `deviceId`, `plotId` y `farmId` solo donde el recurso los declare; validar pertenencia y relación entre filtros. No aceptar SQL, nombres de columnas o sort arbitrario. Comparaciones de períodos usan dos intervalos explícitos, misma magnitud/unidad y estrategia; no deducir ahorro hídrico.

### Errores y pruebas comunes

Mantener `{error:{code,requestId,details?}}` del adaptador base. `details` identifica campos/códigos, no valores sensibles.

| HTTP | Casos |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_CURSOR`, intervalo inválido |
| 401 | `SESSION_INVALID` y condiciones de sesión base |
| 403 | `FORBIDDEN`, `PASSWORD_CHANGE_REQUIRED`, `MFA_SETUP_REQUIRED`; empresa propia inactiva → `COMPANY_INACTIVE` |
| 404 | `NOT_FOUND`: empresa sin membresía y recurso inexistente o fuera de empresa, respuesta indistinguible |
| 409 | `VERSION_CONFLICT`, `DUPLICATE_RESOURCE`, `LAST_MANAGER`, `IDEMPOTENCY_CONFLICT`, `STATE_CONFLICT` |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` existentes |
| 429 | Límite aplicable, `RATE_LIMITED` con Retry-After; cuotas empresariales aún por dimensionar |
| 500 / 503 | `INTERNAL_ERROR` sin detalle interno / indisponibilidad de dependencia sin inventar resultados |

Orden de rechazo tenant: autenticar → validar sintaxis → resolver membresía/empresa (404 sin acceso) → estado → permiso (403) → recurso bajo RLS (404). Un error de FK/duplicado no debe revelar identidad de otra empresa.

Todo endpoint hereda pruebas C1 éxito tipado, C2 sesión/MFA, C3 permiso global/contextual, C4 aislamiento A/B, C5 validaciones, C6 error sanitizado. Listas agregan C7 cursor/límite/orden; escrituras C8 versión/idempotencia/auditoría/rollback. Las filas siguientes añaden casos específicos y sus campos de entrada/salida.

## Descubrimiento y administración

`CompanyDto`: id, rut, legalName, tradeName nullable, contactEmail/contactPhone nullable, status, version, createdAt, updatedAt. `MembershipDto`: userId, nombre visible mínimo, status, version; no incluir email/RUT salvo requisito autorizado explícito. `CapabilitiesDto`: companyId, membershipVersion, effectivePermissions (claves existentes), menu (árbol del catálogo Saphi filtrado).

| ID | Método y ruta relativa a `/api/saphi` | Permiso / ámbito | Entrada → salida | Casos específicos |
|---|---|---|---|---|
| API01 | GET `/companies` | Sesión; descubrimiento solo de empresas con membresía activa y `saphi.companies:view` efectivo | limit/cursor → CompanyDto[] | No enumerar empresas ajenas; sin membresías devuelve [] |
| API02 | POST `/companies` | Control de plataforma: superusuario, sin tenant previo; política de bootstrap pendiente de aprobación | rut, legalName, contacto?, initialUserId, initialPermissions[], reason → CompanyDto | Atómico; destinatario activo y techo suficiente; sin autoasignación del actor |
| API03 | GET `/companies/{companyId}` | `saphi.companies:view` efectivo | URL → CompanyDto | Sin bypass de superusuario |
| API04 | PATCH `/companies/{companyId}` | `saphi.companies:edit`; desactivación además superusuario propuesto | expectedVersion, nombres/contacto/status → CompanyDto | No cambiar RUT inicialmente; empresa inactiva requiere recuperación controlada pendiente |
| API05 | GET `/companies/{companyId}/capabilities` | Membresía activa; sin exigir un permiso adicional para consultar capacidades propias | URL → CapabilitiesDto | No consultar capacidades de otro usuario; global∩tenant |
| API06 | GET `/companies/{companyId}/memberships` | `saphi.memberships:view` | limit/cursor/status? → MembershipDto[] | Proyección mínima; no lista global de usuarios |
| API07 | PUT `/companies/{companyId}/memberships/{userId}` | `saphi.memberships:edit` | nueva: expectedVersion=0; existente: versión actual; status, reason → MembershipDto | Usuario preexistente activo; sin autoalta/reactivación; revocar último gestor →409 |
| API08 | PUT `/companies/{companyId}/memberships/{userId}/permissions` | `saphi.memberships:edit` | expectedVersion, permissions:PermissionKey[], reason → MembershipDto y effectivePermissions | Reemplazo atómico explícito; no autoedición; sin catálogo ajeno a Saphi ni concesión superior al actor/destinatario |

API01 requiere una consulta de descubrimiento acotada por actor, no un bucle de contextos tenant en la misma transacción. API02/07/08 usan funciones estrechas que validan la misma autoridad en BD. API07 no otorga permisos implícitos; una membresía nueva comienza sin concesiones. La habilitación global del destinatario se realiza por los mantenedores existentes fuera de este API, sin otorgar esos mantenedores al gestor agrícola. API04 no ofrece reactivación de empresa inactiva hasta especificar recuperación.

## Recursos maestros

Prefijo de tabla: `C = /companies/{companyId}`. Cada abreviatura `GET colección / POST colección / GET {id} / PATCH {id}` representa cuatro endpoints concretos con el mismo recurso; permisos respectivamente `view/create/view/edit`. Heredan C1..C8 cuando corresponda. No hay DELETE.

| ID | Recurso y endpoints | Permiso menu | Body POST / PATCH mutable | DTO / filtros / casos adicionales |
|---|---|---|---|---|
| API09 | GET/POST `C/farms`; GET/PATCH `C/farms/{id}` | `saphi.farms` | code, name, areaHa?, location?, status?; PATCH expectedVersion, name/areaHa/location/status | FarmDto = id, companyId, campos, version, createdAt/updatedAt; filtro status; código único dentro de empresa |
| API10 | GET/POST `C/plots`; GET/PATCH `C/plots/{id}` | `saphi.plots` | farmId, code, name, areaHa?, grapeVariety?, plantingYear?, soilType?; PATCH campos descriptivos/status + expectedVersion | PlotDto = id/companyId/farmId + campos/version/fechas; filtros farmId,status; no reparentar por PATCH |
| API11 | GET/POST `C/sampling-points`; GET/PATCH `C/sampling-points/{id}` | `saphi.samples` | plotId, code, location; PATCH location/status + expectedVersion | PointDto = id/companyId/plotId/code/location/status/version/fechas; filtro plotId; longitud/latitud válidas |

GeoJSON opcional queda separado: GET `C/plots/{id}/geometry`, permiso `saphi.plots:view`, devuelve `{data:{plotId,geometry:GeoJSON|null,validationLevel:'structural'|'topological'|null}}`. PUT a la misma ruta propuesto con `saphi.plots:edit`, expectedVersion y geometry; bloqueado hasta decisión GIS. No declarar `topological` si solo se validó estructura. Pruebas de límites, cierre, finitud, coordenadas y aislamiento; validación de contención/área pendiente.

## Laboratorio, dispositivos e históricos

| ID | Método y recurso bajo C | Permiso | Parámetros/body → salida | Validaciones / pruebas adicionales |
|---|---|---|---|---|
| API12 | GET `/samples`, GET `/samples/{id}` | `saphi.samples:view` | filtros plotId/from/to y paginación → SampleDto(s) | Fecha tomada distinta de recepción; punto del mismo cuartel |
| API13 | POST `/samples` | `saphi.samples:create` | code, plotId, samplingPointId?, sampledAt, notes? → SampleDto | No resultado inventado; unicidad de código |
| API14 | GET `/laboratory/analyses`, GET `/laboratory/analyses/{kind}/{id}` | `saphi.laboratory:view` | kind=`physicochemical|microbiological`, sampleId?, from/to → AnalysisDto(s) | Consultas de ambos tipos tienen contrato uniforme y tipo explícito |
| API15 | POST `/laboratory/analyses` | `saphi.laboratory:create` | kind,sampleId,analyzedAt,laboratoryReference,methodReference,results[],supersedesId? → AnalysisDto | Catálogo/unidad/método aprobados; corrección conserva original; implementación bloqueada hasta catálogo |
| API16 | GET/POST `/devices`, GET/PATCH `/devices/{id}` | `saphi.devices:view/create/view/edit` | POST plotId,code,providerCode,externalDeviceId,metadata?; PATCH expectedVersion,status,metadata → DeviceDto | Sin credenciales; no cambio de empresa/identidad; filtros plotId/status |
| API17 | GET `/telemetry/readings` | `saphi.telemetry:view` | deviceId obligatorio, metricCode?, from,to,limit,cursor → ReadingDto[] | Unidad y decimal de origen; timestamp observado; orden estable |
| API18 | GET `/telemetry/latest` | `saphi.telemetry:view` | deviceId obligatorio, metricCode? → ReadingDto[] | Un último valor por magnitud; ordenar por observedAt/id, no receivedAt |
| API19 | GET `/satellite/observations`, GET `/satellite/observations/{id}` | `saphi.satellite:view` | plotId,from,to y paginación → ObservationDto(s) | Fuente, licencia y calidad visibles; no URL/key arbitraria |
| API20 | GET `/satellite/observations/{id}/assets/{assetId}/download` | `saphi.satellite:view` | IDs → `{url,expiresAt}` | Autorizar observación y objeto; URL breve y sin clave del bucket expuesta como selector |
| API21 | GET `/irrigation/events`, GET `/irrigation/events/{id}` | `saphi.irrigation:view` | plotId?,from,to,paginación → IrrigationDto(s) | No convertir volumen sin unidad aprobada |
| API22 | POST `/irrigation/events` | `saphi.irrigation:create` | plotId,startedAt,endedAt?,amount,unitCode,sourceCode,sourceReference?,supersedesId? → IrrigationDto | Fin≥inicio, cantidad finita ≥0; corrección sin UPDATE libre |
| API23 | GET `/indicators/results` | `saphi.indicators:view` | plotId,indicatorCode,from,to,paginación → IndicatorDto[] | Solo resultados de estrategias aprobadas; sin resultados →[] |
| API24 | GET `/dashboard` | `saphi.dashboard:view` y permisos de cada fuente consultada | farmId?,plotId?,from,to → DashboardDto | Secciones no autorizadas = `unavailable:forbidden`, sin conteos filtrados ni acceso indirecto |

DTO de históricos: campos públicos del diccionario de [datos](./02-modelo-datos.md) en camelCase, incluyendo companyId, referencia padre, instantes, valores decimales/unidades y provenance cuando aplique; excluir auditoría interna y contenido bruto. SampleDto añade code, plotId, samplingPointId nullable y sampledAt. AnalysisDto incluye kind y results tipados por catálogo. ObservationDto incluye assetIds opacos, no keys. IndicatorDto incluye versión, período y procedencia. DashboardDto incluye scope, período y secciones `{status:'available'|'no_data'|'forbidden'|'pending_definition',data?:...}`; sin fórmula aprobada usar pending_definition, nunca cero sintético.

Las capacidades compuestas requieren permisos de fuente además del endpoint: por ejemplo dashboard con telemetría exige `saphi.telemetry:view`; comparación de laboratorio exige `saphi.laboratory:view`. Las comparaciones iniciales pueden consultar dos períodos de la misma colección; no proponer un cálculo nuevo mediante un endpoint genérico.

## Integraciones, idempotencia y exclusiones

No hay POST de mediciones humanas que confunda API de usuario con ingesta. Contrato lógico de máquina `POST /ingestion/telemetry` es una **entrada futura pendiente**, sin ruta pública ni método de autenticación aprobado. Los proveedores y la autenticación se definen en [integraciones](./06-integraciones.md). Si se aprueba asíncrono:202 solo tras persistir durablemente recepción, response `{receiptId,status:'accepted'}`; no significa medición almacenada. Duplicados canónicos se aceptan sin filas adicionales; conflicto de identidad →409. No fabricar un recibo en memoria y responder202.

R10: POST humanos pueden usar `Idempotency-Key` si se aprueba persistencia atómica del recibo por actor/empresa/ruta/hash con retención documentada. Hasta entonces no prometer idempotencia genérica: los códigos únicos de negocio previenen duplicados detectables y los conflictos devuelven409. Ingesta sí requiere deduplicación persistente antes de habilitarse.

No se definen endpoints para fórmulas, suscripciones, facturación, roles nuevos, invitaciones Cognito duplicadas, eliminación masiva, auditoría empresarial, exportación masiva ni reprocesamiento productivo. Reservar diseño futuro no autoriza implementación. Catálogo de endpoints por dominio se implementará incrementalmente tras aprobación; Fase 2 no equivale a habilitarlos todos.
