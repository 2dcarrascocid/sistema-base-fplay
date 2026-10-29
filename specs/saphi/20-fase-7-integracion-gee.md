# Retoma de Fase 7 — integración GEE en Saphi

Fecha: 2026-10-28. El usuario solicitó terminar Fase 7 antes de proseguir. **Integración local implementada y validada con Google real: consulta Sentinel-2, generación y carga de teselas NDVI/NDWI. Cierre técnico local del visor; pendiente aprobación del usuario.** No equivale a aceptación productiva ni autoriza fases posteriores.

La solicitud actual selecciona Google Earth Engine con Sentinel-2 SR Harmonized, Python 3.11+, Serverless Offline y Leaflet para visualizar NDVI/NDWI en el sitio existente. Se incorporó el visor a la ruta satelital de Saphi, con su sesión, contexto empresarial y permisos de fuentes, manteniendo Vue/Node y PostgreSQL existentes. Python es un proveedor local separado, no una reescritura del backend Base.

## Cambios

- Paquete `@base/saphi`: contratos de consulta y respuesta de mapas; rechaza ámbito/URL arbitrarios y limita fechas, área y nubosidad.
- API: ruta número 34, `GET /saphi/companies/{companyId}/satellite/map`; verifica permisos satelitales, lectura de cuarteles y puntos, y deriva bbox de puntos activos bajo RLS. No hay FK, tabla, migración o grant SQL nuevo.
- Proveedor local: Python/earthengine-api, inicialización con la llave existente, máscara SCL, normalización por escena y mediana. Token interno entre procesos; archivo de llave y configuración interna excluidos de Git. El adaptador `dev` no se empaqueta en AWS.
- Vue: Leaflet instalado y componente dentro de la pantalla satelital, con filtros, leyenda, estados reales, limpieza de capas, abort y protección de respuestas tardías. El catálogo previo sigue separado y no recibe imágenes o índices automáticamente.
- Operación: scripts de arranque, sonda sin secretos y una empresa demo satelital separada, preparada solo con APIs auditadas y bootstrap existente. Los permisos empresariales de las dos empresas demo anteriores se conservan.

Empresa demo: `04325678-f647-4d30-a9b3-be5d0fe5fc31`. Cuartel: `6d012684-c789-4a0b-9c3e-6c9c221dee25`. Gestora: cuenta cliente demo existente. Se agregó un perfil global específico de lectura satelital, sin roles globales nuevos ni superusuario cliente. El nuevo ámbito tiene un predio, un cuartel y tres puntos ilustrativos; no representa una explotación real.

## Hallazgos corregidos y verificación

Se corrigió el ejemplo inicial para ejecutar `ee.data.setDeadline` después de `ee.Initialize`, como exige el SDK instalado. Se añadieron pruebas del orden de inicialización y del token interno. El emulador fijado exige el runtime declarado `python3.11`; en Windows ejecuta el Python 3.12 del entorno virtual disponible (código compatible con 3.11+). No se afirma paridad de un despliegue cloud.

| Verificación ejecutada | Resultado |
|---|---|
| Tipos del workspace | Correctos |
| Contratos Saphi | 29 pruebas; 100% líneas/ramas/funciones, 98,41% sentencias |
| API | 193 pruebas; 98,22% líneas, 88,01% ramas |
| Frontend | 166 pruebas; 96,87% líneas, 87,99% ramas |
| Python | 14 pruebas con biblioteca estándar y dobles |
| Build web | Correcto; Leaflet incluido en chunk satelital |
| Bundles Lambda | Seis correctos; Saphi 1582 KiB |
| Sonda real GEE | `connected`, colección accesible tras el ajuste IAM comunicado por el usuario |
| Interfaz conectada al proveedor local | NDVI y NDWI: 2 escenas en 2026-09-28 / 2026-10-28, nubosidad máxima 30%; teselas reales cargadas, ancho natural 256 píxeles |
| Ausencia real de escenas | 2027-01-01 / 2027-01-02: 404, mensaje explícito y cero teselas; restauración posterior del mapa |

No se repitió pgTAP porque no se cambiaron objetos, políticas o privilegios SQL; la línea base de Fase 10 conserva su evidencia histórica. No se presenta el número de escenas de un doble como respuesta real de Google.

## Condición de cierre

Los rechazos iniciales de Service Usage y `earthengine.computations.create` se resolvieron después de los cambios IAM comunicados por el usuario. La sonda y el visor autenticado completaron llamadas reales. No se inspeccionó ni modificó IAM desde la aplicación, ni se afirma qué roles concretos quedaron asignados.

Se verificaron la sonda, emisión autenticada de mapas, carga de teselas de ambos índices, sustitución de capas al cambiar índice/fechas, estado sin escenas y recuperación. Se corrigió un defecto encontrado en el navegador: retirar una capa de Leaflet antes de limpiar sus eventos permite desvincular los manejadores de zoom; el orden inverso provocaba errores al cambiar filtros. Se añadió una aserción de regresión a las seis pruebas del visor. Las exportaciones persistentes mantienen su política pendiente; no forman parte de la visualización transitoria solicitada.

Instrucciones operativas y límites, incluida la autorización al emitir URLs frente a revocación posterior, en la [guía GEE local](../../docs/saphi/satelital-gee-local.md). No se ejecutó ningún despliegue y no se continuó con fases posteriores.
