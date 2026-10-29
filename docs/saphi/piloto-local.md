# Piloto Saphi — registro de preparación y aceptación

Plan: [Fase 11](../../specs/saphi/18-fase-11-piloto.md). Evidencia técnica previa: [Fase 10](../../specs/saphi/17-fase-10-validacion.md). Estado de este registro: **plantilla pendiente de completar por el cliente; ninguna sesión o aceptación registrada**.

## Acuerdo previo

| Campo | Respuesta del cliente |
|---|---|
| Responsable que acepta el piloto | Pendiente |
| Referente agronómico, si se incluyen cálculos posteriores | Pendiente |
| Personas participantes y tareas | Pendiente |
| Empresas/ámbitos elegidos | Pendiente; propuesta inicial: empresas DEMO locales |
| Recorridos incluidos y excluidos | Pendiente; utilizar PIL01–PIL11 del plan |
| Fecha, duración y disponibilidad | Pendiente |
| Escrituras de prueba permitidas: operador, empresa y códigos | Pendiente; comenzar con lectura |
| Módulos que requieren habilitación y operador autorizado | Pendiente; no hay concesión automática |
| Criterios de uso/éxito del cliente | Pendiente |
| Entorno | Propuesta: local, sin AWS/proveedores reales |

Las credenciales de desarrollo y el alcance real de cada cuenta están en la [guía demo](./recorrido-demo.md). No copiar contraseñas o tokens a las evidencias. La [guía del dashboard](./dashboard-local.md) explica sus límites y permisos. El demo territorial no demuestra que todos los módulos posteriores estén habilitados.

## Ejecución

Existe una [ejecución técnica local registrada en Fase 12](../../specs/saphi/19-fase-12-piloto-tecnico.md), realizada por el agente sobre las cuentas demo y limitada a HTTP de consultas, acceso y sesiones. Sus 648 verificaciones no completan las decisiones del cliente ni convierten esta plantilla en un acta aceptada. Los pendientes se reúnen en el [registro de cierre](./pendientes-cierre.md).

Completar una fila por recorrido acordado. No marcar aprobado por existir una prueba automatizada de otro entorno.

| ID de recorrido | Fecha y participante | Empresa y filtros | Esperado | Observado / evidencia | Resultado | Incidencia |
|---|---|---|---|---|---|---|
| Pendiente | — | — | — | — | Sin ejecutar | — |

Resultados permitidos: **aprobado**, **fallido**, **bloqueado**. Para excluir un escenario, registrar el motivo y la decisión del responsable en el acuerdo previo.

## Incidencias

| ID | Recorrido y pasos | Esperado / observado | Severidad | Responsable | Corrección y regresión | Estado |
|---|---|---|---|---|---|---|
| Pendiente | — | — | — | — | — | Sin registro |

Ante fuga empresarial, escalamiento o corrupción, suspender la sesión afectada y preservar evidencia. No editar concesiones o datos directamente en SQL para ocultar una incidencia. Las dependencias aún no acordadas se registran como tales y no como escenarios aprobados.

## Acta de cierre

- Alcance realmente ejecutado: **pendiente**.
- Recorridos aprobados/fallidos/bloqueados: **pendiente**.
- Incidencias críticas o bloqueantes abiertas: **pendiente de evaluar**, no equivale a cero.
- Exclusiones y dependencias reconocidas: **pendiente**.
- Observaciones de las personas participantes: **pendiente**.
- Decisión del responsable del cliente y fecha: **pendiente**.
- Próximo alcance autorizado, si corresponde: **pendiente**.

Esta acta no está aceptada por haber sido creada. Una eventual aprobación del piloto local no autoriza despliegues ni valida fórmulas, fabricantes o licencias que no hayan sido definidos y probados.
