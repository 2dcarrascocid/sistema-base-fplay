# Fase 7 local — catálogo satelital

Actualización: la misma pantalla incorpora ahora un [visor Earth Engine](./satelital-gee-local.md). La conexión real está bloqueada por IAM de Google; este documento conserva el alcance del catálogo, distinto de la visualización transitoria. La integración y su condición de cierre se detallan en la guía nueva.

El catálogo permite consultar observaciones y metadatos de origen autorizados. **La importación y descarga persistentes siguen pendientes de política aprobada.** El visor GEE separado consulta NDVI/NDWI sin cargar observaciones ficticias ni guardar resultados en el catálogo.

## Acceso

Se necesitan `saphi.satellite:view` y `saphi.plots:view` tanto en el techo global como en las concesiones empresariales, además del acceso a la empresa. Desde su detalle abrir **Observaciones satelitales** o el menú contextual. La ruta estática `/saphi/satellite` utiliza la empresa seleccionada; si no hay una, vuelve al selector.

Los perfiles y empresas DEMO anteriores conservan sus permisos. No se otorgan automáticamente nuevas concesiones, ni siquiera al superusuario. Para una empresa nueva, el operador habilita el techo global del destinatario y el superusuario asigna los permisos iniciales explícitos a otra persona gestora activa mediante el bootstrap existente.

Si una empresa existente no tiene ningún gestor con concesión satelital, habilitar el módulo necesita el procedimiento de administración de plataforma Q02/Q03 aún pendiente. Nadie puede autoconcederse permisos ni otorgar más que su propio alcance; esta fase no introduce un bypass. No cambiar roles/grants directamente en la base para eludir ese requisito. Los ensayos automatizados usan empresas descartables creadas con las concesiones necesarias.

## Consulta y detalle

1. Seleccionar un cuartel visible. El selector carga hasta100 opciones y ofrece **Cargar más opciones** cuando corresponde.
2. Elegir Desde/Hasta en ISO con zona explícita (`Z` o `±HH:MM`). Ambos son obligatorios: Desde incluido y Hasta excluido, Desde<Hasta. Se proponen30 días; se puede ampliar el período porque no se impone a imágenes el límite de31 días de telemetría cruda.
3. Aplicar filtros y usar **Siguiente** para más páginas. Orden por adquisición descendente y desempate por ID; la recepción tardía no cambia la posición por adquisición. Los cursores caducan a los15 minutos y están ligados al actor, empresa y filtros. Cambiar filtros reinicia la consulta.
4. Abrir **Ver detalle** para revisar proveedor, ID de observación de origen, referencia de producto/versión, licencia, calidad/cobertura declaradas, adquisición, recepción e IDs opacos de activos.
5. Las referencias de licencia y producto no certifican aprobación legal. Cobertura y calidad son texto del origen, sin convertir unidades o interpretar nubes/salud. Un vacío no significa cero ni ausencia de vegetación: no hay importador activo.

Cambiar empresa limpia datos y descarta respuestas tardías. No hay edición, borrado, carga manual, selección de URL externa ni representación HTML de metadatos.

## Activos y descarga bloqueada

Los IDs de activos identifican referencias de catálogo y no prueban que exista un archivo validado o disponible. La UI indica **Descarga no habilitada** y no ofrece enlaces firmados ni imágenes de terceros. Los índices muestran definición pendiente, sin valores sintéticos.

La ruta API20 verifica empresa, observación y activo. Activo ajeno, inexistente o de otra observación →404. Activo propio autorizado →503 `SATELLITE_STORAGE_UNAVAILABLE` hasta implementar almacenamiento aprobado. No acepta parámetros bucket/key/url. La referencia privada del activo no se expone en el DTO y la conexión humana tampoco puede seleccionar esa columna en SQL.

La ruta no llama a proveedores, no firma URLs y no reutiliza fotos/branding. Las tablas permiten únicamente lectura a la aplicación humana; no hay POST de ingesta ni permisos de escritura de observaciones/activos. Las pruebas de archivos usan referencias técnicas en bases descartables y no descargan nada.

## Decisiones necesarias para completar integración

- Proveedor, producto/versionado, condiciones de acceso y fuente de metadatos.
- Licencia de consulta, almacenamiento, redistribución, atribución y uso permitido.
- Frecuencia, resolución, cobertura/calidad y política de observaciones repetidas o corregidas.
- Formatos/tipos, tamaño máximo, cuotas, retención, cifrado y acceso a archivos.
- Almacenamiento de objetos, política de descargas, TTL de firmas, validación de contenido y allowlist de origen/SSRF.
- Autenticación y principal técnico de importación, trazabilidad, reintentos, presupuesto e infraestructura autorizada cuando corresponda.
- Índices recibidos de origen o fórmulas/bandas/tratamiento de faltantes aprobados por el responsable agronómico, antes de mostrar o calcular resultados.

La implementación actual no selecciona proveedor ni supone esas decisiones aprobadas. No se inicia Fase 8 ni se despliega AWS.
