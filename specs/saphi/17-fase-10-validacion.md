# Saphi Chile — Fase 10: validación funcional, técnica y de seguridad

Fecha: 2026-10-28. Fase autorizada por el usuario tras aprobar Fase 9. **Validación local del alcance implementado completada con observaciones. No constituye aceptación productiva ni cierre de las funcionalidades pendientes.**

## Alcance y criterio

Se valida el incremento disponible sobre Base Fairplay: autenticación/sesiones/MFA reutilizadas, administración empresarial, maestros territoriales, muestras inmutables, registro de dispositivos, consultas de lecturas y catálogo satelital, y resumen consolidado. El inventario API comprende 33 rutas Saphi y el catálogo conserva 27 permisos.

El [plan de pruebas](./07-pruebas.md) exige no confundir pruebas de componentes locales con aceptación de proveedores, reglas agronómicas o despliegue productivo. Esta fase no resuelve por silencio las dependencias de [laboratorio](./12-fase-5-laboratorio.md), [IoT](./13-fase-6-iot.md), [satélite](./14-fase-7-satelital.md) e [indicadores](./15-fase-8-indicadores.md). El [dashboard](./16-fase-9-dashboard.md) conserva sus estados pendientes.

Entorno: Windows/PowerShell, Node.js 24 y pnpm existentes; PostgreSQL 17 local en Docker, API de desarrollo en puerto 3000 y Vue/Vite en 5173. Identidad, correo y objetos locales son simuladores de desarrollo, no servicios AWS verificados. No se instalaron herramientas ni se desplegó infraestructura.

## Aislamiento del proceso de validación

- La suite API reconstruye exclusivamente `app_test`; su prueba de upgrade crea y elimina una base temporal con nombre aleatorio y prefijo `saphi_upgrade_test_`.
- pgTAP utiliza transacciones con rollback sobre la base local. No se ejecutó reset de la base de trabajo ni se aplicaron migraciones nuevas.
- El recorrido manual usa una cuenta demo ya existente y no modifica datos agrícolas o concesiones. El inicio de sesión genera las sesiones y registros de acceso habituales.
- Las pruebas Vue montan la aplicación real con router, Pinia, Vuetify e i18n frente a un backend de prueba; no equivalen a datos o proveedores reales.
- Se conservan las seis migraciones Saphi, políticas RLS, grants y dependencias. Los hashes verificados coinciden con los registrados al terminar Fase 7.

## Correcciones surgidas de la validación

**VAL01 — Identidad duplicada en navegación. Resuelto y comprobado en regresión.** El navegador mostró la advertencia de Vuetify `Multiple nodes with the same ID` porque el selector Saphi y el enlace Empresas compartían ruta y Vuetify la usaba como identidad. Se asignaron valores explícitos al selector, inicio y elementos de menú basados en códigos. Se conserva navegación, autorización y destino. La prueba agrega ambos enlaces al mismo tiempo y comprueba que no aparece la advertencia.

**VAL02 — Preparación de fixtures excedía el límite implícito. Resuelto; 189 pruebas API pasan sin omisiones.** La primera ejecución conjunta agotó el hook de IoT a diez segundos; la repetición aislada agotó el del dashboard. Se configura `hookTimeout: 30_000` para preparar usuarios, perfiles y empresas mediante PostgreSQL y rutas autenticadas. El límite por prueba API continúa en veinte segundos; no se modifica ningún timeout del producto ni cobertura mínima. No se consideran aprobadas las ejecuciones con pruebas omitidas por este fallo.

**VAL03 — Aserción de catálogo dependiente del orden de suites. Resuelto; suite API completa aprobada.** La prueba administrativa asumía exactamente dos módulos raíz. Cuando la suite de configuración corría antes, sus menús ordinarios válidos aparecían también en el catálogo. Ahora exige Seguridad y Saphi, verifica que ningún código reservado al superusuario se exponga en ningún nivel y conserva las comprobaciones de acciones concedibles. Obtiene Seguridad por código, sin depender de su posición. No se alteró la implementación del catálogo para satisfacer la prueba.

**VAL04 — Documentación de permisos demo ambigua. Resuelto.** La [guía demo](../../docs/saphi/recorrido-demo.md) indicaba «todos los módulos implementados» para cuentas que mantienen concesiones territoriales de Fase 4. Se aclara ese alcance. No se otorgaron módulos posteriores automáticamente.

**VAL05 — Caché obsoleta en el servidor Vite. Recuperado y comprobado en navegador.** La navegación a una pantalla de acceso denegado respondió `504 Outdated Optimize Dep` para una dependencia optimizada. Se solicitó reinicio por el watcher actualizando únicamente el timestamp de la configuración Vite, sin cambiar su contenido. No se instaló ni actualizó ninguna dependencia.

## Matriz de evidencia

Una regresión web con dos workers agotó el límite de diez segundos en la prueba existente de exportación/detalle de auditoría (159 pruebas pasaron y una falló). La repetición completa con `--maxWorkers=1` aprobó las 160 pruebas en 144,03 segundos, manteniendo timeout, aserciones y cobertura. La ejecución fallida no se considera evidencia de aceptación. La configuración web conserva su máximo de dos workers; la guía local utiliza uno para reducir contención en este equipo.

| Requisito del plan | Evidencia ejecutable | Cobertura real / límite |
|---|---|---|
| UNIT01, UNIT06 | Contratos de `@base/saphi`, pruebas de satélite/dashboard y estados UI | UUID, campos desconocidos, fechas/unidades de origen, pendiente frente a cero real; no valida fórmulas inexistentes |
| UNIT02, DB03, SEC01/02/05/06 | pgTAP de aislamiento/administración, API de maestros/dashboard, stores/guards Vue | Intersección global/empresa, miembros activos, sin bypass general, revocación observada en la siguiente petición |
| DB01/02/04/05 | pgTAP 07–12 | Restricciones/FK compuestas, RLS, acceso de roles y funciones privilegiadas; referencia privada satelital sin SELECT humano |
| DB06 | Setup API y prueba de compatibilidad de migraciones | Replay y upgrade de Base Fairplay sembrada, conservación de usuarios/configuración y auditoría |
| DB07 | Pruebas API de contexto | Limpieza de actor/empresa tras commit y rollback en la misma conexión; locks de contexto |
| SEC03/04, API25/26 | API/pgTAP de administración, maestros, muestras, IoT y satélite | Identificadores y padres ajenos, cursores ligados, conflictos de versión, autoasignación y último gestor |
| SEC07/09 | Suites base de autenticación/auditoría, pgTAP y prueba de 33 rutas sin sesión | Base conserva controles; no constituye una auditoría externa de seguridad |
| SEC08, API24 | API dashboard/satélite y Vue | Sin datos ni conteos en fuentes restringidas; activo propio cerrado y ajeno no revelado |
| UI01/02/03 | Suites Vue de empresa, vistas y dashboard | Guard/rutas puente, logout/capacidades, cambio de empresa con respuesta tardía, recuperación de errores |
| UI04 | Pruebas de render y recorrido manual limitado | Etiquetas, unidades y navegación verificadas en el alcance descrito; no certificación WCAG ni validación completa con lector de pantalla |
| UNIT04/05, INT01/02/03 | Restricciones de identidad/duplicados y puertos, rutas de recepción ausentes, descarga cerrada | Procesamiento/reintentos/colas/DLQ/bindings reales no implementados: aceptación de integración pendiente |
| GIS01 | Contratos de punto GeoJSON disponibles | Sin PostGIS, polígonos o topología espacial aprobados; prueba espacial avanzada no aplicable aún |
| PERF01 | Consultas acotadas e índices existentes | No se afirma cumplimiento de SLA, capacidad o costo sin volumen y presupuesto acordados |

Pruebas específicas agregadas en esta fase: las 33 rutas rechazan sesión ausente; dashboard rechaza pérdida del techo global aun con concesión empresarial, membresía desactivada y superusuario sin membresía; Vue conserva B cuando llega una respuesta tardía de A; menú sin identidades duplicadas.

## Recorrido local observado

1. Inicio de sesión como gestora demo mediante contraseña y código MFA del simulador local.
2. Selector con las dos empresas demo.
3. Empresa Maule: resumen con tres predios, seis cuarteles, cero muestras y fuentes restringidas identificadas, sin indicadores fabricados.
4. Listado de predios Maule: Los Maitenes, Santa Aurora y El Arrayán.
5. Cambio a Colchagua: La Estrella, Los Aromos y El Molino, con códigos reutilizados correctamente dentro de cada empresa.
6. Acceso directo al dashboard sin concesión demo de ese módulo: redirección a `/forbidden` y mensaje «Sin acceso» comprobados tras recuperar Vite. No se cambia el perfil para forzar una pantalla positiva; las rutas positivas del módulo se ejercitan en integración API y Vue con fixtures autorizados.

7. Selector a 390 píxeles: sin desbordamiento horizontal observado; cambio Español → English → Español comprobado. Se dejó la vista en español y formato de escritorio.

Inventario local comprobado después de pgTAP: dos empresas demo, seis predios, doce cuarteles, 72 puntos, cero muestras/dispositivos/lecturas/observaciones/activos. `app.verify_audit_chain()` devuelve NULL (cadena íntegra).

## Pendientes de aceptación funcional y productiva

| Decisión | Alcance que impide aceptar |
|---|---|
| Q08: catálogo, unidades/métodos y fichas de fórmulas validadas | Análisis de laboratorio y cálculos agrícolas de Fase 8 |
| Q05/Q06: proveedor/protocolo/identidad, volumen, retención y SLA | Recepción IoT real y operación asíncrona/productiva |
| Q07/Q09: fuente/licencia, archivos y política de almacenamiento | Importación/descarga satelital e índices de origen o calculados |
| Q02/Q03: habilitación/recuperación administrativa de capacidades nuevas | Operación de empresas existentes sin un gestor con dichas capacidades |
| Q04 y alcance GIS | PostGIS y funcionalidades espaciales avanzadas |
| Presupuesto, capacidad, entorno y autorización de despliegue | Pruebas AWS/IAM reales, carga, costos, recuperación y salida productiva |

No se ejecutaron pentest externo, escaneo completo de dependencias/secretos, pruebas de proveedores, dispositivos físicos, AWS real ni benchmarks de carga. El job de secret scanning configurado en CI no equivale a una ejecución realizada en esta sesión. Estas limitaciones impiden presentar la validación local como certificación de producción.

## Resultados de cierre

| Comprobación | Resultado final |
|---|---|
| Tipos recursivos | Todos los paquetes, API y Vue correctos |
| `@base/shared` | 29 pruebas; cobertura 100% en las cuatro métricas |
| `@base/saphi` | 27 pruebas; cobertura 100% en las cuatro métricas |
| `@base/ui` | 6 pruebas; 100% líneas, 95,45% ramas, 93,33% funciones, 96,42% sentencias |
| API | 189 pruebas en 16 archivos, sin omitidas; 98,20% líneas, 87,81% ramas, 97,64% funciones, 96,23% sentencias |
| Frontend final, un worker | 160 pruebas en 16 archivos, sin omitidas; 96,81% líneas, 88,08% ramas, 91,31% funciones, 93,85% sentencias |
| pgTAP | 263 comprobaciones en 13 archivos: PASS |
| Build Vue/Vite final | Correcto; advertencias existentes de anotaciones PURE de Zod |
| Bundles Lambda | Seis correctos; Saphi 1580 KiB, sin despliegue |
| Migraciones Saphi | Seis hashes SHA256 conservados respecto del cierre de Fase 7 |
| Datos demo / auditoría | Inventario conservado y cadena íntegra |
| `git diff --check` | Correcto |

Total: **411 pruebas automatizadas y 263 comprobaciones pgTAP aprobadas**. Los mínimos de cobertura por paquete se mantienen en 80% en las cuatro métricas. Los resultados finales se obtuvieron tras corregir los hallazgos anteriores; no se ocultan los intentos fallidos. No se hicieron nuevos cambios funcionales después del build final.

### Dictamen

El alcance implementado queda **validado para desarrollo y revisión local, con observaciones funcionales y operativas pendientes**. Se completaron las pruebas disponibles, las correcciones identificadas y el recorrido manual descrito. Las fases parciales de laboratorio, recepción IoT, integración satelital e indicadores no se transforman en módulos aceptados por pasar esta regresión.

La siguiente decisión del cliente es resolver las fichas y proveedores pendientes y acordar un alcance de piloto, capacidad y operación antes de cualquier aceptación productiva. No hay una Fase 11 implícita ni autorización de despliegue. La ejecución se detiene tras entregar este informe. Para reproducir los resultados, consulta la [guía de validación local](../../docs/saphi/validacion-local.md).
