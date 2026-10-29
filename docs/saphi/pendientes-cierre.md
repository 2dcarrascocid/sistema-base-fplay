# Saphi — registro único de pendientes para el cierre

Actualizado: 2026-10-28. El usuario indicó resolver los pendientes al final. **Todos los elementos siguientes quedan diferidos; ninguno se considera aprobado por esa instrucción.** No bloquean el piloto técnico local de consultas ya ejecutado; sí limitan la aceptación de las funcionalidades que dependen de ellos.

| ID | Decisión a completar al cierre | Evidencia necesaria | Alcance dependiente |
|---|---|---|---|
| C01 | Responsable, participantes, fecha y recorridos del piloto de usuarios | Acuerdo y acta del cliente | Aceptación de uso, distinta de ejecución técnica |
| C02 / Q02–Q03 | Procedimiento autorizado de habilitación y recuperación de empresas | Operadores, límites, auditoría y pruebas de concesión/recuperación | Módulos nuevos en empresas existentes sin gestor habilitado |
| C03 / Q08 | Catálogo de análisis y unidades/métodos/precisión | Catálogo versionado y ejemplos validados | Análisis de laboratorio |
| C04 / Q08 | Indicadores y fórmulas | Variables/unidades/fuentes, período, faltantes, redondeo, versión y resultados esperados aprobados | Cálculos agrícolas de Fase 8 |
| C05 / Q05 | Fabricante, protocolo y autenticación IoT | Payloads, identidad/bindings, mensajes y pruebas del proveedor | Recepción externa real |
| C06 / Q06 | Volumen, crecimiento, retención, cuotas, SLA y presupuesto | Criterios medibles de capacidad/operación aceptados | Dimensionamiento, carga, colas y aceptación productiva |
| C07 / Q07 | Fuente, producto, licencia e índices satelitales | Condiciones de uso/atribución, datos de referencia e índices/fórmulas aprobados | Importación e indicadores satelitales |
| C08 / Q09 | Archivos, formatos, tamaño, conservación y acceso | Política de almacenamiento, límites, TTL y pruebas de autorización/contenido | Descarga/importación de activos |
| C09 / Q04 | Alcance GIS y PostGIS | Funciones espaciales requeridas, entorno y decisión de adopción | Polígonos, topología y capacidades espaciales avanzadas |
| C10 | Entorno AWS, acceso, respaldo/restauración y autorización de despliegue | Plan concreto, responsables, presupuesto y verificaciones de operación/seguridad | Piloto externo o producción |
| C11 | Escrituras de usuarios durante el piloto | Cuenta, empresa, códigos ficticios, tareas y registro de cambios acordados | Recorridos PIL07/PIL08 pendientes de sesión de usuarios |

Responsables nominales, fechas y respuestas: **por completar al cierre con el cliente**. No se asignan personas o plazos ficticios.

## Evidencia ya disponible

- [Fase 10](../../specs/saphi/17-fase-10-validacion.md): validación automatizada local y recorrido manual, con limitaciones explícitas.
- [Fase 11](../../specs/saphi/18-fase-11-piloto.md): plan y criterios propuestos de piloto.
- [Fase 12](../../specs/saphi/19-fase-12-piloto-tecnico.md): ejecución HTTP contra API/base locales con cuatro cuentas demo y 648 verificaciones.
- [Acta de preparación/aceptación](./piloto-local.md): campos de decisión del cliente, todavía sin aceptación registrada.

## Regla de cierre

Resolver o excluir explícitamente cada dependencia dentro del alcance que el cliente quiera aceptar. Una exclusión debe quedar visible en el acta y en la interfaz afectada. No presentar simuladores como proveedores reales, un resultado pendiente como cero ni una prueba técnica como aceptación agronómica o productiva. Las decisiones de despliegue y cambios de permisos siguen siendo acciones concretas separadas.
