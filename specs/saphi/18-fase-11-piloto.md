# Saphi Chile — Fase 11: preparación del piloto

Fecha: 2026-10-28. El usuario aprobó Fase 10 y seleccionó **Preparar piloto**: definir alcance, criterios de aceptación y pendientes, sin desplegar. **Entregable documental preparado para revisión del cliente; no declara ejecutado ni aceptado el piloto.**

## Base de partida

La [validación de Fase 10](./17-fase-10-validacion.md) registró 411 pruebas automatizadas y 263 comprobaciones pgTAP aprobadas, tipos/builds correctos y un recorrido local con autenticación simulada. Esa evidencia es la línea base técnica; no reemplaza aceptación de usuarios ni pruebas de AWS, fabricantes, satélite o reglas agrícolas. No se repiten suites por cambios exclusivamente documentales.

### Decisiones confirmadas

- Preparar el piloto sobre Base Fairplay y su extensión Saphi actual.
- Mantener aislamiento empresarial, permisos globales y concesiones contextuales, sesiones/MFA y auditoría existentes.
- Preparar el plan sin desplegar, instalar herramientas o crear recursos con costo.
- Conservar pendientes las fórmulas, fuentes y políticas aún no definidas.

Los recorridos, orden y condiciones de aceptación siguientes son **recomendaciones técnicas para acordar el piloto**. La selección del cliente no asigna participantes, fechas, presupuesto ni reglas agronómicas por inferencia.

## Alcance propuesto y puertas de entrada

Se propone comenzar con un **piloto local de usuarios sobre maestros territoriales**, con empresas y personas ficticias ya identificadas como DEMO. No usar información sensible de productores reales en esta etapa.

| Bloque | Alcance disponible | Condición para sesión de usuarios |
|---|---|---|
| Plataforma | Acceso, MFA local, selector y sesión | Participantes informados de que identidad/correo/objetos son simuladores |
| Empresa/territorio | Empresas, miembros, predios, cuarteles y puntos | Cuentas y concesiones existentes revisadas; usar lectura primero |
| Muestras | Registro inmutable e histórico | Seleccionar operador, empresa, códigos ficticios y fecha de toma; acordar escritura antes de ejecutarla |
| Dispositivos | Registro descriptivo y estado versionado | Concesiones explícitas de dispositivos/cuarteles; no implica conexión física |
| Telemetría | Consulta de lecturas almacenadas | Datos de prueba identificados y permisos de dispositivos/telemetría; no hay receptor externo |
| Satélite | Catálogo de metadatos | Permisos de satélite/cuarteles; importación y descarga siguen cerradas |
| Dashboard | Resumen con permisos por fuente | `saphi.dashboard:view` global y contextual; el demo actual no lo concede automáticamente |
| Análisis e indicadores | Estados de definición pendiente | No se aceptan resultados calculados hasta resolver Q08 |

**Límite operativo actual:** las cuentas demo tienen concesiones territoriales de Fase 4. No se promete una sesión positiva de todos los módulos con ellas. Las pruebas positivas de módulos posteriores ya se ejecutaron con fixtures aislados; no se presentarán como resultados de usuarios sobre la base demo.

Para ampliar el piloto a esos módulos, acordar antes el procedimiento Q02/Q03 de habilitación de empresas existentes o un bootstrap autorizado de una nueva empresa con un gestor que tenga el techo global necesario. No editar directamente permisos en SQL, elevar el rol global o eludir RLS para completar el recorrido.

## Participantes y responsabilidades por confirmar

| Responsabilidad propuesta | Decisión o trabajo |
|---|---|
| Responsable del cliente | Aprobar alcance, participantes y aceptación de uso |
| Referente agronómico del cliente | Validar catálogos, unidades, fórmulas y ejemplos de referencia |
| Operador de plataforma autorizado | Revisar cuentas, membresías, techo global y concesiones; ejecutar altas acordadas |
| Participantes funcionales | Probar los recorridos y registrar resultados observados |
| Responsable técnico | Preparar evidencia, reproducir incidencias y verificar correcciones |

Estos son roles del proceso, no nuevos roles o perfiles implementados en Base Fairplay. Nombres, disponibilidad, cantidad de usuarios, fecha y duración del piloto requieren respuesta del cliente.

## Protocolo propuesto

### Antes de la sesión

1. Aprobar alcance y personas en el [registro de preparación](../../docs/saphi/piloto-local.md).
2. Confirmar que el entorno es local y contiene datos DEMO. Revisar el inventario antes de la sesión; no ejecutar reset.
3. Revisar cuentas y permisos esperados por empresa. No compartir las cuentas locales fuera del entorno de desarrollo ni reutilizar sus credenciales en un servicio real.
4. Verificar que la línea base no cambió desde Fase 10. Si cambia código, permisos, esquema o dependencias, ejecutar las comprobaciones pertinentes de la [guía de validación](../../docs/saphi/validacion-local.md) antes de usar la nueva versión como referencia.
5. Empezar con recorridos de lectura. Las escrituras de usuarios deben acordarse con empresa, operador, códigos y propósito; registrar lo creado. Muestras y sus históricos no se borran para limpiar una demostración.

### Durante la sesión

| ID | Recorrido | Resultado verificable | Evidencia esperada |
|---|---|---|---|
| PIL01 | Acceso local, MFA y selector | Solo empresas asignadas; simulador identificado | Usuario/rol funcional, ámbito y resultado, sin contraseñas ni tokens |
| PIL02 | Maule → Colchagua → Maule | Nombre y registros de cada empresa; sin filas de la selección anterior | Comparación de nombres/códigos de ambas empresas |
| PIL03 | Consulta de predios y cuarteles | Padres, estados y atributos registrados coherentes | Lista y filtro utilizados |
| PIL04 | Consulta/paginación de puntos | Navegación entre páginas sin perder ámbito ni repetir filas por defecto | Empresa, filtro y páginas observadas |
| PIL05 | Operador en A y lector en B | Acciones de edición solo en la empresa autorizada; URL directa no amplía acceso | Capacidades esperadas frente a UI y respuesta obtenida |
| PIL06 | Cuenta sin membresía activa | Selector vacío o acceso denegado sin revelar datos de empresas ajenas | Mensaje y ámbito solicitado |
| PIL07 | Alta/edición territorial acordada | Validaciones, motivo, versión y trazabilidad; conflicto recuperable | IDs de registros de prueba creados/modificados |
| PIL08 | Muestras/histórico acordados | Inmutabilidad y fecha de toma; rango `[Desde,Hasta)` | Código ficticio, período e ID de muestra |
| PIL09 | Dispositivos/lecturas/satélite con habilitación acordada | Solo registros de origen; ausencia de datos diferenciada de falta de permisos | Fuente, empresa, período y permisos; si no se habilita, marcar bloqueado |
| PIL10 | Dashboard con habilitación acordada | Fuentes autorizadas, vista previa sin falsos totales, cero real diferente de pendiente | Sección y período; sin permiso, denegación correcta |
| PIL11 | Salida y acceso directo posterior | Datos empresariales retirados al cerrar sesión | Resultado de salida y navegación protegida |

Los escenarios destructivos o de concurrencia con datos reales no forman parte de la sesión de usuarios. Los casos de carreras, RLS, FKs y revocaciones tienen evidencia automatizada de Fase 10; una demostración adicional se acuerda con fixtures aislados.

### Registro y resolución de incidencias

Registrar ID, escenario, fecha, versión/estado de trabajo, cuenta de prueba, empresa, pasos, esperado, observado, evidencia y responsable. No adjuntar secretos, cookies, tokens o datos personales innecesarios. Usar `requestId` si la respuesta lo proporciona.

Clasificación técnica propuesta:

- **Crítica:** exposición entre empresas, escalamiento de permisos o pérdida/corrupción de datos. Suspender la sesión afectada y preservar evidencia; no continuar hasta verificar la corrección.
- **Bloqueante:** impide completar un recorrido incluido y habilitado. Resolver y repetir el escenario y su regresión antes de aceptarlo.
- **Menor:** problema de presentación o facilidad de uso sin afectar autorización/integridad. Registrar y acordar tratamiento con el cliente.
- **Dependencia pendiente:** fórmula, fuente, permiso o servicio aún no acordado. Marcar el escenario bloqueado/excluido; no contarlo como aprobado ni como una integración defectuosa ya implementada.

## Criterios de aceptación propuestos

Para aceptar **el alcance del piloto local acordado**:

1. Cada recorrido incluido tiene evidencia y resultado explícito: aprobado, fallido o bloqueado. Un recorrido excluido lleva motivo y decisión del responsable del cliente.
2. Ningún recorrido incluido queda fallido o bloqueado sin resolver; no hay incidencias críticas ni bloqueantes abiertas en ese alcance.
3. Se conserva aislamiento empresarial, intersección de permisos y auditoría; no se amplían permisos automáticamente para superar una prueba.
4. No se muestran datos ficticios como mediciones reales ni valores pendientes como cero.
5. Cualquier corrección de código/esquema cuenta con la regresión pertinente y no reduce el mínimo de cobertura del 80% por paquete.
6. El cliente confirma que las personas participantes pueden completar las tareas acordadas y registra sus observaciones.
7. El responsable del cliente acepta explícitamente el acta y las exclusiones. La ejecución técnica no equivale a esa aceptación.

Estos criterios no fijan SLA, volumen, exactitud agronómica ni tiempos de atención que el cliente aún no definió.

## Decisiones para ampliar a un piloto con integraciones reales

| Prioridad recomendada | Definición del cliente | Consecuencia |
|---|---|---|
| 1 | Responsable, usuarios, empresas, recorridos y entorno del piloto | Permite calendarizar una sesión verificable |
| 1 | Habilitación y recuperación administrativa Q02/Q03 | Permite acceso legítimo a módulos posteriores en empresas elegidas |
| 2 | Catálogos y fichas de fórmulas Q08, con resultados esperados | Permite implementar análisis e indicadores sin inventar reglas |
| 2 | Fabricante/protocolo/payload/identidad IoT Q05 | Permite definir y probar recepción real |
| 2 | Fuente, producto y licencia satelital Q07; archivos Q09 | Permite definir importación y acceso a objetos |
| 3 | Volumen, retención, SLA, presupuesto y operación Q06 | Permite dimensionar y medir el piloto externo |
| 3 | AWS, responsables de acceso, copias/restauración y autorización separada | Permite preparar una etapa de despliegue y sus verificaciones |

No se asume que laboratorio, IoT y satélite deban implementarse simultáneamente: el cliente debe priorizar qué dependencia resuelve primero. El despliegue requiere autorización concreta de entorno y alcance; esta Fase 11 no lo ejecuta.

## Entrega y estado

Se entregan este plan y el [registro/protocolo local](../../docs/saphi/piloto-local.md). Cambios limitados a documentación; no se modificaron datos, código, migraciones, permisos, dependencias ni infraestructura en esta fase. No se ejecutó una nueva sesión de piloto ni se repitieron suites funcionales por estos documentos. La revisión documental comprueba enlaces y `git diff --check`.

**Preparación documental completada.** Quedan pendientes las decisiones iniciales del cliente y la aceptación del alcance para programar/ejecutar el piloto. No se inicia una fase adicional ni se presenta aceptación productiva.
