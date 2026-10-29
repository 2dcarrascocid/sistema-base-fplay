# Fase 6 local — dispositivos y telemetría

Actualización AWS: simulador MQTT5, ingesta y políticas de persistencia se detallan en la [guía AWS IoT](./aws-iot-local.md). La migración está aplicada localmente, pero no hay binding operativo ni recepción cloud desplegada. El alcance histórico de consulta descrito a continuación se conserva.

Este incremento permite registrar dispositivos y consultar lecturas persistidas. **La recepción externa no está habilitada.** No hay sensor conectado por el hecho de registrar sus metadatos. No se crean cuentas de proveedor, credenciales, bindings ni mediciones ficticias en la base de desarrollo.

## Permisos y acceso

Los permisos globales de Base Fairplay siguen siendo el techo, combinado con las concesiones explícitas de cada empresa:

| Operación | Permisos efectivos |
| --- | --- |
| Ver dispositivos | `saphi.devices:view` |
| Registrar | `saphi.devices:view/create` y `saphi.plots:view` |
| Editar estado/metadatos | `saphi.devices:view/edit` |
| Consultar lecturas | `saphi.telemetry:view` y `saphi.devices:view` |

Las cuentas/empresas demo de Fase 4 conservaron sus concesiones originales. La migración no las amplía ni asigna permisos al superusuario. Si no aparece IoT, revisar tanto el perfil global como el alcance empresarial.

Para ensayar con una empresa nueva, el operador de plataforma habilita primero el techo global IoT del destinatario desde los perfiles existentes. El superusuario crea una empresa y selecciona otra persona gestora activa, con sus permisos iniciales explícitos de empresa, administración, territorio y módulos IoT requeridos. Esa gestora puede asignar a otros miembros únicamente capacidades que ya tiene, dentro del techo global de cada destinatario.

**Empresas existentes sin ningún gestor con concesiones IoT:** el CRUD restrictivo actual no permite que alguien se autoconceda capacidades nuevas ni otorgue lo que no posee. La habilitación de un módulo adicional para esas empresas necesita un procedimiento de administración de plataforma aprobado (Q02/Q03); no se incorpora un bypass o una elevación automática como efecto de esta fase. Se pueden probar los módulos con una empresa creada con las concesiones iniciales necesarias. Los ensayos automatizados usan empresas descartables y no alteran los perfiles demo.

## Dispositivos

1. Seleccionar empresa y abrir **Dispositivos** desde su detalle o menú contextual.
2. Registrar código único por empresa, cuartel visible, código informativo de proveedor e ID externo. El ID externo se conserva exactamente; no se normaliza ni se considera una identidad autenticada.
3. Opcionalmente informar fabricante, modelo y número de serie (hasta 100 caracteres cada uno). No ingresar contraseñas, tokens, certificados o claves. El esquema rechaza campos arbitrarios.
4. El estado activo/inactivo solo describe el registro administrativo. No implica conexión, disponibilidad, calidad o salud del sensor.
5. Editar únicamente estado/metadatos. La identidad, proveedor, ID externo, empresa y cuartel permanecen fijos. La edición sustituye el objeto de metadatos; dejar campos vacíos permite eliminarlos. Se exige la versión leída: ante conflicto recargar antes de reintentar. Sin borrado físico ni reasignaciones.

## Consultas

1. Abrir **Telemetría** y seleccionar un dispositivo autorizado. **Cargar más opciones** amplía el selector si hay más de 100.
2. Elegir **Histórico**: período obligatorio ISO con zona explícita, Desde incluido y Hasta excluido, máximo 31 días; propuesta inicial de 24 horas. Magnitud opcional por código de origen. Aplicar filtros y **Siguiente** para más páginas.
3. Elegir **Últimos valores**: última lectura por magnitud según fecha observada y desempate estable por ID, no según recepción. Se permite consultar históricos de registros inactivos. Con más de 100 magnitudes distintas es obligatorio filtrar una; se rechaza la consulta amplia, sin truncar resultados silenciosamente.
4. Valores como cadenas decimales, con unidad, fecha observada/recibida y calidad de origen. No se convierten unidades, redondean valores por agronomía, califican umbrales ni deduce conectividad. Un resultado vacío no significa cero, desconexión ni fallo.

## Qué falta para recibir mediciones reales

- Fabricante/plataforma, cuenta y protocolo admitido (webhook, MQTT, plataforma externa, etc.).
- Muestra anonimizada de payload, identificación estable del mensaje y del índice de cada lectura.
- Autenticación del emisor, rotación/revocación y resolución de `(cuenta del proveedor,ID externo)` a una empresa/dispositivo interno.
- Catálogo validado de magnitudes/unidades, precisión, códigos de calidad y tolerancia del reloj.
- Frecuencia, número de dispositivos/magnitudes, latencia, retención y presupuesto.
- Aprobación del principal técnico de servicio, función estrecha de escritura y, si se requiere, recibos/cola/reintentos. No se simula una aceptación HTTP202 sin persistencia durable.

No hay POST de telemetría ni permisos de INSERT/UPDATE/DELETE de lecturas para usuarios humanos. El hash y la unicidad de mensajes en SQL son condiciones estructurales de almacenamiento; no sustituyen la autenticación ni un protocolo completo de deduplicación/reintentos. Los adaptadores siguen siendo puertos pendientes de implementación.

Fase 5 mantiene su dependencia separada de catálogo de análisis. No se inicia Fase 7 ni se despliega AWS.
