# Visor Earth Engine dentro de Saphi

Actualización de Fase 7, 2026-10-28. El visor está integrado en la pantalla satelital de la aplicación principal, con Leaflet y una API autenticada por empresa. **Conexi?n real verificada tras el ajuste IAM: NDVI y NDWI generan mapas y cargan teselas de Google en Saphi.** No se inicia una fase posterior.

## Abrir el visor

Usa `gestora.saphi@local.test` con las credenciales del simulador local descritas en la [guía demo](./recorrido-demo.md). Selecciona **DEMO Saphi Satelital GEE**, abre Satélite, selecciona el cuartel y pulsa **Visualizar Sentinel-2**:

[Abrir visor local](http://localhost:5173/saphi/companies/04325678-f647-4d30-a9b3-be5d0fe5fc31/satellite).

Esta empresa tiene un predio, un cuartel y nueve puntos ilustrativos cerca de Talca. Seis puntos adicionales amplían el área de referencia del visor para hacer la imagen más legible; siguen sin representar un lindero real ni certificar uso agrícola del lugar. Fue preparada mediante APIs administrativas existentes, con perfil de lectura satelital separado y bootstrap explícito para la gestora. No se cambiaron las concesiones empresariales de Maule o Colchagua; tampoco se concedió membresía automática al superusuario.

## Ejecutar localmente

La API Base sigue en `localhost:3000` y Vue en `localhost:5173`, con su comando de desarrollo habitual. El proveedor privado Python utiliza `localhost:3001`. Desde la raíz:

```powershell
pnpm --filter @base/api gee:dev
```

El [lanzador](../../apps/api/scripts/start-gee.mjs) encuentra la llave en `apps/api/credenciales-gee.json` sin copiarla. Admite otra ruta a través de `GEE_KEY_FILE`, únicamente en el entorno del servidor. Usa el entorno virtual del [backend Python](../../examples/mi-proyecto-satelital/backend-serverless/handler.py), agrega su intérprete al PATH y arranca los plugins Serverless definidos en el ejemplo. Si 3001 ya está ocupado, se detiene sin sobrescribir la configuración del servicio existente.

Se verificó Python 3.12.2 instalado en el equipo y se creó el entorno virtual local con ese intérprete. La configuración Serverless declara `python3.11`, compatible con el emulador fijado: en Windows se usa el `python.exe` del entorno virtual (3.12, código compatible con 3.11+). No es prueba de paridad con una Lambda desplegada. No se instala otra versión global de Python.

Para reconstruir el entorno en este mismo equipo, si falta:

```powershell
& 'C:\Users\Delta\AppData\Local\Programs\Python\Python312\python.exe' -m venv examples/mi-proyecto-satelital/backend-serverless/.venv
& './examples/mi-proyecto-satelital/backend-serverless/.venv/Scripts/python.exe' -m pip install -r examples/mi-proyecto-satelital/backend-serverless/requirements.txt
```

Los plugins Node del backend se instalan con `npm install` dentro de `examples/mi-proyecto-satelital/backend-serverless`. Leaflet y sus tipos ya están declarados en el paquete web del monorepo; un checkout nuevo debe instalar el lock del monorepo.

Para preparar otra vez la empresa demo sin duplicar sus registros ni modificar las concesiones anteriores:

```powershell
node apps/api/scripts/seed-gee-demo.mjs --local-demo
```

El script opera exclusivamente por HTTP en localhost con las identidades locales existentes. Conserva los perfiles previos de la gestora y agrega solo el perfil satelital específico. Rechaza `NODE_ENV=production`, registra las acciones por los mecanismos de auditoría base y cierra las sesiones creadas. No utiliza SQL de propietario ni cambia RLS.

Para llenar las tablas locales de muestras y observaciones con filas **ficticias e identificadas como DEMO**, ejecuta después:

```powershell
node apps/api/scripts/populate-saphi-visual-demo.mjs --local-demo
```

La carga es repetible y está fijada a la base Supabase local. Comprueba la identidad demo antes de escribir. Agrega tres fechas por cuartel activo con un punto activo; las observaciones usan `demo.local`, calidad `demo` y referencias `DEMO-NO-DOWNLOAD`. Son filas para recorrer la tabla, no escenas capturadas por Earth Engine ni archivos descargables. El visor GEE continúa consultando imágenes reales por separado.

## Corregir el acceso de Google

La primera prueba devolvió `service_usage_permission_required`. Después del cambio comunicado por el usuario, una nueva llamada real devuelve denegación de `earthengine.computations.create`. La interfaz autenticada también confirma el error de configuración (HTTP 503), sin sustituirlo por imágenes simuladas. Un administrador debe revisar en el **proyecto consumidor usado por `ee.Initialize`** (por defecto `project_id` del JSON):

1. La cuenta de servicio tiene **Service Usage Consumer**, ID `roles/serviceusage.serviceUsageConsumer`; permiso requerido `serviceusage.services.use`.
2. La identidad de la cuenta de servicio de la llave tiene `earthengine.computations.create`, incluido en **Earth Engine Resource Viewer**, ID `roles/earthengine.viewer`, asignado en el proyecto consumidor. Revisar identidad, proyecto, condiciones IAM y posibles denegaciones si ese rol ya figura asignado. Para emitir mapas también se requiere `earthengine.maps.create`; revisar el permiso por separado y concederlo mediante un rol autorizado que lo incluya. No confundir un rol genérico de visualizador con el rol específico de Earth Engine. [Permisos oficiales](https://docs.cloud.google.com/iam/docs/roles-permissions/earthengine).
3. El proyecto está registrado en Earth Engine y su API está habilitada.

No es necesario enviar o mostrar la llave. No se intenta conceder roles desde una cuenta que carece de autoridad IAM. La [documentación oficial de cuentas de servicio](https://developers.google.com/earth-engine/guides/service_account) explica el requisito de proyecto registrado y el posible permiso adicional de Service Usage.

Cuando se aplique el cambio, repetir desde el directorio del backend Python:

```powershell
$env:GEE_KEY_FILE = 'C:\Users\Delta\Documents\PROYECTOS\2026\Base-fairplay\apps\api\credenciales-gee.json'
& '.\.venv\Scripts\python.exe' probe_gee.py
```

La sonda no imprime claves, tokens, URLs de teselas ni identificadores del proyecto. Un resultado `connected` confirma acceso a la colección, pero todavía debe comprobarse la generación y carga de teselas desde Saphi. Un nuevo error debe resolverse antes de cerrar la fase.

## Flujo y autorización

`Vue/Leaflet → API Base autenticada → contexto empresarial/RLS → proveedor Python privado → Earth Engine → teselas de Google`.

Endpoint nuevo: `GET /saphi/companies/{companyId}/satellite/map`, con `plotId,index,start,end,cloud`. Requiere membresía activa y permisos efectivos de `saphi.satellite:view`, `saphi.plots:view` y `saphi.samples:view`. Cada permiso exige techo global y concesión empresarial. El cuartel se busca dentro de la empresa; un cuartel ajeno devuelve 404 antes de contactar al proveedor.

El cliente no puede enviar bbox, URL, projectId, credenciales ni otra empresa como parámetros. El servidor calcula la envolvente de los puntos activos del cuartel y agrega un margen de 0,001 grados por lado. Es un área de referencia, **no un lindero ni una superficie calculada**. Sin coordenadas activas devuelve 409. Áreas de más de un grado por lado o fuera de la proyección admitida se rechazan.

El proveedor valida su token interno. El token se genera al arrancar y se guarda en `.local/saphi-gee.json`, ignorado por Git; nunca se envía a Vue. La respuesta del proveedor se valida por esquema, host HTTPS de Google, plantillas de coordenadas y coincidencia del índice/período/nubosidad/bbox de la solicitud autorizada. El adaptador local no se incluye en los bundles Lambda.

Se devuelven URLs temporales de visualización de GEE directamente a un cliente autorizado, según el contrato solicitado. No se persisten ni se muestran como texto. **La autorización se comprueba al emitir el mapa, no en cada petición directa de tesela a Google**: una URL ya emitida puede continuar funcionando tras revocar una concesión hasta que Google deje de aceptarla. No se promete revocación inmediata ni TTL fijo; un proxy autenticado por tesela sería otro alcance si se exige esa garantía.

## Datos y estados

NDVI usa B8/B4; NDWI usa McFeeters B3/B8. Se calcula el índice por escena, con máscara SCL, y luego la mediana temporal. Los filtros usan fechas UTC y final exclusivo; máximo 366 días. Una escena seleccionada no garantiza píxeles válidos después de la máscara. No se presentan nubes, transparencia o ausencia como cero real.

Al cambiar cuartel/empresa se retiran capas y resultados previos, se aborta la petición en el navegador y se descartan respuestas tardías. Tras la primera consulta explícita, cambiar índice/fechas/nubosidad actualiza el mapa con debounce. No se hace cómputo externo automático al abrir la pantalla. Abortar el Fetch no garantiza cancelar un trabajo ya recibido por GEE.

La pantalla conserva el catálogo histórico previo. El visor no importa imágenes a ese catálogo ni guarda resultados en tablas de indicadores. Las descargas/exportaciones de archivos permanecen cerradas por su política pendiente. La nueva solicitud del usuario seleccionó GEE/Sentinel-2 para visualización; no resolvió por sí sola las políticas de archivo o aceptación productiva.

## Validación

Tipos correctos. Contratos: 29 pruebas; API: 193; interfaz: 166; Python: 14. Las pruebas automatizadas usan fixtures/dobles identificados y verifican permisos, aislamiento, parámetros, errores, capas y respuestas tardías. Build web y seis bundles Lambda correctos. No se ejecutaron migraciones ni se modificaron políticas/grants SQL.

La sonda real de Google continúa rechazada, ahora por `earthengine.computations.create`. **La Fase 7 no está cerrada** hasta resolver IAM y comprobar la visualización real, sin sustituir esa evidencia por pruebas con dobles. El resto de fases permanece detenido.
