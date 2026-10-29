# Visor Sentinel-2 local — Earth Engine, Python y Vue 3

Implementación autónoma solicitada, ubicada fuera de los paquetes del monorepo Base Fairplay. No sustituye la API Node, las rutas Saphi ni sus permisos empresariales. No se ha desplegado ni conectado a PostgreSQL.

Actualización: el backend de este ejemplo también se reutiliza como proveedor privado del [visor integrado en Saphi](../../docs/saphi/satelital-gee-local.md). Para usar el sistema existente, seguir esa guía; el frontend autónomo de este documento sigue siendo una alternativa separada. El lanzador integrado exige un token interno y las peticiones HTTP directas del ejemplo no funcionan contra ese proceso protegido.

## Estructura

```text
mi-proyecto-satelital/
├── backend-serverless/
│   ├── handler.py
│   ├── requirements.txt
│   ├── package.json
│   ├── serverless.yml
│   ├── tests/test_handler.py
│   └── credenciales-gee.json   ← colocar aquí la llave existente; no incluida
└── frontend-vue/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue
        └── components/MapaSatetal.vue
```

El nombre `MapaSatetal.vue` conserva exactamente el solicitado.

## Qué calcula

| Índice | Bandas Sentinel-2 | Fórmula |
|---|---|---|
| NDVI | B8 NIR, B4 rojo | `(B8 - B4) / (B8 + B4)` |
| NDWI, convención McFeeters | B3 verde, B8 NIR | `(B3 - B8) / (B3 + B8)` |

NDWI aquí significa agua superficial (McFeeters). No se implementa el índice NIR/SWIR de humedad del dosel, a menudo denominado NDMI o NDWI de Gao. No se aplican umbrales de salud agrícola ni clasificaciones de riego. [Referencia de NDWI de Sentinel Hub](https://github.com/sentinel-hub/custom-scripts/blob/main/sentinel-2/ndwi/README.md).

El flujo consulta `COPERNICUS/S2_SR_HARMONIZED`, aplica `filterBounds`, `filterDate` con fin exclusivo y `CLOUDY_PIXEL_PERCENTAGE <= cloud`. En cada escena enmascara SCL, calcula `normalizedDifference`, y finalmente toma la **mediana de índices por escena**, recortada al área solicitada. No es el índice de la mediana de reflectancias ni una observación instantánea. B3/B4/B8 son bandas de 10 m; SCL es de 20 m, por lo que no debe interpretarse su máscara como clasificación independiente a 10 m. [Catálogo oficial](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED).

Se conservan clases SCL 2, 4, 5, 6 y 7: píxeles oscuros, vegetación, suelo, agua y baja probabilidad de nube/no clasificados. Se excluyen nodata, saturación, sombra, nubes medias/altas, cirros y nieve/hielo. Esto no garantiza eliminar toda nubosidad. Se usa SCL para no depender únicamente de QA60, cuya disponibilidad cambió históricamente. El número de escenas cuenta las seleccionadas antes de la máscara: una capa transparente puede no tener píxeles válidos aunque existan escenas.

Las reflectancias de esta colección comparten factor de escala, que se cancela en estos cocientes. No se altera cada banda con offsets arbitrarios. `normalizedDifference` enmascara entradas negativas y no conserva las propiedades de la imagen; por ello la respuesta registra explícitamente período, colección y método. [Contrato de normalizedDifference](https://developers.google.com/earth-engine/apidocs/ee-image-normalizeddifference).

## 1. Requisitos y credenciales

Necesitas Node.js 24/npm y Python **3.11+**. El runtime declarado se conserva en `python3.11` por compatibilidad con el emulador fijado; en este equipo Windows se comprobó el intérprete local 3.12.2 y se creó el entorno virtual con él. El launcher `py` no lo detectó inicialmente; puede usarse la ruta del intérprete indicada en la guía integrada. No cambiar el runtime a 3.12 sin actualizar y validar el emulador.

En PowerShell:

```powershell
node --version
npm --version
py -3.11 --version
```

Si el último comando no encuentra Python, instala Python 3.11 antes de continuar; el launcher `py.exe` por sí solo no es un intérprete. No se instaló Python automáticamente durante esta entrega.

Coloca tu archivo existente `credenciales-gee.json` dentro de `backend-serverless`. No lo pegues en el código ni lo copies a Vue/public. El handler toma `client_email` y `project_id` del JSON e invoca:

```python
credentials = ee.ServiceAccountCredentials(key["client_email"], str(KEY_PATH))
ee.Initialize(credentials=credentials, project=key["project_id"])
```

No hay que editar el código con un ID de proyecto ficticio ni ejecutar `ee.Authenticate()` de forma interactiva para esta cuenta de servicio. Para facturar/consumir otro proyecto autorizado, el código admite `EE_PROJECT_ID`; antes de iniciar puedes establecerlo con el ID real de ese proyecto, pero no es necesario si el del JSON es el correcto.

Además de habilitar la API, el **proyecto debe estar registrado para Earth Engine**. Comprueba que el rol corresponde a Earth Engine Resource Viewer para realizar cálculos; dependiendo de la configuración puede necesitar también Service Usage Consumer sobre el proyecto consumidor. No basta con tener la llave descargada o un nombre de rol visualmente parecido. Estos permisos se revisan en IAM, no se conceden desde el handler. [Cuentas de servicio](https://developers.google.com/earth-engine/guides/service_account) y [control de acceso](https://developers.google.com/earth-engine/guides/access_control).

## 2. Backend — terminal A

Desde este checkout, ejecuta:

```powershell
Set-Location 'C:\Users\Delta\Documents\PROYECTOS\2026\Base-fairplay\examples\mi-proyecto-satelital\backend-serverless'
py -3.11 -m venv .venv
$env:PATH = "$PWD\.venv\Scripts;$env:PATH"
python --version
python -m pip install -r requirements.txt
npm install
python -m unittest discover -s tests -v
```

El prefijo de PATH usa el Python del entorno virtual, sin cambiar la política de ejecución de PowerShell. También puedes activar `.venv\Scripts\Activate.ps1` si tu política lo permite. En Linux/macOS: `python3.11 -m venv .venv` y `source .venv/bin/activate`, seguido de los mismos comandos Python/npm.

**Con Base Fairplay ya abierto:** su API ocupa el puerto 3000. Mantén ambos sistemas usando 3001 para GEE:

```powershell
npm run dev -- --httpPort 3001
```

Endpoint en esta modalidad: `http://localhost:3001/dev/procesar-sentinel`.

**Para usar exactamente el endpoint solicitado en 3000:** detén primero la API Base desde su propia terminal o usa este ejemplo en un entorno independiente y ejecuta:

```powershell
npm run dev
```

Endpoint predeterminado: `http://localhost:3000/dev/procesar-sentinel`. No ejecutes ambas variantes simultáneamente. El puerto 3002 es la invocación Lambda interna y 3003 el WebSocket de Offline; no son el endpoint HTTP público de este ejemplo.

Se fija Serverless Framework **3.40.0**, Offline **13.9.0** y Python Requirements **6.1.2** para conservar los dos plugins explícitos pedidos. Offline 13.9.0 declara compatibilidad con Serverless 3. El repositorio Base utiliza Framework 4; este ejemplo tiene instalación propia y no cambia esa versión. Framework 4 actual incorpora soporte Python Requirements; migrar este ejemplo a 4 exige revisar esa integración para evitar duplicarla. [Compatibilidad de Offline](https://raw.githubusercontent.com/dherault/serverless-offline/v13.9.0/package.json), [soporte Python actual](https://www.serverless.com/framework/docs/providers/aws/guide/python).

`npm run dev` no despliega. No uses `serverless deploy` con esta configuración local: la llave está excluida del paquete y un despliegue necesita una estrategia de identidad, autorización y cuotas propia. Después de una instalación verificada, conserva `package-lock.json` y un lock de Python para fijar transitivas; el `requirements.txt` mantiene el mínimo obligatorio solicitado.

## 3. Frontend — terminal B

La aplicación usa 5174, porque Base Fairplay ya ocupa 5173:

```powershell
Set-Location 'C:\Users\Delta\Documents\PROYECTOS\2026\Base-fairplay\examples\mi-proyecto-satelital\frontend-vue'
npm install
$env:VITE_SENTINEL_API_URL = 'http://localhost:3001/dev/procesar-sentinel'
npm run dev
```

Abre **http://localhost:5174**. Para backend en 3000, antes de iniciar Vite utiliza:

```powershell
$env:VITE_SENTINEL_API_URL = 'http://localhost:3000/dev/procesar-sentinel'
npm run dev
```

El componente usa 3000 por defecto si no existe esa variable. Reinicia Vite después de cambiar variables de entorno. No uses `VITE_` para secretos: esas variables se entregan al navegador.

Comprobar compilación:

```powershell
npm run build
```

El mapa comienza cerca de Talca, como ubicación de navegación, sin representar límites de un predio real. Se consulta el rectángulo visible. Al moverlo o cambiar índice/fechas/nubosidad, se quita la capa antigua, se cancela el Fetch previo y se espera 600 ms antes de consultar. Una respuesta tardía no puede reemplazar la selección actual. Cancelar Fetch no cancela necesariamente un cálculo que GEE ya recibió.

No se añade mapa base de terceros. El fondo gris permite distinguir transparencia; no son datos simulados. La leyenda `-1..1` representa valores del índice, no umbrales agronómicos. El estilo espectral y la imagen son visualización, no exportación analítica de un raster georreferenciado.

## 4. Petición reproducible

Con backend en 3001:

```powershell
$uri = 'http://localhost:3001/dev/procesar-sentinel?index=NDVI&start=2026-09-01&end=2026-10-01&cloud=30&bbox=-71.8,-35.6,-71.5,-35.3'
$result = Invoke-RestMethod -Uri $uri -Headers @{ Origin = 'http://localhost:5174' }
$result | Select-Object index,sceneCount,start,endExclusive,composite
```

Para NDWI cambia `index=NDWI`. La respuesta incluye `tileUrl` real generada por el SDK con `{z}/{x}/{y}`; no se fabrica aquí una URL de ejemplo ni se imprime en la verificación. Leaflet utiliza directamente `map_id['tile_fetcher'].url_format`, el mecanismo del cliente oficial. [Implementación oficial de getMapId](https://github.com/google/earthengine-api/blob/master/python/ee/data.py).

Revisar preflight explícito:

```powershell
Invoke-WebRequest -Method Options -Uri 'http://localhost:3001/dev/procesar-sentinel' -Headers @{ Origin = 'http://localhost:5174'; 'Access-Control-Request-Method' = 'GET' }
```

Orígenes admitidos: `http://localhost:5173` y `http://localhost:5174`; sin comodín ni cookies. No son equivalentes a `http://127.0.0.1:5174`. Los errores del handler incluyen CORS cuando el origen es válido. CORS no autentica clientes ajenos al navegador: el ejemplo permanece ligado a localhost y no se integra como API multiempresa pública.

## 5. Límites, errores y revisión

- `400 INVALID_QUERY`: índice/fechas/área/nubosidad inválidos, parámetros desconocidos o repetidos. Período de 1–366 días; Desde incluido y Hasta excluido; lados de bbox de hasta un grado; sin cruce del antimeridiano. Son límites técnicos del ejemplo, no un cálculo de superficie agrícola.
- `403 ORIGIN_DENIED`: origen del navegador no admitido.
- `404 NO_SCENES`: la colección filtrada está vacía; no es un error de Leaflet.
- `503 GEE_CONFIGURATION`: dependencias Python, llave, proyecto, API, registro o autenticación no disponibles. La respuesta no expone el contenido de la excepción.
- `502 GEE_REQUEST_FAILED`: cálculo, autorización a recursos, cuota o red de GEE; se registra solo el tipo de excepción en backend.
- Falla de tesela después de recibir URL: comprueba red/cuota y pulsa **Actualizar** para pedir un nuevo mapa. No se asume duración fija de la URL ni se almacena como referencia permanente.
- Transparencia con escenas: las máscaras pueden eliminar todos los píxeles del área; `sceneCount` no es un conteo de píxeles válidos.

La cuenta de servicio se utiliza en el backend, nunca en Vue. La llave está ignorada por Git y excluida de Serverless, pero si ya estuvo versionada, ignorarla no la elimina del historial. El SDK lee la llave existente del servidor para la conexión; no se copió, generó ni mostró su contenido.

**Offline no significa sin Internet.** Serverless Offline emula Lambda/API Gateway en tu equipo. Earth Engine realiza los cálculos remotamente y el navegador solicita teselas a Google. Un visor totalmente desconectado requiere otro alcance: exportar datos autorizados, conservar su licencia y generar/servir teselas locales. Este ejemplo no implementa esa exportación.

## Validación realizada en esta entrega

- Revisados los contratos oficiales de colección, normalización, autenticación, getMapId y Leaflet.
- Script y plantilla de ambos componentes compilados con el compilador Vue existente del monorepo.
- JSON de manifiestos, sintaxis JavaScript, exclusión Git de la llave y enlaces documentales comprobados.
- Ejecutadas **14 pruebas unitarias Python** con biblioteca estándar: validación, CORS, inicialización diferida y orden del SDK, token interno, errores sin secretos, bandas/máscara y composición. No hacen llamadas GEE ni necesitan llave.
- Instaladas las dependencias locales del backend y arrancado Serverless Offline. Leaflet instalado y build de la aplicación Saphi verificado; no se ejecutó el build independiente del frontend de ejemplo.
- Se probó la conexión real usando la llave existente: después de actualizar Service Usage Consumer, Google deniega `earthengine.computations.create`. No se ha comprobado la carga de teselas reales. El estado y los permisos pendientes se registran en la guía integrada.

El ejemplo no cambia los estados de aceptación de la integración multiempresa Saphi ni incorpora automáticamente fórmulas del visor a sus indicadores persistidos.
