# Dashboard visual Saphi Chile

## Alcance y aislamiento

Propuesta de presentación en Vue 3, TypeScript y Vuetify 3, creada en el worktree `attachment-pasted-text-1`, rama `feature/saphi-dashboard-ui`, y aplicada posteriormente al checkout principal a petición del usuario tras la Fase 6. La vista de empresa utiliza ahora un panel conectado a los datos reales de Saphi, sin añadir rutas ni permisos.

La inspección previa encontró `main` con cambios sin confirmar en backend, migraciones, módulos Saphi, layout, router, traducciones, pruebas y dependencias de las fases funcionales. El worktree partió del último commit y no copió esos cambios. Tras la Fase 6 se comprobó que las rutas de destino estaban libres y se copiaron el módulo, la entrada independiente, las pruebas, este informe y las capturas al checkout principal. La integración posterior modifica únicamente `CompanyView.vue` y su prueba de flujo; conserva su formulario, navegación y autorización existentes.

## Abrir la propuesta

Con las dependencias del monorepo ya disponibles:

```sh
pnpm --filter @base/web exec vite --config saphi-preview.vite.config.ts
```

Abrir `http://127.0.0.1:5178/saphi-preview.html` para la vista de diseño aislada. En la aplicación, seleccionar una empresa en Saphi muestra el dashboard dentro de la ruta existente `/saphi/companies/:companyId`. La entrada HTML independiente no inicializa sesiones, router ni stores y sigue siendo solo de desarrollo. El build principal usa su entrada original; no publica el HTML de vista previa.

En esta sesión se reutilizaron, mediante junctions locales ignoradas por Git, los `node_modules` del checkout original. No se instalaron dependencias ni se modificó el lockfile. El entorno no expone Node en PATH; se usó `C:/nvm4w/v24.22.1/node.exe`.

## Archivos y componentes nuevos

- [Entrada HTML](../../apps/web/saphi-preview.html) y [bootstrap independiente](../../apps/web/src/modules/saphi/presentation/dashboard/preview.ts).
- [Configuración Vite independiente](../../apps/web/saphi-preview.vite.config.ts): servidor sin proxy de API y build explícito de la demo; admite dependencias locales enlazadas desde otro checkout.
- [SaphiDashboardPreview](../../apps/web/src/modules/saphi/presentation/dashboard/SaphiDashboardPreview.vue): composición y contrato opcional de datos tipados.
- [SaphiHeader](../../apps/web/src/modules/saphi/presentation/dashboard/components/SaphiHeader.vue): marca tipográfica provisional, predio, fecha, hora y usuario de demostración.
- [SaphiSidebar](../../apps/web/src/modules/saphi/presentation/dashboard/components/SaphiSidebar.vue): menú ilustrativo, sin enlaces ni autorización paralela.
- [DashboardMetricCard](../../apps/web/src/modules/saphi/presentation/dashboard/components/DashboardMetricCard.vue): tarjeta reutilizable con variantes barras, semicírculo y anillo. Evita tres componentes casi idénticos.
- [VineyardMap](../../apps/web/src/modules/saphi/presentation/dashboard/components/VineyardMap.vue) y [MoistureLegend](../../apps/web/src/modules/saphi/presentation/dashboard/components/MoistureLegend.vue): SVG original, cuarteles, selección por ratón/teclado, detalle y zoom local acotado.
- [WeatherCard](../../apps/web/src/modules/saphi/presentation/dashboard/components/WeatherCard.vue): clima ficticio, sin proveedores externos.
- [VineyardAnalytics](../../apps/web/src/modules/saphi/presentation/dashboard/components/VineyardAnalytics.vue): agua por día, humedad por día y humedad por cuartel; ejes, unidades, valores accesibles, tooltips por hover/foco y estado vacío.
- [FieldActivity](../../apps/web/src/modules/saphi/presentation/dashboard/components/FieldActivity.vue): eventos ilustrativos con fecha y estado.
- [useDashboardPreview](../../apps/web/src/modules/saphi/presentation/dashboard/composables/useDashboardPreview.ts): selección y zoom sin efectos externos.
- [Datos de presentación](../../apps/web/src/modules/saphi/presentation/dashboard/data/dashboardPreviewData.ts) y [tipos](../../apps/web/src/modules/saphi/presentation/dashboard/types/dashboard.types.ts).
- [CSS encapsulado](../../apps/web/src/modules/saphi/presentation/dashboard/styles/saphi-dashboard.css): todas las reglas parten de `.saphi-dashboard`; variables locales, sin `:root` ni tema global.
- [Pruebas](../../apps/web/test/saphi-dashboard-preview.test.ts): renderizado, props alternativas, estados vacíos, selección por teclado, zoom, gráficos, identificadores SVG únicos y ausencia de llamadas fetch/escritura en storage al montar.
- [CompanyView](../../apps/web/src/modules/saphi/views/CompanyView.vue): monta el panel de datos reales al entrar a una empresa autorizada.
- [SaphiCompanyDashboard](../../apps/web/src/modules/saphi/presentation/dashboard/SaphiCompanyDashboard.vue): consulta los servicios de Saphi para predios, cuarteles, dispositivos, muestras recientes y últimas lecturas; respeta permisos y muestra estados de carga, vacío y error.
- [Prueba de flujo de empresa](../../apps/web/test/saphi/views.test.ts): comprueba datos reales de los endpoints y ausencia de consultas sin permiso.

## Diseño y comportamiento simulado

Verde oscuro `#003d32`, superficies blancas, fondo claro, acentos agrícolas, tarjetas suaves e iconos MDI existentes. Tipografía del sistema sin peticiones a fuentes externas. En escritorio: lateral, tres indicadores, mapa con clima y dos paneles inferiores. En tablet: lateral compacto y reorganización de tarjetas/paneles. En móvil: navegación de iconos y paneles apilados.

Todos los valores, usuario, fecha/hora, variedades, cuarteles, eventos y clima provienen del fixture tipado. La fecha no avanza ni simula una conexión en tiempo real. Los colores y estados de humedad no representan umbrales agronómicos. El SVG es un esquema original sin escala ni coordenadas geográficas, sin imágenes satelitales ni licencias de terceros.

Las pestañas cambian únicamente los datos de muestra visibles. El mapa admite selección y zoom de presentación, sin geolocalización, persistencia, edición ni consultas. El menú, campana y perfil son elementos informativos; no simulan acciones de negocio.

## Diferencias respecto a la referencia

El adjunto recibido contiene instrucciones textuales, sin imagen de referencia. Por ello no se puede afirmar fidelidad visual a una imagen: se sigue la composición y paleta especificadas. La marca es tipográfica provisional; debe reemplazarse por el activo oficial cuando esté disponible. Se usa un mapa esquemático SVG, sin fondo satelital. El objetivo de reducción y los valores de los gráficos son fixtures, no cálculos validados.

## Dependencias

Solo Vue, Vuetify y `@mdi/font` ya declarados; Vitest, Vue Test Utils y happy-dom existentes para pruebas. Sin bibliotecas adicionales de gráficos o mapas. Sin APIs, Pinia, router, autenticación ni backend en el módulo.

## Integración y límites de los datos reales

1. Aprobar la referencia visual y los activos de marca definitivos.
2. El panel de empresa consume los endpoints y contratos de las Fases 5 y 6 presentes en el checkout principal; esos cambios siguen sin confirmar y pueden variar.
3. Los conteos muestran hasta 100 registros de la primera página y añaden `+` si existen más. Las muestras corresponden a los últimos 30 días. Las lecturas conservan el valor y unidad originales de la API. No se calculan porcentajes de humedad, ahorro ni eficiencia sin contratos validados.
4. El panel usa la ruta protegida y los permisos existentes de empresa. El bootstrap de preview permanece fuera de la aplicación.
5. Evaluar si se reemplaza el esquema SVG por Leaflet/MapLibre. No interpretar sus polígonos ni posiciones como geometrías reales.
6. Confirmar responsive y accesibilidad en los navegadores de soporte. El CSS está aislado, pero una integración futura podría heredar estilos externos de la aplicación.
7. La entrada demo no debe publicarse automáticamente. Mantenerla fuera del build principal hasta una aprobación explícita.

## Validación

Validado el 28 de octubre de 2026:

- `vue-tsc --noEmit`: pasa.
- `vitest run --maxWorkers=2 --coverage`: 110 pruebas en 10 archivos, todas pasan. Cobertura global: 95,53 % de sentencias, 91,28 % de ramas, 93,74 % de funciones y 97,71 % de líneas. Los umbrales existentes permanecen sin cambios.
- `vite build --config saphi-preview.vite.config.ts`: pasa; genera `dist/saphi-preview.html` y recursos locales, sin conexión a la app principal.
- Chrome headless: [captura de escritorio 1440 px](./dashboard-desktop.png) y [captura móvil 375 px](./dashboard-mobile.png). Ambos tamaños muestran `scrollWidth` igual al ancho del viewport, sin desbordamiento horizontal. También se comprobó la reorganización a 768 px.
- Iconos MDI cargados en navegador. El mapa SVG y las tarjetas se visualizan en las capturas.

Las cifras anteriores corresponden al worktree aislado antes de aplicar el módulo al checkout principal. La validación sobre la combinación con la Fase 6 se registra a continuación. No se modifican pruebas de fases funcionales ni sus umbrales de cobertura.

### Aplicación tras Fase 6

El módulo se copió al checkout principal sin sobrescribir archivos preexistentes. `vue-tsc --noEmit` pasa con los cambios funcionales sin confirmar. `vitest run --maxWorkers=2 --coverage` pasa: 144 pruebas en 14 archivos. Cobertura global: 93,74 % de sentencias, 88,52 % de ramas, 90,95 % de funciones y 96,70 % de líneas; todos los umbrales existentes se cumplen. Esos resultados preceden a la incorporación del panel en `CompanyView.vue`; la validación final de ese flujo se registra al terminarla.

### Incorporación a la empresa seleccionada

La ruta existente `saphi-company` carga el contexto y valida `saphi.companies:view` antes de mostrar `CompanyView.vue`. La integración inicial mostraba indicadores de demostración. Se reemplazó por `SaphiCompanyDashboard.vue`, que consulta datos reales de la empresa seleccionada y omite las peticiones a recursos sin permiso. Permanecen el encabezado, menú, enlaces y formulario existentes. La página HTML autónoma sigue siendo exclusivamente una referencia visual.

Validación final sobre el checkout principal: `vue-tsc --noEmit` pasa; 20 pruebas dirigidas pasan; la suite completa pasa con 145 pruebas en 14 archivos y cobertura global de 93,75 % de sentencias, 88,57 % de ramas, 90,97 % de funciones y 96,71 % de líneas. `vite build` pasa e incluye el dashboard en el chunk de `CompanyView.vue`.

### Panel con datos reales

La vista de empresa consume `farms`, `plots`, `devices`, `samples` y `telemetry/latest` a través de `saphiApi`, con el `companyId` y las capacidades del store de empresa. Cada sección indica carga, error, falta de permisos o ausencia de registros. No usa el fixture del HTML de demostración. El selector permite cambiar entre dispositivos de la primera página cargada.

Validación técnica sobre el checkout principal tras esta sustitución: `vue-tsc --noEmit` pasa; 21 pruebas dirigidas y 146 pruebas de la suite completa pasan en 14 archivos. La cobertura global cumple los umbrales existentes (93,60 % de sentencias, 87,93 % de ramas, 91,09 % de funciones y 96,79 % de líneas). `vite build` pasa e incluye el panel en el chunk de la vista de empresa.

Una corrección posterior cubre el estado sin dispositivos: el panel deja de indicar carga cuando la API devuelve una lista vacía. Tras ella, `vue-tsc --noEmit` y las 16 pruebas de flujo de Saphi pasan. La aplicación local en `http://localhost:5173/` responde y muestra el acceso; la comprobación visual de una empresa requiere una sesión autenticada.
