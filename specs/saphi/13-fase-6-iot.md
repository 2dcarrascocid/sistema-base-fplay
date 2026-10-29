# Fase 6 — Dispositivos y consultas IoT

Actualización posterior: el usuario eligió AWS IoT Core y autorizó la extensión descrita en la [retoma de Fase 6](./21-fase-6-aws-iot.md). Este documento conserva la evidencia histórica del registro/consulta; el nuevo contrato, identidad de servicio y estado de verificación se detallan en la retoma y su guía operativa.

Inicio solicitado por el usuario el 28 de octubre de 2026. Fase 5 mantiene pendiente el catálogo de análisis; este incremento no lo aprueba ni lo sustituye. Sin despliegues, infraestructura cloud nueva, instalaciones ni Fase 7.

## Alcance implementable y dependencias

API16–18: registro de metadatos de dispositivos, edición de estado/metadatos con versión, detalle/listado, almacenamiento PostgreSQL nativo para lecturas y consultas históricas/últimos valores. No PostGIS, TimescaleDB, gráficos con datos inventados ni cálculos agronómicos.

La recepción productiva requiere Q05/Q06: proveedor, protocolo, payload e identidad estable de mensaje, autenticación, catálogo de magnitudes/unidades, frecuencia, tolerancia de reloj y política de retención. También requiere aprobar principal de servicio/bindings y escritura mínima según [integraciones](./06-integraciones.md). Hasta entonces no se crea endpoint de ingesta, credenciales, binding, colas ni rol técnico. El runtime humano no tiene INSERT/UPDATE/DELETE de lecturas. El almacenamiento vacío no se presenta como un dispositivo conectado. Registrar metadatos no autentica un sensor.

## Modelo y restricciones

Nueva migración incremental con `saphi.devices` y `saphi.sensor_readings`, RLS y FK compuesta `(company_id,plot_id)`/`(company_id,device_id)`. Unicidad de código por empresa y de lectura `(company_id,device_id,source_message_id,sample_index)`. No unicidad global de externalDeviceId: su ámbito real de cuenta proveedora aún no se conoce.

Identidad/empresa/cuartel/código/proveedor/ID externo de dispositivos inmutables. PATCH solo estado y metadata con `expectedVersion`; metadata estructurada opcional de manufacturer/model/serialNumber, textos de 1..100, hasta 4 KiB, sin campos arbitrarios ni credenciales. No cambiar el sello genérico de maestros: trigger específico para dispositivos y reutilización de auditoría base. Sin borrados físicos.

Lecturas conservan magnitud, decimal nativo finito, unidad explícita, observado/recibido, calidad opcional, identidad del mensaje, índice, hash y versión de binding. Es una estructura técnica de persistencia, no catálogo aprobado ni vía de escritura humana. No hay escritura operativa ni semántica de duplicado aceptado sin un adaptador verificado: por ahora la unicidad SQL impide duplicados y sobrescritura. Las pruebas de lectura insertan fixtures exclusivamente en la base descartable, con magnitudes/unidades `test.*`.

Índices por empresa/dispositivo/observado/id y variante por magnitud. Sin particiones, purgas o alertas de frescura. No auditoría por cada lectura de alto volumen; futuras recepciones necesitan trazabilidad de lotes propia aprobada.

## API y permisos

- GET/POST `C/devices`, GET/PATCH `C/devices/{id}`: `saphi.devices:view/create/view/edit` y lectura del mismo recurso para escrituras. POST necesita plots:view y padre visible. Filtros plotId/status, cursor AES-GCM por creación/id ligado a actor/empresa/filtros/límite. DTO explícito, sin secretos ni supuesto binding.
- GET `C/telemetry/readings`: `saphi.telemetry:view` y devices:view para padre visible; deviceId obligatorio, metricCode opcional, from/to obligatorios, `[from,to)`, 0<período≤31 días; limit 1..100, default25 y cursor ligado a todo el contexto. Orden observado/id con precisión SQL conservada.
- GET `C/telemetry/latest`: mismos permisos y deviceId, metricCode opcional. Último por magnitud según observado/id, aunque lleguen fuera de orden; sin inventar conectividad. Máximo100 magnitudes por consulta; si supera ese límite se rechaza y debe filtrarse magnitud, sin truncar silenciosamente.
- Magnitudes/unidades se devuelven como códigos de origen y valores como cadenas decimales; no conversiones ni umbrales. Fechas UTC y precisión pública de hasta milisegundos en filtros, como Fase 5. Lecturas históricas de dispositivos inactivos siguen consultables.
- Sin POST de telemetría, DELETE, reasignación de dispositivos ni adaptador real. 404 indistinguible fuera de empresa; 403 por falta de capacidad en empresa propia; 409 duplicados/versiones.

## Interfaz y verificación

Vistas Vue de dispositivos y telemetría, es/en, rutas empresariales/puentes, navegación por capacidades, estados de carga/error/vacío y dependencia de ingesta visible. Telemetría ofrece historial y últimos valores, filtros y tabla con valor/unidad/observado/recibido/calidad; sin gráfico o estado online que presuponga catálogo o umbral de conexión. Fechas ISO con zona explícita y período inicial de 24 horas. Cambiar empresa invalida respuestas tardías.

Contratos, integración API con PostgreSQL, pgTAP (FK, RLS, grants y unicidad), componentes Vue, regresión, tipos, build y bundles. Aplicar migración solo local tras validarla en base descartable; conservar datos demo existentes y no ampliar automáticamente sus permisos o agregar mediciones falsas. Solicitar información pendiente para completar ingesta.

## Resultado del incremento — 28 de octubre de 2026

**Registro de dispositivos, persistencia y consultas implementados; recepción real pendiente de Q05/Q06.** La pregunta sobre proveedor/payload/autenticación se presentó durante la implementación; no se recibió información que permita abrir la ingesta. Fase 6 completa no se considera cerrada por disponer de tablas vacías y consultas.

| Verificación final | Resultado |
| --- | --- |
| Typecheck workspace | Correcto |
| Contratos Saphi | 22 pruebas; 100% de cobertura |
| API y regresión con PostgreSQL descartable | 176 pruebas; 98,12% líneas / 87,55% ramas |
| Vue, guardas y regresión de plataforma | 139 pruebas; 96,67% líneas / 87,84% ramas |
| pgTAP en base descartable y base local migrada | 245 comprobaciones correctas |
| Build web y seis bundles Lambda | Correctos; bundle Saphi aproximadamente1574 KiB |

Se probaron valores con más de 20 decimales, orden observado distinto del de recepción, desempate por ID, períodos semiabiertos, cursores ligados a filtros, fuentes/empresas ajenas, cambios con versión, metadatos arbitrarios rechazados y unicidad estructural. Una consulta de últimos valores con101 magnitudes se rechaza y pasa al filtrar una, en lugar de truncar silenciosamente. Pruebas negativas confirman ausencia de POST de telemetría y de DELETE de dispositivos.

El primer ensayo pgTAP requirió adaptar la suplantación de roles al patrón transaccional ya usado en las suites08/09. Los grants de impersonación y acceso a contadores temporales son exclusivamente de prueba y se revierten mediante rollback; no se modificó la configuración persistente de roles.

La [migración incremental](../../supabase/migrations/20261028000500_saphi_devices_telemetry.sql) se aplicó solo local después de verificarla sobre bases descartables. SHA256: `29774F5A981DFEE6046809ADAE506A3A4BC5E92DD1C86519E9085A2DB7CE24A3`. Las cuatro migraciones anteriores conservan sus hashes. No hubo instalaciones de dependencias, reset, recursos cloud nuevos ni despliegues. Comprobación de datos local posterior: cero dispositivos, cero lecturas y dos empresas DEMO existentes. Las mediciones de prueba permanecen exclusivamente en bases descartables o transacciones revertidas.

## Acceso a los módulos y condiciones de continuación

Las concesiones anteriores se conservan. Los gestores no pueden autoconcederse permisos IoT ni otorgar capacidades que no poseen. Si una empresa existente no tiene gestor con concesiones IoT, habilitarle ese módulo requiere un procedimiento de plataforma aprobado Q02/Q03; esta fase no agrega un bypass ni altera perfiles empresariales como efecto de la migración. Puede probarse el registro con una empresa creada mediante bootstrap con los permisos iniciales IoT explícitos y techo global suficiente. La [guía operativa](../../docs/saphi/iot-local.md) detalla permisos, recorrido y este límite.

Para completar recepción se necesitan proveedor/protocolo, payload anonimizado e identidad de mensajes, catálogo/unidades, autenticación y vinculación empresarial, tolerancia de reloj, frecuencia, retención/SLA/presupuesto y aprobación del principal técnico/función estrecha. No se usa un usuario humano como consumidor ni se confía en companyId del payload. Cualquier cola/servicio con costo requiere autorización separada. No se inicia Fase 7 y sigue pendiente el catálogo de análisis de Fase 5.
