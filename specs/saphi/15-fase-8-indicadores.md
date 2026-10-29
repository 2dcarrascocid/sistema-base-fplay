# Saphi Chile — Fase 8: indicadores

Fecha: 2026-10-28. Inicio de fase autorizado por el usuario tras aprobar el incremento de Fase 7. **Estado: definición de cálculos pendiente del cliente; implementación funcional no iniciada.** La aprobación de avance no resuelve por sí sola Q08 ni selecciona fuentes de datos pendientes.

## Alcance y dependencia

La solicitud original establece: «Fase 8 — Indicadores: Implementar cálculos validados por el cliente». También prohíbe inventar fórmulas agronómicas y considerar aprobadas decisiones pendientes. La revisión de las especificaciones y del código no identifica estrategias de cálculo validadas. Se solicitó al cliente su definición antes de implementar el motor o resultados.

Se conserva la propuesta de [modelo de datos](./02-modelo-datos.md), [contrato API23](./04-api.md) y [ruta Vue](./05-frontend.md). Estos contratos son una base de diseño, no evidencia de cálculos implementados o aprobados. La integración satelital real continúa pendiente según [Fase 7](./14-fase-7-satelital.md); la ingesta IoT y el catálogo de análisis mantienen sus dependencias propias.

## Ficha requerida por indicador

| Campo | Definición requerida |
|---|---|
| Identidad | Código, nombre, propósito y versión de la fórmula |
| Validación | Responsable del cliente que aprueba y referencia de aprobación |
| Cálculo | Fórmula completa, orden de operaciones y ejemplos con resultados esperados |
| Entradas | Variables, unidades, origen, calidad admisible y precisión |
| Ámbito temporal | Período, zona horaria, agregación, ponderación y frecuencia |
| Casos límite | Ausencias, ceros, división por cero, duplicados, datos tardíos o corregidos |
| Resultado | Unidad, precisión, redondeo y dominio válido |
| Interpretación | Umbrales y clasificación únicamente si están aprobados; pueden excluirse |

La validación de una fórmula no autoriza un proveedor, licencia, importación ni credenciales. Si una entrada depende de una integración pendiente, debe resolverse esa dependencia antes de ejecutar cálculos con datos reales.

## Recomendaciones técnicas para la implementación autorizada

- Estrategias explícitas, puras y versionadas; sin ejecución de expresiones arbitrarias enviadas por usuarios.
- Conservar precisión decimal según la ficha aprobada; no elegir redondeo o conversiones de unidades por inferencia.
- Resultados trazables por empresa, cuartel, versión, período e identificación de entradas. El fingerprint se especificará con la estrategia para permitir reproducibilidad y evitar duplicados.
- Contexto empresarial transaccional, claves foráneas compuestas y RLS. `saphi.indicators:view` efectivo requiere techo global y concesión empresarial; también verificar permisos sobre fuentes al consultar o calcular para evitar exponer datos derivados de orígenes restringidos.
- Mantener separados `pending_definition`, ausencia de entradas y resultado calculado igual a cero. Ningún valor, umbral ni estado de salud sintético.
- API23 de consulta paginada y vista de indicadores se concretarán junto con la primera estrategia aprobada. No agregar endpoints de administración de fórmulas o ejecución remota por anticipado.
- No ampliar automáticamente permisos de empresas demo ni introducir bypass de superusuario.

Estas recomendaciones no equivalen a aprobación agronómica. El mecanismo de ejecución, persistencia y eventual recálculo se concretará según frecuencia y volumen acordados; no se crea infraestructura por adelantado.

## Pruebas y aceptación al implementar

1. Pruebas unitarias con ejemplos de referencia aprobados y casos límite de cada estrategia.
2. Pruebas de procedencia, versionado, duplicados y correcciones de entradas conforme a la ficha.
3. Pruebas API y pgTAP de aislamiento A/B, concesiones diferenciadas y permisos de fuentes; no revelar existencia de recursos ajenos.
4. Pruebas de interfaz para estados pendientes, ausencia de datos, cero real, errores y cambios de empresa.
5. Regresión de autenticación, permisos y módulos anteriores; conservar umbrales de cobertura existentes y verificar compilación y tipos.

## Resultado de esta revisión

Se documentó la dependencia y se solicitó la definición del cliente. No se modificaron código, migraciones, permisos, dependencias ni infraestructura como parte de este inicio de Fase 8. No se ejecutaron pruebas funcionales: todavía no existe una implementación nueva que validar. La fase no se declara terminada y no se inicia Fase 9.
