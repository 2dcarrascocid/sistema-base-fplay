# Fase 5 — Muestras, laboratorio e históricos

Inicio autorizado por el usuario después del recorrido demo de Fase 4. Se conserva la plataforma y los datos existentes. Sin despliegues ni Fase 6.

## Alcance y dependencia del cliente

Se implementa el registro inmutable de muestras de suelo (API12–13), detalle e histórico con filtros de cuartel y período. Se reutiliza `saphi.soil_samples`, sus FKs compuestas, RLS, permisos y auditoría. No se editan ni eliminan muestras: los errores de captura requieren un diseño posterior de correcciones, sin sobrescribir historia.

API15 exige parámetros, unidades y métodos aprobados según Q08. No se interpreta la autorización de iniciar Fase 5 como aprobación de ese catálogo. Hasta recibirlo, la pantalla de laboratorio muestra explícitamente `pending_definition`, sin resultados, valores ni fórmulas inventados. No se habilitan POST de análisis ni tablas genéricas JSON que eludan el contrato. El cierre distinguirá lo implementado de esta dependencia pendiente.

## Contratos y seguridad

- GET `/saphi/companies/{companyId}/samples`: `saphi.samples:view`; `from/to` obligatorios y filtros opcionales `plotId`, `limit` y `cursor`. Período `[from,to)` sobre `sampled_at`, fechas ISO con zona horaria normalizadas a UTC y from<to. Orden estable descendente de toma/id, conforme a históricos de Fase 1. El cursor AES-GCM queda ligado también al período y cuartel. La UI propone los últimos 30 días; no se impone el máximo de lecturas IoT crudas a muestras de suelo.
- GET misma colección `/{id}`: mismo permiso, DTO explícito y 404 para ID ajeno/no visible.
- POST colección: `saphi.samples:create` y view, además plots:view para verificar padre; si hay punto requiere samples:view y FK del mismo cuartel/empresa. Body estricto `code,plotId,samplingPointId?,sampledAt,notes?`. Fecha finita ISO, años 0001–9999 y hasta milisegundos (mayor precisión se rechaza); notas hasta 2000 caracteres; sin límites temporales agronómicos inventados. Código único por empresa; 409 por duplicado. 201 con Location.
- DTO: id/companyId/plotId/samplingPointId/code/sampledAt/notes/version/createdAt/updatedAt. Fecha de toma separada de recepción; sin auditoría interna ni datos de otras empresas.
- No DELETE/PATCH, importación de archivos, exportaciones ni ingesta externa en este incremento.

## Interfaz

Vistas Vue de Muestras e Histórico (misma colección, formulario de alta y consulta), y Laboratorio con definición pendiente. Rutas empresariales y puentes estáticos; enlaces desde detalle empresarial y menú Muestreo. Se mantienen puntos separados del registro de muestras. Formularios con labels, errores, loading y lectura según capacidades. Fechas mediante ISO explícito con zona horaria, sin conversiones silenciosas del navegador. Cambiar empresa o filtros descarta respuestas tardías.

## Verificación

Contratos Zod, integración API con PostgreSQL (aislamiento, padres cruzados, período, cursor, duplicados e inmutabilidad), componentes Vue y regresión. Nueva migración solo para índice de paginación y navegación de muestras; las migraciones aplicadas no cambian. Verificar pgTAP y aplicar únicamente local. No se añaden datos demo de laboratorio como si fueran mediciones reales.

## Resultado del incremento (28 de octubre de 2026)

**Muestras e históricos implementados; Fase 5 completa pendiente del catálogo de análisis Q08.** No se solicita aprobar un catálogo supuesto ni se considera completo el laboratorio por mostrar una pantalla pendiente.

| Verificación final | Resultado |
| --- | --- |
| Typecheck del workspace | Correcto |
| Contratos compartidos Saphi | 18 pruebas; cobertura 100% |
| API con PostgreSQL y base descartable reconstruida | 169 pruebas; 98,08% líneas / 87,30% ramas |
| Regresión web y componentes | 132 pruebas; 97% líneas / 89,04% ramas |
| pgTAP en PostgreSQL local migrado | 222 comprobaciones correctas |
| Build web y seis bundles Lambda | Correctos; sin despliegue |

Las pruebas cubren fecha explícita/UTC, período obligatorio semiabierto, orden por toma, cursor ligado a filtros, puntos de otro cuartel/empresa, código duplicado, detalle, aislamiento, auditoría, ausencia de edición/borrado y ausencia de escritura de análisis. El alta Vue comprueba explícitamente que se envía una única petición con el cuartel y el instante normalizado.

La regresión web presentó timeouts variables de 5 segundos en flujos existentes y nuevos al montar la aplicación Vuetify completa con cobertura. Se separaron validación y alta en casos independientes y se estableció `testTimeout: 10000` en el ejecutor web; dos workers máximos. La ejecución final completa con esa configuración pasó. No se retiraron aserciones ni exclusiones de cobertura ni se redujo el umbral del 80%; los tiempos HTTP/API de producto permanecen iguales.

Se aplicaron únicamente local las migraciones incrementales [navegación](../../supabase/migrations/20261028000300_saphi_samples_navigation.sql) e [índice del histórico por toma](../../supabase/migrations/20261028000400_saphi_sample_history_order.sql). La segunda reemplaza el índice inicial por el orden definitivo de negocio; no modifica filas. Se conservaron intactas las migraciones aplicadas de Fases 3 y 4, verificadas por SHA256. Sin reset, instalaciones, recursos AWS ni carga de muestras/mediciones ficticias. Los datos demo existentes permanecen disponibles.

Comprobaciones locales: pantalla de muestras con período inicial de 30 días y estado sin datos; sesión nueva de gestora con MFA y respuestas HTTP200 para empresas (2), cuarteles de Maule (6) e histórico vacío. Las pruebas de registros y mutaciones se ejecutan en la base descartable, no sobre el negocio local. La sesión antigua del navegador mostró errores durante el desarrollo; se comprobó el acceso mediante autenticación nueva, sin relajar seguridad.

## Dependencia para completar análisis

Se requiere catálogo validado por el cliente para ambos tipos de análisis: códigos/nombres de parámetros, tipos de resultado (numérico/cualitativo/no detectado), unidades, precisión, límites de detección/cuantificación, método/versionado, procedencia y reglas de corrección. La solicitud de información quedó presentada durante la implementación y no se recibió ese catálogo. API14–15 e históricos de resultados no se habilitan por silencio. El registro inmutable de muestras y su histórico pueden utilizarse mientras se resuelve esa dependencia.

La [guía operativa](../../docs/saphi/laboratorio-local.md) explica uso, permisos y datos requeridos. No se inicia Fase 6.
