# Saphi Chile — 06. Integraciones

Estado: **PROPUESTA DE FASE 1 — pendiente de aprobación**. Sin adaptadores reales, instalaciones, recursos nuevos ni despliegues. AWS y PostgreSQL nativo son decisiones aprobadas; fabricantes, protocolos, servicios de ingesta y fórmulas siguen pendientes.

Referencias: [arquitectura](./01-arquitectura.md), [datos](./02-modelo-datos.md), [seguridad](./03-seguridad.md), [API](./04-api.md).

## AWS IoT Core — Integración de telemetría

Actualización autorizada el 2026-10-28: se selecciona AWS IoT Core para extender Fase 6. El diseño histórico siguiente se conserva como contexto; su implementación concreta, contrato, identidad X.509, regla, rol de ingesta, persistencia, API, frontend, pruebas, costos y procedimientos están en la [retoma de Fase 6](./21-fase-6-aws-iot.md) y la [guía operativa AWS IoT](../../docs/saphi/aws-iot-local.md). El simulador oficial MQTT5 comprobó conexión real sin publicar; recursos cloud propuestos no desplegados y flujo hasta PostgreSQL aún no comprobado en AWS. No se consideran resueltas las decisiones agronómicas o productivas pendientes.

## Arquitectura IoT independiente del proveedor

Flujo lógico futuro: transporte autenticado → identidad de cuenta/proveedor → identidad de dispositivo → validación de envelope → normalización → deduplicación → transacción empresarial → almacenamiento → recibo y observabilidad. El selector de empresa del payload nunca establece la autoridad. Resolver `(providerAccountId, externalDeviceId)` en un registro de vinculación controlado; el resultado fija dispositivo/empresa y se contrasta con payload si lo incluye.

Separar puertos de transporte, verificación de identidad, normalización y escritura. Una interfaz `validateDevice(externalDeviceId):boolean` no basta para autorizar: pierde cuenta de proveedor, empresa, revocación y origen autenticado. Diseño documental de contratos:

```typescript
// Contratos propuestos, no código implementado.
type DeviceBinding = {
  deviceId: string;
  companyId: string;
  providerAccountId: string;
  bindingVersion: number;
};
interface TelemetryProvider {
  authenticate(envelope: unknown): Promise<VerifiedProviderIdentity>;
  resolveDevice(identity: VerifiedProviderIdentity, externalDeviceId: string): Promise<DeviceBinding>;
  normalizeMeasurement(payload: unknown, binding: DeviceBinding): Promise<NormalizedMeasurement[]>;
}
```

`VerifiedProviderIdentity` es resultado interno del adaptador verificado, no DTO que el cliente pueda enviar como prueba; incluye cuenta, método y referencia de verificación, sin secretos serializables. `bindingVersion` evita procesar con una vinculación revocada o alterada entre aceptación y persistencia. En implementación el puerto puede separar esas operaciones sin alterar estas responsabilidades.

## Contrato de telemetría normalizada

| Campo | Regla propuesta |
|---|---|
| schemaVersion | Literal versionado inicialmente `1`; rechazar versiones desconocidas |
| providerCode / providerAccountId | Identidad de origen verificada; no confiar en texto libre del mensaje |
| externalDeviceId | ID externo dentro de cuenta autorizada, sin normalización destructiva |
| deviceId / companyId | Derivados de binding interno; nunca asignados por la carga |
| sourceMessageId | Identidad estable de origen; necesaria para deduplicación |
| sampleIndex | Entero ≥0 estable por lectura dentro del mensaje |
| metricCode | Código de catálogo aprobado para dispositivo/magnitud |
| value / unitCode | Decimal finito como cadena y unidad explícita aprobada; sin conversión implícita |
| observedAt / receivedAt | RFC3339; primero de origen, segundo del servidor; no sustituir silenciosamente uno por otro |
| qualityCode / sourceMetadata | Opcionales y acotados por esquema; conservar bandera de calidad sin inventar rangos |
| payloadHash / bindingVersion | Internos, calculados/verificados en servidor; no prueba de autenticidad por sí solos |

Faltan catálogo, precisión, frecuencia y tolerancia de reloj. Si observedAt es inválido, rechazar o enviar a cuarentena según política aprobada; no fabricar fecha de medición. Lecturas fuera de orden se almacenan con tiempo original; la última por magnitud se consulta por observedAt. Identidad igual y contenido distinto se rechaza como conflicto. Probar payload canónico y orden estable; no deduplicar solo con valor+fecha.

Las claves/certificados residen en el mecanismo de secretos del proveedor y Secrets Manager cuando corresponda, nunca en metadata de dispositivo, contrato compartido o web. Rotación, revocación y acceso mínimo requieren diseño por proveedor. Tras revocar dispositivo, nuevos mensajes deben denegarse; mensajes ya aceptados requieren política de reproceso explícita y revalidación antes de escribir.

## Transporte y procesamiento asíncrono: opciones por aprobar

| Alternativa | Ventaja potencial | Dependencia / riesgo |
|---|---|---|
| Webhook de proveedor | Aprovecha envío HTTP existente | Firma/mTLS/credenciales, replay, IPs, tamaño y política de origen propia |
| AWS IoT Core | Canal orientado a dispositivos y políticas de identidad | Compatibilidad MQTT/certificados, flota, operación y costos |
| Adaptador de plataforma externa | Traduce proveedor ya contratado | Contrato de servicio, egress, autenticación y disponibilidad |

No introducir Azure IoT Hub. Si existe dependencia contractual Azure, documentar comparación y decisión explícita. Mantener la Lambda Saphi agrupada para negocio; colas/funciones de ingesta adicionales solo si volumen/latencia lo justifican y el responsable autoriza infraestructura. No desactivar `X-Origin-Verify` global para recibir webhooks externos.

Modelo recomendado si se aprueba asíncrono: aceptación durable del lote y recibo → cola → consumidor idempotente → transacción PostgreSQL → ack.202 solo después de persistencia durable, no tras normalizar en memoria. Reintentos con backoff acotado/jitter, máximo de intentos y DLQ definidos por SLA pendiente; no fijar números sin frecuencia/latencia. Duplicados son esperables. El consumidor confirma mensaje después del commit; crash antes del ack genera reproceso deduplicado. Para evitar perder eventos entre BD y cola, evaluar outbox/inbox transaccional; no afirmar exactly-once.

R12: futura tabla `ingestion_receipts`/inbox con identidad de lote, hash, binding y estado, si se adopta este flujo. Requiere revisión del modelo y migración independiente; no está creada ni aprobada. Reprocesamiento conserva identidad y auditoría, requiere operador autorizado y ámbito empresarial. Mensajes inválidos no entran en una cadena infinita de reintentos.

El consumidor no suplanta un usuario de `app.users` ni desactiva RLS. Antes de implementarlo se debe aprobar un principal de servicio, rol BD técnico mínimo y función de escritura estrecha que resuelva vínculo empresarial. La autorización de nuevos roles técnicos queda pendiente; no confundirla con autorización de crear roles de negocio. Sin ese contrato no se habilita ingesta productiva.

## Satélite y objetos

Puerto `SatelliteProvider`: descubrir observaciones por geometría/período autorizado, obtener metadatos/licencia y referencias de activos, recuperar activos mediante transporte aprobado. Dominio no importa SDK Sentinel ni presupone una fuente. Cada observación guarda proveedor, ID de origen, adquisición, cobertura/calidad entregada, versión de producto, índices de origen y procedencia. Los índices NDVI/NDWI no se calculan sin fórmula, tratamiento de bandas y datos faltantes aprobados.

R13: archivos agrícolas en almacenamiento de objetos separado lógicamente de fotos/branding. Prefixes empresariales ayudan a operar pero no autorizan por sí solos; una relación validada en BD conecta empresa/observación/assetId/objeto. API entrega URL firmada solo tras autorización contextual y TTL acotado por definir. No aceptar bucket/key ni URL externa arbitraria del usuario. Importación desde terceros con allowlist de proveedor, límites de tamaño y protección SSRF antes de abrir conexiones.

Tipos permitidos, tamaño, retención, cifrado, política de acceso, cuotas, costos y licencia quedan pendientes. No servir HTML/SVG activo como imagen satelital sin política de descarga segura. No cargar archivos masivos a la Lambda síncrona de 10s; evaluar flujo de objetos/trabajos con estado. Un archivo recibido no es automáticamente un activo validado: estados técnicos candidatos `received|validated|rejected|available`, sin etiquetar como disponible antes de completar validación.

## Observabilidad y preguntas del cliente

Métricas futuras por ámbito autorizado: aceptados, duplicados, conflictos, inválidos, retraso observed/received, backlog, fallos, reintentos, objetos y costo. Logs con receiptId/requestId y referencias opacas; no payload/secretos. Auditoría de acciones administrativas y lotes relevantes, sin saturar la cadena global con cada lectura. No definir conectividad saludable ni alerta agronómica a partir de umbrales inventados.

Q05: fabricante/modelo, muestras reales anonimizadas, protocolo, cuenta, autenticación, identidad de mensaje, frecuencia, cantidad de magnitudes, reloj y entrega. Q06: retención, latencia, disponibilidad, crecimiento y presupuesto. Q07: fuente satelital, licencia, frecuencia, resolución, nubes y necesidad de cálculos. Q08: catálogos/unidades y quién valida resultados. Q09: almacenamiento de archivos y políticas de datos. Las respuestas condicionan adaptadores, esquema de ingesta y recursos, no la validez del esqueleto de dominio aislado.
