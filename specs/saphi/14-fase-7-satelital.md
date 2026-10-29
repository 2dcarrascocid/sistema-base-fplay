# Fase 7 — Catálogo satelital y consultas autorizadas

Documento histórico del incremento de catálogo. La solicitud posterior de integración GEE/Sentinel-2 y su estado actual se documentan en la [retoma de Fase 7](./20-fase-7-integracion-gee.md).

Fase 6 aprobada por el usuario; inicio de Fase 7 solicitado el 28 de octubre de 2026. Esa aprobación no selecciona fuente, licencia o política de objetos. Se mantienen pendientes los catálogos de laboratorio y la recepción real de IoT. Sin despliegues, infraestructura con costo, dependencias nuevas ni Fase 8.

## Alcance y decisiones del cliente

Implementar catálogo PostgreSQL de observaciones/activos, API19 (listado y detalle), autorización de la relación empresa→observación→activo de API20 y pantalla de consulta. Importación y descarga real permanecen cerradas hasta Q07/Q09: proveedor/producto, licencia/redistribución, frecuencia/resolución/calidad, formatos/tamaño/cuotas/retención/cifrado/acceso y almacenamiento autorizado. No se elige Sentinel u otro proveedor por inferencia.

La consulta de descarga autoriza IDs y responde503 `SATELLITE_STORAGE_UNAVAILABLE` para un activo propio mientras no exista almacenamiento aprobado;404 para recurso inexistente/ajeno/incompatible. No fabrica URL, reutiliza fotos/branding ni llama un proveedor externo. La UI no ofrece un enlace de descarga activo. Sin POST de observaciones/activos, importación de URLs, previsualizaciones, mapas, NDVI/NDWI ni fórmulas.

## Persistencia y procedencia

Migración incremental con `satellite_observations`: id, empresa, cuartel, proveedor, ID de observación de origen, producto/versión de referencia, adquisición y recepción separados, referencia de licencia, código de calidad y texto de cobertura de origen opcionales. El texto de cobertura conserva la descripción suministrada sin asumir porcentaje, fracción o unidad. Unicidad `(company_id,plot_id,provider_code,source_observation_id)`, FK compuesta a cuartel e índice de histórico por adquisición/id.

`satellite_assets`: id opaco, empresa, observación, referencia de activo de origen privada. Es un catálogo de referencias, no objeto disponible/validado ni almacenamiento S3. FK compuesta conserva empresa/observación; sin bucket/key/URL firmado ni credenciales. DTO solo expone assetIds. Hash o licencia declarados no equivalen a validación legal o del producto; ingesta futura debe verificarlos según contrato aprobado.

Runtime humano solo SELECT en ambas tablas, RLS por permiso satelital y lectura de cuarteles. Sin INSERT/UPDATE/DELETE, roles de servicio, purgas ni carga de negocio. Fixtures técnicos `test.*` únicamente en bases descartables/transacciones con rollback. La procedencia se conserva como metadatos del origen, sin calcular índices. Estado de índices y descarga `pending_definition`, nunca una medición cero o un archivo disponible.

## Contratos concretos

- GET `C/satellite/observations`: satellite:view y plots:view, `plotId/from/to` obligatorios; rango `[from,to)` con from<to; sin asumir límite de31 días de lecturas IoT para imágenes satelitales. Orden `acquired_at DESC,id DESC`, limit1..100/default25 y cursor AES-GCM ligado a actor/empresa/cuartel/período/límite; se conservan microsegundos SQL del orden. Padre visible o404.
- GET colección `/{id}`: mismos permisos, DTO mínimo con origen, producto, licencia/calidad/cobertura de origen, instantes, assetIds y estados pendientes. Excluye referencias privadas de activos y auditoría interna.
- GET `/{id}/assets/{assetId}/download`: mismos permisos, relación validada por empresa/observación/activo, sin parámetros bucket/key/url;503 para referencia propia mientras la política de almacenamiento esté pendiente. No responde202 ni concede URL ficticia.
- GUID/instantes ISO con zona explícita, filtros públicos hasta milisegundos y años0001..9999, objetos/query estrictos. Sin aceptar empresa del cuerpo, orden/SQL arbitrarios o URLs externas.

## Interfaz y acceso

Vue/Vuetify/es/en, ruta empresarial y puente `/saphi/satellite`, enlace de detalle y menú contextual por capacidades. Selector de cuartel con carga explícita adicional, período inicial de30 días editable, listado paginado y detalle; loading/error/vacío y dependencia de fuente/licencia/descarga visibles. No imágenes remotas ni HTML de origen. Valores de cobertura/calidad se muestran como texto literal, sin clasificar salud o nubes. Cambio de empresa/filtros invalida respuestas tardías.

No se amplían automáticamente los permisos demo existentes. Las empresas sin gestor que posea concesión satelital requieren un procedimiento de habilitación de plataforma aprobado Q02/Q03; se puede ensayar una empresa creada con bootstrap y concesiones iniciales explícitas/techo suficiente. Se conserva prohibición de autoasignación y de otorgar más que el alcance propio.

## Verificación prevista

Contratos, API con PostgreSQL (origen, adquisición/recepción, filtros, cursor, aislamiento, relación activo/observación, ausencia de red/firmado/ingesta), pgTAP de FKs/grants/RLS/unicidad, componentes Vue, regresión, tipos, build y bundles. Aplicar migración solo local después de validar base descartable. No se considera completa la integración satelital por ofrecer un catálogo vacío y descargas bloqueadas; el cierre separará el incremento de las decisiones pendientes.

## Resultado del incremento — 28 de octubre de 2026

**Catálogo, consultas y autorización de activos implementados; integración real pendiente de Q07/Q09.** Se solicitó al cliente proveedor/producto/licencia/política de archivos durante la ejecución y no se recibió una selección. No se eligió proveedor, interpretó una aprobación por silencio ni implementó un adaptador supuesto.

| Verificación final | Resultado |
| --- | --- |
| Typecheck workspace y tipos del build web | Correctos |
| Contratos Saphi | 25 pruebas, 100% de cobertura |
| Regresión API sobre PostgreSQL descartable | 182 pruebas; 98,15% líneas / 87,63% ramas |
| Regresión web actual del workspace | 153 pruebas; 96,76% líneas / 87,93% ramas |
| pgTAP en base descartable y base local migrada | 263 comprobaciones correctas |
| Build web y seis bundles Lambda | Correctos; bundle Saphi aproximadamente1576 KiB |

La regresión web incluye seis casos nuevos de consulta/detalle, paginación/vacío, validación, error recuperable, permisos de origen y recuperación del directorio de cuarteles. Los errores del selector pueden recargarse antes de iniciar una consulta y los detalles tardíos no sustituyen solicitudes posteriores. Las suites globales incluyen los demás módulos presentes en el workspace; no se modifican sus comportamientos como parte de este incremento. Se mantienen umbrales de cobertura y configuración de pruebas vigentes.

La integración API comprueba procedencia/licencia, adquisición separada de recepción, período semiabierto, cursor ligado a filtros, ID ajeno o de otra observación, ausencia de referencia privada en DTO y permiso de columna SQL denegado. Descarga propia devuelve503 y ajena/incompatible404. Spies de red y PhotoStorage confirman que no se hacen llamadas ni firmas de fotos como alternativa. No se registran POST/PATCH/DELETE, proxy de imágenes o cálculo NDVI.

La [migración incremental](../../supabase/migrations/20261028000600_saphi_satellite_catalog.sql) se aplicó solo local después de las pruebas descartables. SHA256: `6C58A1F229737FD44F9F5D70B74E90F5CFA12ECF824BFA7B608468C6CA469AE9`. Se verificaron intactos los hashes de las cinco migraciones anteriores. No hubo reset, instalaciones, cambios de infraestructura con costo ni despliegues. Los grants de suplantación de pgTAP existen solo dentro de sus transacciones revertidas; no amplían roles persistentes.

Comprobación posterior de datos locales: cero observaciones, cero activos y dos empresas DEMO conservadas. La ruta local satelital registrada rechaza una petición sin sesión con401. Los datos satelitales técnicos se usaron exclusivamente en bases descartables/transacciones con rollback, sin descargar archivos ni cargar imágenes simuladas como reales.

## Acceso y continuación

La [guía operativa](../../docs/saphi/satelital-local.md) detalla permisos, período, procedencia y comportamiento de descarga. No se amplían automáticamente concesiones demo. Una empresa existente sin gestor con alcance satelital sigue necesitando el procedimiento de habilitación de plataforma Q02/Q03; no se permite autoasignación ni otorgar más que el alcance propio. Se puede ensayar una empresa nueva con techo global y concesiones iniciales explícitas durante bootstrap.

Para completar la integración deben aprobarse fuente/producto/versionado, licencia/atribución/redistribución, frecuencia/resolución/calidad, formato/tamaño/cuotas/retención/cifrado/acceso a objetos, almacenamiento y TTL de firmas, autenticación/principal técnico y validación de contenido/origen. Antes de mostrar índices se necesitan productos de origen o fórmulas y tratamiento de bandas/faltantes aprobados. Las dependencias de laboratorio e ingesta IoT permanecen separadas. No se desarrolla Fase 8 en este incremento.
