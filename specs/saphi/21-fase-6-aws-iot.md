# Fase 6 — extensión AWS IoT Core

Fecha: 2026-10-28. Diseño inspeccionado y presentado antes de implementar; el usuario solicitó desarrollar lo faltante. Extensión local autorizada, sin autorización de despliegue o cambio de políticas AWS.

## Alcance

Se reutilizan tablas y consultas de Fase 6, permisos empresariales, auditoría y vistas Vue. Nuevos componentes: contrato de envelope, adaptador de persistencia, Lambda dedicada, simulador oficial MQTT5, bindings/recibos y rol técnico mínimo en migración incremental, polling REST y panel de lecturas. No hay aplicación paralela, reasignación automática de dispositivos o cambio de permisos humanos.

El endpoint se obtiene de `apps/api/.env`. Archivos X.509 locales excluidos de Git y empaquetado. No se encontró una integración Azure operativa que deba retirarse. Simulador separado de dependencias runtime Lambda.

## Estado de evidencia

Conexión real MQTT5 aceptada con el SDK oficial, sin publicaciones. Pruebas de publicación usan mocks; la confirmación de conexión no acredita autorización del tópico ni ingesta real. SQL, API y frontend se prueban localmente con fixtures identificados; no se presentan como sensores físicos.

La [guía operativa](../../docs/saphi/aws-iot-local.md) describe comandos, inventario de cambios, contrato, seguridad, recursos propuestos, despliegue y reversión.

| Verificación ejecutada | Resultado |
|---|---|
| Contratos Saphi | 30 pruebas; 100% líneas, ramas y funciones |
| API completa | 198 pruebas; 98,23% líneas, 88,04% ramas; mínimo 80% conservado |
| Web final | 168 pruebas; 96,81% líneas, 87,65% ramas, 91,05% funciones, 93,64% sentencias |
| Ingesta y GEE juntos, tras cambios de migración | 9 pruebas correctas |
| Simulador sin AWS | 3 pruebas correctas, incluida publicación con mock y confirmación rechazada |
| Conexión SDK real | MQTT5 aceptado; ninguna publicación |
| pgTAP | 277 comprobaciones en 14 archivos, PASS |
| Tipos API y Vue | Correctos |
| Build web y bundles | Correctos; siete entradas, ingesta 1133 KiB |
| Enlaces nuevos y diff | Sin enlaces locales rotos ni errores de espacios |

La regresión web completa tuvo inicialmente 165 pruebas correctas y dos timeouts de 10 segundos (detalle de usuarios y edición de dispositivo); las ocho pruebas específicas de IoT/polling habían pasado antes. Una repetición alcanzó otro timeout en creación de empresa y se interrumpió; otra ejecución se detuvo para incorporar el filtro de cuartel y su prueba. La ejecución final aprobó 168 pruebas en 18 archivos, con `--maxWorkers=1 --testTimeout=30000` por lentitud del entorno. El límite de treinta segundos se aplicó solo mediante CLI: no cambió la configuración de producto ni de pruebas del repositorio, las aserciones o el mínimo de cobertura del 80%. La compilación final de Vue también pasó tras corregir el estrechamiento del DTO de opciones de cuartel.

El primer pgTAP detectó que el inventario cerrado de tablas aún no incluía `iot_bindings`/`iot_receipts`: se actualizó el conjunto esperado sin retirar las comprobaciones de RLS/grants. La repetición aprobó las 277 comprobaciones. Las primeras pruebas de ingesta corrigieron el RUT del fixture y otorgaron impersonación exclusivamente de prueba para ejercer el rol técnico, revocada dentro de la misma transacción. En la API completa se observó aviso de timeout al terminar un worker de GEE, con salida 0 y todas las pruebas correctas; la repetición específica de ingesta/GEE completó sin ese aviso.

La migración se aplicó únicamente a PostgreSQL local mediante `supabase migration up --local`, después del replay en base descartable. No se hizo reset, no se crearon lecturas/dispositivos ni se alteraron concesiones empresariales. Los recibos y lecturas de integración pertenecen a `app_test`, no a la base de trabajo. No se habilitó LOGIN del rol técnico en esta etapa.

## Pendientes externos

Empresa/cuartel/dispositivo del piloto, cuenta AWS del certificado, clasificación de temperatura y tolerancia de reloj; credencial de servicio, red hacia PostgreSQL y política de retención/capacidad. Revisión/aprobación del despliegue, regla, destinos de error y permisos antes de activarlos. No se ejecuta publicación real ni se declara el recorrido AWS → PostgreSQL verificado.

## Inventario del incremento

Archivos creados:

- `packages/saphi/src/schemas/iot-ingestion.ts` y su prueba: contrato estricto del transporte.
- `apps/api/src/saphi/integrations/iot/ingest.ts` y `apps/api/src/saphi/iot-ingest/index.ts`: normalización, persistencia y entrada Lambda.
- `apps/api/scripts/iot/{config,publisher,simulator,provision-binding}.mjs` y `config.test.mjs`: herramientas locales explícitas y pruebas sin AWS.
- `apps/api/serverless.iot.yml`: propuesta de pila opcional, deshabilitada inicialmente.
- `supabase/migrations/20261028000700_saphi_iot_ingestion.sql` y `supabase/tests/13_saphi_iot_ingestion.test.sql`: identidad técnica, función mínima, bindings y recibos con sus comprobaciones de privilegios.
- `apps/api/test/saphi/iot-ingestion.test.ts`: integración con base descartable y errores de persistencia.
- `apps/web/src/modules/saphi/components/TelemetryPanel.vue`, `composables/useTelemetryPolling.ts` y `apps/web/test/saphi/telemetry-polling.test.ts`: panel y ciclo de vida de actualización.
- Esta especificación y `docs/saphi/aws-iot-local.md`: operación y límites.

Archivos modificados: `.gitignore`, `apps/api/serverless.yml` (exclusión de certificados), `apps/api/package.json` y `pnpm-lock.yaml` (SDK local fijado y comandos), `apps/api/scripts/bundle-check.mjs` (séptima entrada), `packages/saphi/src/index.ts` (export del contrato), `apps/web/src/modules/saphi/views/TelemetryView.vue` y `locales.ts` (panel/polling/etiquetas), `supabase/tests/07_saphi_structure.test.sql` (inventario de tablas), `specs/saphi/06-integraciones.md` (sección AWS), `specs/saphi/13-fase-6-iot.md` y `docs/saphi/iot-local.md` (referencia a esta extensión). Se conserva el modelo previo y no se cambia autenticación, menú global, concesiones humanas, repositorios de consulta ni dashboard paralelo.
