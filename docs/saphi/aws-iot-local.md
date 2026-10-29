# AWS IoT Core: extensión local de Fase 6

Fecha: 2026-10-28. Extiende el registro y las consultas existentes; no sustituye Base Fairplay. AWS IoT Core es el proveedor solicitado. No se encontró un adaptador Azure implementado que retirar.

## Estado y límites

- Implementado: contratos, simulador MQTT5, normalización, handler dedicado, función PostgreSQL, bindings/recibos, consultas existentes y polling Vue opcional.
- Conexión real: TLS y MQTT 3.1.1 comprobados inicialmente; posteriormente el simulador oficial MQTT5 recibió conexión aceptada. Cero publicaciones durante estas comprobaciones.
- Las pruebas de publicación usan un transporte falso; no demuestran autorización del tópico real.
- La migración incremental se aplicó a la base local de trabajo después de las pruebas en base descartable, sin reset ni cambios de datos agrícolas. Pendiente: elegir dispositivo/empresa, cuenta AWS y política de reloj para su binding, provisionar la credencial técnica y desplegar la ingesta. No se publica ni se asigna una empresa automáticamente.
- No se verificó el recorrido AWS → Lambda → base de trabajo. La conexión MQTT por sí sola no demuestra recepción en Saphi.

## Archivos y arquitectura

`simulador → MQTT5/mTLS → AWS IoT → TopicRule → Lambda dedicada → función estrecha → sensor_readings → API autenticada → Vue`.

El [simulador](../../apps/api/scripts/iot/simulator.mjs) usa `aws-iot-device-sdk-v2` 1.28.2, instalado como dependencia de desarrollo. La dependencia nativa está disponible en este equipo; su build automático no se habilitó globalmente. No se importa en Lambda ni en el cliente web.

Los archivos X.509 permanecen en `apps/api/iot`. El [resolutor](../../apps/api/scripts/iot/config.mjs) utiliza `path.resolve` desde su propio módulo, verifica existencia, vigencia y correspondencia certificado/clave sin imprimir su contenido. La CA verifica el servidor. Directorio y claves quedan excluidos de Git/empaquetado. No hay copia de certificados ni llave a Lambda, S3 o Secrets Manager.

## Instalación y comandos

Usar Node.js 24 y el lock del monorepo:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @base/api iot:test
pnpm --filter @base/api iot:simulator
```

El comando lee `apps/api/.env` mediante `process.loadEnvFile`; `API_AWS_IOT` es obligatorio y nunca se incorpora como literal al código. El modo predeterminado **check** conecta y desconecta sin publicar. No arranca con `pnpm dev`.

Para publicar demostraciones de forma explícita, después de acordar el destino:

```powershell
$env:IOT_MODE = 'publish'
$env:IOT_DEVICE_ID = 'sensor-piloto-001'
$env:IOT_CLIENT_ID = 'sensor-piloto-001'
$env:IOT_TOPIC = 'sensores/telemetria'
$env:IOT_INTERVAL_MS = '10000'
$env:IOT_MAX_MESSAGES = '1'
$env:IOT_TEMPERATURE = '19.5'
$env:IOT_SOIL_MOISTURE = '28.4'
pnpm --filter @base/api iot:simulator
Remove-Item Env:IOT_MODE
```

La alternativa configurable de tópico es `sensores/{deviceId}/telemetria`. Solo se publica en uno. Mantener el tópico plano hasta comprobar la política existente; no se modifica esa política. QoS 1, mensajes sin retain, confirmación PUBACK, timeout y reconexión acotada. SIGINT/SIGTERM detienen el cliente y liberan recursos. Una confirmación MQTT no acredita persistencia en PostgreSQL.

## Contrato y semántica

El [contrato compartido](../../packages/saphi/src/schemas/iot-ingestion.ts) acepta versión 1, UUID de mensaje, ID externo, fecha con zona, fuente `simulator|device` y una o ambas mediciones: `temperature` en `C`, `soilMoisture` en `%`. Rechaza campos desconocidos, unidades distintas, fechas inválidas y números no finitos. No acepta `companyId`.

`temperature` se persiste según el binding como `air_temperature`, `soil_temperature` o `temperature.unspecified`. El último significa **tipo no definido**, no temperatura del suelo inferida. No se generan profundidades, conversiones, umbrales agronómicos ni estados de conexión. El porcentaje del mensaje es una magnitud declarada por el origen; no acredita calibración o método de humedad volumétrica.

El simulador etiqueta `source=simulator` y las lecturas llevan `quality_code=demo.simulator`; Vue las muestra como DEMO. La etiqueta source es una declaración del publicador, no una certificación física. No reutilizar el certificado del piloto como prueba de un sensor productivo.

## Vinculación y base de datos

La [migración nueva](../../supabase/migrations/20261028000700_saphi_iot_ingestion.sql) agrega únicamente bindings y recibos; reutiliza `devices` y `sensor_readings`. El rol `saphi_ingest` se crea NOLOGIN, sin SUPERUSER/BYPASSRLS. Solo recibe USAGE de esquema y EXECUTE de `saphi.ingest_iot`; no SELECT/INSERT directo de tablas. LOGIN/contraseña se provisionan por un administrador en el entorno elegido. No se conceden escrituras a `app_api` o `app_auth`.

La función SECURITY DEFINER, con `search_path` vacío, resuelve cuenta/certificado/cliente/ID externo/tópico contra un binding activo y comprueba dispositivo/empresa activos, proveedor `aws.iot` y FK empresarial. Bloquea las filas durante la transacción. La empresa y el cuartel proceden de registros existentes. El destino del binding es inmutable; sus actualizaciones incrementan versión y usan la auditoría existente. No hay endpoint público de administración de bindings.

El [provisionador local](../../apps/api/scripts/iot/provision-binding.mjs) exige `--local-iot`, `--device`, `--company`, `--account`, `--temperature-kind` (`air|soil|unspecified`), `--max-past-seconds` y `--max-future-seconds`. Utiliza `IOT_ADMIN_DATABASE_URL` exclusivamente contra localhost:54322 y rechaza producción. No crea dispositivos ni perfiles: estos deben existir mediante las APIs autorizadas. La identidad de certificado se obtiene del nombre local del certificado validado. Los valores de empresa, cuenta y reloj deben acordarse antes de ejecutarlo; no se entrega un comando con IDs inventados.

Cada mensaje completo es atómico: recibo + hasta dos lecturas. Clave de recibo `(binding_id,messageId)` y unicidad existente de lecturas. Hash SHA-256 canónico de los campos de contenido, excluyendo recepción/reintentos. Repetición idéntica devuelve duplicate; mismo ID con contenido diferente rechaza sin sobrescribir. El bloqueo y ON CONFLICT permiten entregas concurrentes. Un fallo revierte recibo y lecturas.

La tolerancia de fechas se configura por binding. Se compara con reloj de base, no con la fecha declarada por el publicador. La recepción del broker no puede adelantarse más de cinco minutos al reloj del servidor (límite técnico de consistencia, no regla agrícola). No hay purga automática ni retención aprobada.

## API y frontend

Se conservan `/api/saphi/companies/{companyId}/telemetry/readings` y `/latest`, permisos `saphi.telemetry:view` + `saphi.devices:view`, membresía, RLS y cursores. El router interno no duplica `/api`. No se crea `/api/telemetria` ni una ingesta humana HTTP.

La [vista existente](../../apps/web/src/modules/saphi/views/TelemetryView.vue) incorpora filtro de cuartel con opciones paginadas, un [panel](../../apps/web/src/modules/saphi/components/TelemetryPanel.vue) y [polling](../../apps/web/src/modules/saphi/composables/useTelemetryPolling.ts) REST opcional solo para últimos valores: 5–3600 segundos, predeterminado 30, desactivado al entrar y al cambiar empresa/capacidades. El filtro de cuartel requiere `saphi.plots:view`, limita opciones de dispositivos y limpia lecturas anteriores; no se añade ese permiso a usuarios automáticamente. Consultas secuenciales, sin solapamiento, pausa en pestañas ocultas y parada al desmontar. No hay MQTT/WebSocket en navegador ni cambios al dashboard visual paralelo. El historial mantiene sus filtros y paginación anteriores.

## Propuesta AWS, despliegue y reversión

[serverless.iot.yml](../../apps/api/serverless.iot.yml) es una pila separada, **no desplegada**. Declara Node24/arm64, Lambda sin API Gateway/Cognito, regla inicialmente deshabilitada y permiso de invocación restringido por `SourceArn` y `SourceAccount`.

La regla crea `{payload,broker}` usando `principal()`, `accountid()`, `clientid()`, `topic()` y `timestamp()`. El contexto broker no procede del JSON del dispositivo. La identidad de origen depende también de IAM: no otorgar InvokeFunction a publicadores o roles ajenos; un JSON con broker falso no es prueba de invocación confiable. [Funciones oficiales](https://docs.aws.amazon.com/iot/latest/developerguide/iot-sql-functions.html).

Parámetros requeridos: `dbHost`, `dbPort`, `dbName`, `iotDbSecretArn`, `failureDestinationArn` (SNS), `ruleName`, `telemetryTopic`, `ruleErrorQueueUrl`, `ruleErrorRoleArn`, `maximumRetryAttempts` y `maximumEventAgeInSeconds`. El secreto DB debe usar username `saphi_ingest` y CA cuando corresponda. Confirmar red, TLS y permisos KMS si los secretos/destinos usan claves propias. PostgreSQL local no es accesible automáticamente desde Lambda; definir un destino alcanzable antes de desplegar. Si la BD es privada, revisar VPC, subredes, security groups, endpoints y permisos de red; esta propuesta no los crea.

El destino de errores de regla es una cola restringida ya autorizada; errores asíncronos de Lambda utilizan SNS DLQ. Los eventos inválidos se rechazan de forma permanente con estado técnico y sin volcar payload en logs; fallos de persistencia lanzan error genérico para reintento. Reintentos, edad máxima, acceso a DLQ, cifrado y retención deben aprobarse antes de activar. Receipts persisten identidad de mensajes aceptados; no constituyen un inbox de todos los eventos rechazados.

Después de aprobación cloud y revisión de parámetros reales: ejecutar desde `apps/api` `pnpm exec serverless deploy --config serverless.iot.yml --stage dev` con parámetros definidos por el entorno aprobado. Validar SQL de regla, IAM, secreto, red y métricas; crear el binding aprobado; habilitar la regla mediante cambio revisado; publicar un único mensaje demo y verificar recibo, dos lecturas, consulta REST y ausencia de duplicados. No se ha ejecutado este procedimiento.

Reversión: detener simulador, deshabilitar regla, esperar/drenar invocaciones pendientes, revocar acceso de la función al secreto y desactivar binding según procedimiento autorizado. Conservar recibos/lecturas para auditoría. No borrar tablas o históricos para revertir código. Eliminar la pila requiere autorización y revisión de retención de destinos. Costos potenciales: conexiones/mensajes IoT, reglas, Lambda, Secrets Manager, SNS/SQS, logs y red/BD; ninguno se provisionó durante esta implementación.

## Pruebas

Simulador: `pnpm --filter @base/api iot:test`. Contratos: `pnpm --filter @base/saphi test`. API: `pnpm --filter @base/api test`, que reconstruye solo `app_test`; pgTAP incluye el archivo 13. Frontend: suites IoT y polling, luego regresión del paquete. Tipos, build y siete bundles (incluida ingesta). Los resultados ejecutados se registran en la [retoma de Fase 6](../../specs/saphi/21-fase-6-aws-iot.md).
