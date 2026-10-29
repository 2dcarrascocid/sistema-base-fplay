# Saphi Chile — Fase 9: visualización consolidada

Fecha: 2026-10-28. Fase autorizada por el usuario. La aprobación permite continuar con la visualización; Q08 no contiene aún fórmulas para completar los cálculos de Fase 8. El dashboard declara esa dependencia explícitamente.

## Alcance implementado

- `GET /saphi/companies/{companyId}/dashboard`, dentro de la Lambda agrupada y del servidor de desarrollo existentes: 33 rutas Saphi. Autenticación, sesiones/MFA y transacción base reutilizadas.
- Contrato compartido `dashboardQuerySchema` y `DashboardDto` en `@base/saphi`.
- Vista `/saphi/companies/:companyId/dashboard`, acceso desde el detalle de empresa y ruta puente `/saphi/dashboard`. Conserva el resumen de empresa ya existente.
- Secciones de predios, cuarteles, dispositivos, muestras, telemetría y observaciones satelitales. Laboratorio e indicadores muestran `pending_definition` cuando el usuario tiene acceso, y `forbidden` en caso contrario.
- Interfaz adaptable con etiquetas es/en, estados de carga y error recuperable, fechas UTC, período explícito, registros de origen y enlaces a los módulos.

## Contrato y límites

`from` y `to` son obligatorios, con zona horaria y hasta milisegundos. Se normalizan a UTC y exigen `from < to`. Período semiabierto `[from,to)` aplicado a fecha de toma, observación IoT y adquisición satelital, respectivamente. Predios, cuarteles y dispositivos representan el registro actual y no un corte histórico.

Filtro opcional `plotId` validado dentro de la empresa, con `saphi.plots:view`; el resumen de predios se limita al padre del cuartel. El filtro independiente `farmId` propuesto en Fase 1 queda fuera de este incremento y se rechaza con 400, sin ignorarlo silenciosamente. No hay parámetros de orden, tamaño, cursor ni URL libre.

Cada sección de datos devuelve como máximo seis elementos, ordenados descendentemente por fecha de registro o de origen e ID estable. Una séptima fila determina `hasMore`; no se calculan ni muestran totales de colecciones. Los módulos conservan su propia consulta y paginación. Los enlaces abren el módulo con sus filtros propios; no prometen conservar el período del resumen.

Estados del contrato: `available` con `data` y `hasMore`, `no_data`, `forbidden`, `pending_definition`. Una fuente restringida no devuelve datos, conteos ni marca de truncamiento. Los errores de consulta producen el error HTTP normal de la petición; no se convierten en ausencia de datos ni en un éxito parcial engañoso. `generatedAt` señala el momento de generación, no sincronización del proveedor. Las lecturas usan el aislamiento transaccional existente; no se promete un snapshot temporal único entre sentencias.

Los valores decimales se conservan como cadenas, incluido cero real. No se agregan magnitudes con unidades diferentes, se calculan indicadores, se presumen conexiones activas, se descargan activos o se consultan proveedores.

## Seguridad y cambios justificados

El endpoint requiere `saphi.dashboard:view` efectivo. Cada sección verifica además su permiso de origen; telemetría exige lectura de dispositivos y satélite exige lectura de cuarteles. Permisos efectivos = techo global y concesión contextual con membresía activa. No hay bypass de superusuario.

Las consultas usan la misma transacción autenticada y rol runtime bajo las políticas RLS existentes, con empresa explícita en todos los accesos. El join de lecturas/dispositivos incluye empresa y dispositivo. No se cambia ninguna política, grant o migración. La respuesta hereda `Cache-Control: no-store`.

La vista descarta datos al editar filtros y rechaza respuestas de una petición anterior al cambiar filtros, empresa o capacidades, o al desmontarse. Los errores pueden recargarse. La navegación tiene guard del permiso de dashboard; la API sigue siendo la autoridad sobre las fuentes.

Se extienden registro de rutas API/Serverless, servicio y rutas Vue, enlaces de empresa y traducciones porque son necesarios para exponer la nueva consulta. No se modifica el resumen visual previo ni su fixture de presentación. No se añaden dependencias, infraestructura o recursos con costo. El registro Serverless no implica un despliegue.

## Habilitación y dependencias

Las empresas y perfiles demo mantienen sus concesiones actuales. Se requiere habilitación explícita de `saphi.dashboard:view` en ambos niveles y de las fuentes deseadas; un perfil global por sí solo no basta. La recuperación/habilitación de empresas sin un gestor que posea nuevas capacidades sigue sujeta a Q02/Q03; no se utiliza SQL directo para eludirla. Una nueva empresa puede recibir estas capacidades durante el bootstrap autorizado si la primera persona gestora cuenta con el techo global necesario.

La navegación global persistida no se modifica: el acceso nuevo parte del enlace en la empresa autorizada o de la ruta directa. No se habilitan automáticamente módulos a personas existentes.

Pendientes: fichas agronómicas Q08, catálogo de laboratorio, ingesta IoT Q05/Q06, proveedor/licencia/archivos satelitales Q07/Q09 y, si se requiere, filtro independiente por predio. No se consideran resueltos por la aprobación de avance. No se inicia Fase 10 ni se ejecutan despliegues.

## Validación

Pruebas nuevas de contratos, integración API con base aislada y aplicación Vue con backend de prueba: permisos por fuente, aislamiento A/B, período, truncamiento explícito, cero real, dependencias pendientes, recuperación y respuesta tardía.

Resultados ejecutados sobre el workspace:

| Verificación | Resultado |
|---|---|
| Tipos de todos los paquetes, API y Vue | Correctos |
| Contratos `@base/saphi` | 27 pruebas; cobertura 100% en las cuatro métricas |
| API | 186 pruebas en 16 archivos; 98,20% líneas y 87,81% ramas |
| Frontend | 158 pruebas en 16 archivos; 96,81% líneas y 88,04% ramas |
| Vista nueva | 100% líneas, 94,73% ramas |
| Build Vue/Vite | Correcto; advertencias preexistentes de anotaciones PURE de Zod |
| Bundles API | Seis correctos; Saphi 1580 KiB, sin despliegue |
| `git diff --check` | Correcto |

La API usa `app_test`, reconstruida por el global setup existente, y fixtures exclusivos de pruebas. La suite web utiliza backend de prueba, no constituye una sesión autenticada comprobada manualmente en el navegador. No se ejecutaron migraciones ni pruebas pgTAP nuevas porque no se modificaron objetos, políticas o privilegios SQL. Se conservan umbrales, configuración de seguridad y datos demo. La autorización de una fase posterior y la aceptación de integraciones/cálculos pendientes continúan separadas.
