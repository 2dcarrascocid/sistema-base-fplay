# Saphi Chile — 05. Frontend Vue

Estado: **PROPUESTA DE FASE 1 — pendiente de aprobación**. Sin componentes implementados ni dependencias incorporadas. Referencias: [arquitectura](./01-arquitectura.md), [seguridad](./03-seguridad.md), [API](./04-api.md).

## Integración y navegación

Mantener Vue 3, Vuetify 3, Pinia, Vue Router y Vue I18n de la base. Reutilizar [AppLayout](../../apps/web/src/layouts/AppLayout.vue), [HTTP](../../apps/web/src/services/http.ts), [sesión](../../apps/web/src/stores/session.ts), [guards](../../apps/web/src/router/guards.ts), [notificaciones](../../apps/web/src/stores/notify.ts) y [UI compartida](../../packages/ui/src/index.ts). No crear otra shell o login.

Rutas lazy bajo `/saphi`. Empresa seleccionada forma parte de la URL; los servicios llaman la ruta empresarial equivalente de API. No almacenar el token, permisos ni objetos de empresa en localStorage. Recordar solo el último UUID es una mejora opcional: siempre revalidarlo, sin tratarlo como autoridad.

| Ruta Vue propuesta | Vista / objetivo | Permiso contextual |
|---|---|---|
| `/saphi/companies` | CompaniesView: empresas accesibles y selección | Descubrimiento autenticado; resultados limitados por servidor |
| `/saphi/companies/new` | CompanyCreateView: bootstrap | Control superusuario propuesto; no habilitar hasta aprobar política |
| `/saphi/companies/:companyId` | CompanyDetailView: datos de empresa | `saphi.companies:view` |
| `/saphi/companies/:companyId/memberships` | CompanyMembersView: miembros/concesiones | `saphi.memberships:view`, editar requiere `:edit` |
| `/saphi/companies/:companyId/dashboard` | SaphiDashboardView | `saphi.dashboard:view` + fuentes autorizadas |
| `/saphi/companies/:companyId/farms` | FarmsView | `saphi.farms:view` |
| `/saphi/companies/:companyId/plots` | PlotsView | `saphi.plots:view` |
| `/saphi/companies/:companyId/plots/:id` | PlotDetailView | `saphi.plots:view` y permisos de cada pestaña |
| `/saphi/companies/:companyId/maps` | MapsView | `saphi.plots:view`; capas adicionales según fuente |
| `/saphi/companies/:companyId/samples` | SoilSamplesView, puntos de muestreo | `saphi.samples:view` |
| `/saphi/companies/:companyId/laboratory` | LaboratoryView | `saphi.laboratory:view` |
| `/saphi/companies/:companyId/devices` | DevicesView | `saphi.devices:view` |
| `/saphi/companies/:companyId/telemetry` | TelemetryView | `saphi.telemetry:view` |
| `/saphi/companies/:companyId/satellite` | SatelliteView | `saphi.satellite:view` |
| `/saphi/companies/:companyId/irrigation` | IrrigationView | `saphi.irrigation:view` |
| `/saphi/companies/:companyId/indicators` | IndicatorsView | `saphi.indicators:view` |

Los botones create/edit se rigen por la misma clave del recurso, no por rol global. No ofrecer cambios de identidad externa ni borrado que el API no permite.

### Menús existentes y contexto

El catálogo actual restringe rutas de menú a rutas estáticas, no acepta `:companyId`. Propuesta R11: registrar módulo `saphi` con entradas estáticas `/saphi/farms`, `/saphi/plots`, etc.; estas son rutas puente que validan empresa activa y redirigen al destino empresarial. Sin selección llevan al selector y conservan un destino interno permitido, nunca una URL arbitraria.

Reutilizar el árbol dinámico de `/me` como techo global. Agregar navegación Saphi contextual a partir de `capabilities.menu`, filtrando por asignación empresarial; las rutas puente evitan modificar el constraint histórico de menús. La futura integración en layout para ese segmento requiere cambio explícito y pruebas; no crear menú duplicado hardcoded ni filtrar menús base por tenant. Sin empresa, mostrar selector y acceso a empresas; no mostrar una colección de datos mezclados.

El guard global actual no conoce concesiones empresariales. Añadir guard del módulo que espere selección validada y capacidades, y rechace acceso por URL directa. No alterar la semántica de `session.can` ni usar su bypass superusuario como permiso empresarial. El backend sigue siendo autoridad aunque la UI o menú estén desactualizados.

## Estado y cambio de empresa

| Store / servicio propuesto | Contenido y alcance |
|---|---|
| `useSaphiCompanyStore` | Listado accesible, selectedCompanyId, metadatos mínimos y estado de carga; valida API01/API03 |
| `useSaphiCapabilitiesStore` | Permisos efectivos/menú/version de membresía por empresa; consulta API05, invalidación en403/cambio |
| Stores de recursos | Colecciones y filtros por empresa, nunca un mapa global sin key tenant |
| `saphiApi` | Usa HTTP base y contratos `@base/saphi`; recibe companyId explícito en cada operación |
| Filtros compartidos | Empresa → predio → cuartel; solo IDs visibles compatibles, período explícito |

Transición obligatoria: resolver URL → invalidar epoch de solicitudes anteriores → limpiar filas/selección/filtros dependientes/capacidades → consultar empresa y capacidades → cargar datos autorizados. El cliente HTTP base no expone cancelación: usar token de generación para descartar respuestas tardías; evaluar AbortSignal solo como cambio futuro justificado, sin asumir que existe. Las promesas anteriores no pueden repoblar una store de la nueva empresa.

Logout/session lost limpia todas las stores Saphi.403 refresca capacidades y retira acciones;404 de empresa muestra selector sin nombre de empresa ajena; conflicto409 conserva formulario y ofrece recargar/comparar versión. No reintentar automáticamente escrituras fallidas fuera del refresh base sin garantía idempotente.

## Componentes y estados funcionales

Reusar AppPageHeader, AppConfirmDialog, AppStatusChip y campos/notificaciones base. Componentes propios posibles: CompanySelector, FarmPlotFilter, PeriodFilter, DecimalWithUnit, DataAvailability, MapPanel, TimeSeriesPanel. Ninguno contiene reglas de agronomía; unidades vienen de catálogo aprobado. Campos compartidos y DTO no se duplican como interfaces incompatibles en web/API.

Cada vista contempla loading, éxito, sin datos, error recuperable, sin permiso, empresa inactiva, definición pendiente y datos antiguos/retrasados con timestamp. Distinguir un valor cero real de ausencia; nunca mostrar un sensor ficticio como conectado. Los indicadores pendientes no tienen colores de salud ni umbrales inventados. Conectividad/frescura requiere umbral acordado con cliente.

es/en para etiquetas, acciones, validación y estados. Mantener timestamps originales; visualizar zona claramente, unidades junto a valores, precisión según catálogo. Formularios con labels/errores accesibles, foco al error, navegación de teclado y confirmación de cambios administrativos. Responsive: tablas con columnas prioritarias y detalle accesible; filtros verticales en móvil. No depender de rojo/verde para transmitir estado.

## Mapas y gráficos: evaluación, sin selección cerrada

| Opción a evaluar | Adecuación técnica propuesta | Comprobación previa a adopción |
|---|---|---|
| Leaflet | Mapa de puntos/polígonos y teselas raster para piloto | Versión/licencia vigente, typings, proveedor de teselas, CSP, controles accesibles |
| MapLibre GL JS | Capas vectoriales y mayor complejidad cartográfica | Workers/WebGL, consumo en móvil, fuentes/estilos, CSP y licencia vigente |
| Chart.js | Series temporales habituales, integración directa con Vue | Accesibilidad alternativa al canvas, downsampling, peso, versiones/formatos |
| Apache ECharts | Exploración de series y gráficos más complejos | Tamaño modular, accesibilidad, interacción en móvil y licencia vigente |

Estas son alternativas a comparar, no una validación actual de versiones, licencias o compatibilidad. Realizar prueba técnica posterior con requisitos reales y sin instalar ahora. Las tablas de datos deben funcionar sin mapa/gráfico. Carga lazy, puntos acotados y agrupación explícita; no descargar una serie ilimitada para dibujarla.

La CSP actual limita fuentes externas y workers; geolocalización está deshabilitada. No ampliar `connect-src`, `img-src`, `worker-src` o Permissions-Policy hasta aprobar proveedor y necesidad. Mapas no requieren por defecto GPS del usuario. No enviar coordenadas de predios a terceros sin una decisión explícita de servicio/datos. Teselas/imágenes tienen costo, atribución y licencias pendientes.

## Criterios funcionales de salida futura

Usuario editor A/lector B ve acciones distintas y la API confirma esos límites; selección no mezcla datos; pestañas no autorizadas no consultan fuentes; URL directa aplica guard; refresh y logout mantienen comportamiento base; es/en, teclado y móvil cubiertos. No implementar vistas definitivas antes de aprobación de esta especificación y del alcance de su fase.
