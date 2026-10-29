# Fase 5 local — muestras e histórico

Desde Saphi, seleccionar empresa y abrir **Muestras e histórico** en el detalle empresarial, o **Muestreo** en el menú. **Puntos de muestreo** sigue disponible dentro de la pantalla y desde el detalle empresarial.

## Registrar y consultar

1. Se necesitan `saphi.samples:view/create` y `saphi.plots:view` tanto globalmente como en la empresa. Las cuentas demo gestora, superusuario y operador en Maule ya tienen esas concesiones; consulta y operador en Colchagua solo pueden leer.
2. Pulsar **Registrar muestra**. Ingresar código único por empresa y elegir cuartel. Se cargan los puntos del cuartel seleccionado; el punto es opcional. Las listas tienen **Cargar más opciones** si superan 100 registros.
3. Ingresar el instante de toma con zona horaria explícita, por ejemplo `2026-10-27T12:00:00-03:00`. Se normaliza a `2026-10-27T15:00:00.000Z`. La precisión pública máxima es milisegundos (hasta tres decimales); mayor precisión se rechaza y no se redondea silenciosamente. Notas opcionales hasta 2000 caracteres.
4. El registro es inmutable: no hay edición ni eliminación. Revisar los datos antes de guardar. No se ha diseñado aún un mecanismo de anulación/corrección de muestras.
5. Consultar el listado y **Ver detalle**. La fecha de toma es independiente de la fecha de registro y determina el orden del histórico. Desde/Hasta son obligatorios sobre la fecha de toma: Desde incluido y Hasta excluido (`[Desde,Hasta)`, Desde<Hasta). La pantalla propone los últimos 30 días; se puede ampliar el período para consultar otras fechas. El filtro de cuartel utiliza su UUID, visible en el detalle de las muestras.
6. Pulsar **Aplicar filtros** para iniciar una consulta nueva y **Siguiente** para cargar más registros. Los cursores expiran a los 15 minutos y no se reutilizan con otros filtros o usuarios; aplicar filtros de nuevo si expiran.

Los datos demo de Fase 4 se conservan. No se han cargado muestras o resultados nuevos de laboratorio automáticamente. Al ensayar sobre empresas DEMO, usar códigos y notas que indiquen expresamente su carácter ficticio.

## Análisis: dependencia pendiente

La pantalla **Laboratorio**, accesible con `saphi.laboratory:view`, declara definición pendiente. No representa un laboratorio sin resultados: el registro de análisis todavía no está habilitado. Las cuentas demo anteriores solo recibieron permisos de módulos implementados en Fase 4; no se amplían automáticamente sus concesiones de laboratorio.

Para habilitar API14–15 y sus históricos se necesita, para cada tipo fisicoquímico y microbiológico:

- Parámetro: código estable, nombre y tipo de resultado (numérico, cualitativo, no detectado, etc.).
- Unidades admitidas, precisión y cómo representar límites de detección/cuantificación.
- Método, referencia/versionado, laboratorio y procedencia requeridos.
- Reglas para correcciones, repetición de análisis y vínculo con el original.
- Responsable del cliente que valida ese catálogo. Rangos de interpretación y fórmulas son decisiones adicionales, nunca valores implícitos.

No se crean catálogos, umbrales, conversiones ni resultados por suposición. No se implementan integraciones reales ni se avanza a Fase 6.
