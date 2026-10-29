# Saphi — Fase 4: módulos maestros

Autorización: Fase 3 aceptada e inicio de Fase 4 solicitado. Especificación de implementación antes de modificar funcionalidades.

## Alcance

Empresas, capacidades, membresías/concesiones, predios, cuarteles y puntos de muestreo. API autenticada con `authed`, mismo contexto/tx y secreto de origen; interfaces Vue con el layout, HTTP, i18n y permisos existentes. Sin laboratorio, IoT, satélite, indicadores, fórmulas, borrados físicos ni despliegues.

Se adoptan las políticas restrictivas de Fase 1: bootstrap solo por superusuario, primera persona gestora distinta del actor, usuario existente/activo y techo global suficiente. No se asignan perfiles globales desde Saphi. La persona gestora inicial necesita companies:view, memberships:view y memberships:edit. Los usuarios se habilitan globalmente con los mantenedores de plataforma existentes; no se crean cuentas duplicadas.

La administración se realiza mediante funciones SQL estrechas de una migración nueva: razón obligatoria, sin autoedición de membresías/concesiones, sin conceder más que el actor y el techo global del destinatario, versión esperada y protección del último gestor. Las funciones bloquean primero la empresa en modo exclusivo; no se invoca antes el setter de contexto con bloqueo compartido para evitar upgrades de bloqueo concurrentes. Reactivar una membresía requiere validar también los permisos conservados. Recuperar empresas inactivas o sin gestores por cambios globales sigue fuera del CRUD inicial; no se agrega bypass de soporte.

Crear/editar un recurso interactivo exige también su permiso view para satisfacer RLS/RETURNING. Crear un cuartel requiere farms:view y crear un punto requiere plots:view para seleccionar un padre visible. Capacidades empresariales omiten acciones de escritura sin lectura efectiva del mismo menú. Los cambios de estado en empresa requieren además superusuario; el actor sigue necesitando membresía/concesión. El alta no otorga automáticamente membresía al creador, por lo que no garantiza que la empresa aparezca en su propio selector.

## Contratos concretos

Se implementan API01–API11 y puntos de muestreo del [contrato](./04-api.md), con GET/POST de colecciones y GET/PATCH por ID. `expectedVersion` se compara atómicamente en escrituras. Empresa/membresías usan funciones privilegiadas; maestros usan repositorios limitados por empresa y RLS. IDs ajenos/no visibles →404, falta de capacidad en empresa propia →403, conflicto de versión →409. Empresa inactiva no permite inicializar contexto y se presenta como no accesible. Sin DELETE.

Paginación keyset por created_at/id, límite25 por defecto y máximo100. Se reutiliza el cifrado autenticado AES-GCM de Base Fairplay, con cursores ligados a actor, empresa, recurso y filtros/límite y duración de15minutos. Clave derivada con propósito exclusivo del secreto de origen en AWS y de la clave aleatoria local en desarrollo/tests; rotación invalida cursores. Un cursor nunca autoriza acceso y se revalidan permisos en cada solicitud. Se conservan los microsegundos originales de PostgreSQL en los límites de página, sin pasar por Date de JavaScript, para evitar omitir filas con el mismo instante. El alta de múltiples filas con timestamp idéntico tiene una prueba de recorrido completo.

Los puntos usan GeoJSON Point validado, sin mapa ni dependencia GIS. Superficies decimales se mantienen como cadenas. Los formularios no convierten unidades ni aplican reglas agronómicas.

Los UUID públicos aceptan el formato GUID que ya utiliza la base, incluidos sus identificadores fijos sin bits RFC de versión/variante. Esto permite asignar explícitamente membresía al superusuario local existente sin duplicar su identidad ni cambiar los IDs históricos.

## Navegación y estado

Selector de empresas accesibles y alta administrativa; detalle de empresa; maestros con formularios y filtros padre/hijo; administración de miembros y permisos. Las rutas estáticas de catálogo sirven como puentes hacia la empresa seleccionada. El layout muestra solo el subárbol Saphi filtrado por capacidades; la entrada al selector no requiere una membresía previa. Los guards comprueban capacidades de la empresa de la URL y no usan el bypass global de superusuario.

Cambiar empresa/usuario limpia capacidades y datos y descarta respuestas tardías. Loading, error, sin datos y falta de permiso tienen estados explícitos; UI es/en y responsive con Vuetify, labels y acciones con nombre accesible. Sin datos simulados de negocio.

## Verificación y salida

pgTAP de funciones administrativas y grants; integración API de bootstrap, concesión, aislamiento A/B, padres cruzados, sesiones/MFA, versiones, cursores y auditoría; componentes/stores/guards Vue; typecheck, regresión completa≥80%, build y bundles. Aplicación de migración únicamente local después de verificarla en bases descartables. La configuración Serverless se prepara pero no se despliega.

## Resultado de implementación y validación

Se implementaron veinte rutas HTTP en la Lambda agrupada y en el servidor local, contratos en `@base/saphi`, repositorios PostgreSQL, capacidades por empresa y cuatro vistas Vue reutilizando Vuetify y el layout de Base Fairplay. La [migración de administración](../../supabase/migrations/20261028000200_saphi_master_administration.sql) agrega funciones estrechas, índices de paginación y las rutas de los cinco menús implementados. No concede DML directo sobre empresas o membresías. La migración de Fase 3 permanece intacta.

Resultados finales, 27 de octubre de 2026 (Chile):

| Comprobación | Resultado |
| --- | --- |
| Typecheck de los cinco paquetes/aplicaciones | Correcto |
| API, PostgreSQL real en base descartable | 164 pruebas correctas |
| Vue, stores, guards y regresión de plataforma | 126 pruebas correctas |
| Contratos Saphi / shared / UI | 15 / 29 / 6 pruebas correctas |
| Total TypeScript | 340 pruebas correctas |
| pgTAP en base descartable y base local migrada | 215 comprobaciones correctas en cada base |
| Cobertura API | 98,05% líneas; 87,17% ramas |
| Cobertura web | 97,21% líneas; 89,86% ramas |
| Build web y seis bundles Lambda | Correctos |

Los umbrales de cobertura de 80% se conservan. La primera ejecución simultánea con compilación produjo dos timeouts de 5 segundos en pruebas web de plataforma; la ejecución web completa aislada pasó sin aumentar ese límite. Se limita a dos workers web para reducir contención de CPU/memoria. API y web se verificaron por separado, como en los jobs existentes de CI. Vite informa advertencias de anotaciones PURE en Zod, sin impedir el build.

La migración nueva se aplicó solamente a PostgreSQL local, después de las pruebas en base descartable. No se ejecutaron reset, despliegues ni cargas de negocio. Las pruebas crean fixtures únicamente en bases descartables o dentro de transacciones con rollback. La [guía local](../../docs/saphi/maestros-local.md) explica el alta con identidades reales y la asignación explícita de acceso.

Comprobación manual en navegador local: inicio de sesión con MFA de desarrollo, entrada Saphi Chile, selector sin empresas asignadas y apertura/cierre del formulario de alta con sus campos y advertencia de gestor inicial. No se envió el alta. Los flujos con datos y sus restricciones se verificaron mediante integración API y componentes Vue; no se crearon registros de negocio para la demostración.

## Límites y siguiente aprobación

- La recuperación de empresas inactivas o sin gestores efectivos por cambios globales requiere un procedimiento posterior. No se incorpora un bypass de superusuario.
- El directorio global y los perfiles siguen administrándose en Base Fairplay; Saphi no crea usuarios ni otorga permisos globales. El primer gestor debe ser otra persona existente y activa.
- No se implementan análisis de laboratorio, reglas agronómicas, mapas, IoT, satélite ni adaptadores externos. Las decisiones de cliente pendientes en Fase 1 siguen pendientes.
- La configuración AWS queda preparada y sin desplegar. No se inicia Fase 5. Este cierre se entrega para revisión y aprobación de Fase 4.
