# Resumen consolidado local

Desde el detalle de una empresa, abre **Resumen consolidado**. Ruta directa: `/saphi/companies/:companyId/dashboard`; `/saphi/dashboard` utiliza la empresa seleccionada o redirige al selector.

Requiere membresía activa y `saphi.dashboard:view` global y empresarial. Cada sección exige también el permiso de su módulo. Los permisos demo no se amplían automáticamente. La habilitación debe realizarla un operador autorizado dentro de los límites de concesión existentes; no sustituirla por ediciones directas a la base.

El período inicial comprende treinta días y se modifica con selectores de fecha y hora. Desde está incluido y Hasta está excluido. El cuartel se elige de una lista de la empresa cuando hay permiso de lectura. **Aplicar filtros** consulta el resumen; editar un filtro retira el resultado anterior hasta realizar una nueva consulta.

La vista muestra los datos generales de la empresa, predios, cuarteles, puntos de muestreo y muestras. Solo las muestras usan el período; el resto muestra su registro actual. Cada tarjeta es una vista previa de hasta seis registros, con aviso cuando existen más. **Explorar módulo** abre el listado completo con los filtros propios de ese módulo. No interpretar el número de filas como un total empresarial.

Una fuente puede mostrar registros, ausencia de datos o falta de permiso. Los indicadores agronómicos y análisis permanecen pendientes; el dashboard general no muestra tarjetas vacías ni calcula valores agrícolas.

Si falla la consulta, utiliza **Recargar datos**. Los instantes de las muestras se muestran en UTC.

Contrato: `GET /saphi/companies/{companyId}/dashboard?from=...&to=...&plotId=...`. El filtro por predio independiente todavía no está habilitado. Más información y límites en [Fase 9](../../specs/saphi/16-fase-9-dashboard.md).
