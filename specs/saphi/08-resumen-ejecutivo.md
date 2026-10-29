# Saphi Chile — Resumen ejecutivo de Fase 1

Estado: **DOCUMENTACIÓN PARA APROBACIÓN — no inicia Fase 2**. Fecha: 2026-10-27.

## Arquitectura y modelo propuestos

Saphi extiende el monorepo con una Lambda de negocio agrupada y módulos por dominio, el paquete compartido `@base/saphi` y vistas Vue dentro del layout existente. La plataforma conserva identidad, sesiones, usuarios, permisos y auditoría. Dominio/aplicación/persistencia/adaptadores mantienen responsabilidades separadas sin reordenar la base.

El esquema `saphi` contiene empresas, membresías, asignaciones contextuales a permisos existentes, predios, cuarteles, puntos/muestras, análisis, dispositivos/mediciones, observaciones satelitales, riego e indicadores. Cada dato pertenece a una empresa; FKs compuestas impiden referencias cruzadas. Históricos conservan tiempo de origen, recepción y procedencia. PostgreSQL nativo inicia la telemetría; el particionado depende del volumen, no de las cinco hectáreas del piloto.

La recomendación de seguridad combina permiso global efectivo con asignación explícita por empresa y membresía activa. Permite editar en A y leer en B sin crear otro catálogo de roles/permisos. Contexto empresarial transaccional y RLS verifican el mismo alcance. La navegación consume capacidades empresariales; el menú global no autoriza datos por sí solo.

## Decisiones aprobadas

A01–A08 del [documento de arquitectura](./01-arquitectura.md): mantener plataforma y stack; reutilizar mecanismos transversales; diseñar esquema `saphi`, paquete `@base/saphi` y Lambda agrupada; PostgreSQL nativo para telemetría; evaluar PostGIS sin instalar y TimescaleDB solo con justificación; fase exclusivamente documental. La autorización no incluye fórmulas, unidades, proveedores, cloud ni desarrollo agrícola.

## Recomendaciones técnicas pendientes de aprobación

| ID | Recomendación | Consecuencia |
|---|---|---|
| R01 | Validadores compartidos con Zod ya usado en API | Requerirá dependencia explícita del paquete en fase autorizada |
| R02 | Intersección permiso global/concesión empresarial | Perfiles actuales son techo; ninguna concesión tenant lo supera |
| R03 | Superusuario requiere membresía/concesión para datos; bootstrap estrecho | Sin bypass general de aislamiento; recuperación debe especificarse |
| R04 | No particionar inicialmente hasta medir | Menor operación; revisar antes de crecer la ingesta |
| R05 | Geometría opcional hasta decisión GIS | No prometer mapas completos ni topología validada |
| R06 | Estados y correcciones, sin DELETE de históricos/maestros inicial | Trazabilidad; retención y purga por definir |
| R07 | Asignaciones por usuario y empresa a `app.menu_actions` | Sin roles empresariales nuevos; más trabajo administrativo |
| R08 | Índices por empresa/dispositivo/instante e identidad idempotente | Requiere contrato real del proveedor y medir carga |
| R09 | GeoJSON público independiente de storage, límites estructurales | PostGIS sigue pendiente; no calcular área en grados |
| R10 | Idempotencia genérica humana solo con ledger aprobado | No prometer reintentos seguros sin persistencia; códigos detectan duplicados |
| R11 | Menús estáticos con rutas puente y capacidades contextuales | Conserva constraint actual; requerirá integración del segmento Saphi en layout |
| R12 | Inbox/recibos si se aprueba ingesta asíncrona | Nuevas migraciones/infraestructura posteriores, nunca202 antes de durabilidad |
| R13 | Objetos agrícolas con referencias autorizadas y acceso firmado | Buckets/policies/costos aún sin aprobar |

Bootstrap solo para superusuario, prohibición de autoasignación y protección del último gestor son propuestas de seguridad detalladas en [03](./03-seguridad.md), no decisiones del cliente ya aprobadas.

## Preguntas del cliente y dependencias

| ID | Respuesta requerida | Bloquea |
|---|---|---|
| Q01 | Autoridad de creación de empresas/membresías y proceso de habilitación global del destinatario | Escrituras administrativas y bootstrap |
| Q02 | Alcance del superusuario y necesidad de soporte/auditoría empresarial | Política final de acceso y recuperación |
| Q03 | Último gestor, recuperación y efecto de cambios globales de perfiles | Operación segura de membresías |
| Q04 | Proveedor/versiones BD, catálogo de extensiones y adopción PostGIS | Migración GIS y validación espacial |
| Q05 | Fabricante/modelo IoT, protocolos, payloads, autenticación e identidad de mensaje | Adaptadores e ingesta |
| Q06 | Dispositivos/frecuencia, retención, SLA, crecimiento, presupuesto y criterios del piloto | Capacidad, cuotas, particiones/colas y aceptación productiva |
| Q07 | Fuente/licencia satelital, frecuencia, índices de origen o cálculo aprobado | Integración satelital |
| Q08 | Catálogos, unidades, métodos, precisión, fórmulas y responsable agronómico | Laboratorio, riego e indicadores definitivos |
| Q09 | Archivos, GPS, dibujo de polígonos, mapas offline y políticas de datos | Bibliotecas, CSP y almacenamiento |

Dependencias técnicas actuales: Node24, pnpm del repositorio, PostgreSQL17 local/Docker y suites existentes; permisos globales habilitados por operadores de plataforma; paridad de contrato del paquete y API/web. No se necesita ni se autoriza instalar herramientas para revisar estos documentos. Catálogo de proveedores, licencias y compatibilidad de bibliotecas deberá verificarse antes de adopción; las alternativas mencionadas no equivalen a una selección.

## Riesgos y mitigación

- Perfiles globales más concesiones empresariales pueden resultar confusos: mostrar capacidad efectiva y causa de denegación solo a operadores autorizados, con pruebas A/B.
- El superusuario y los mantenedores globales no están segmentados hoy: limitar su uso operativo y no delegarlos como administración agrícola.
- Auditoría global no tiene tenant: conservarla para plataforma; no exponerla a empresas sin diseño posterior.
- RLS/helpers privilegiados pueden tener recursión o exceso de grants: funciones estrechas, pruebas bajo `app_api` y FKs compuestas.
- Volumen IoT y almacenamiento aún desconocidos: consultas acotadas, deduplicación y dimensionamiento antes de recursos con costo.
- Mapas externos requieren revisar CSP/licencia/privacidad: no ampliar políticas ni incorporar biblioteca automáticamente.
- Fórmulas/unidades faltantes pueden producir información engañosa: bloquear cálculo y mostrar definición pendiente, nunca mediciones simuladas como reales.

## Condiciones para iniciar Fase 2

1. Aprobación explícita de [arquitectura](./01-arquitectura.md), [datos](./02-modelo-datos.md), [seguridad](./03-seguridad.md), [API](./04-api.md), [frontend](./05-frontend.md), [integraciones](./06-integraciones.md) y [pruebas](./07-pruebas.md), indicando recomendaciones aceptadas u observaciones.
2. Acordar alcance del esqueleto y contratos habilitados. Resolver Q01–Q03 antes de implementar administración/autorización; los contratos aún bloqueados pueden quedar excluidos expresamente de Fase 2 sin aprobarlos por silencio.
3. Autorizar separadamente los cambios de manifiestos/configuración/registro de rutas necesarios para esa fase. Mantener prohibición de despliegues y de recursos con costo salvo autorización específica posterior.
4. Acordar verificaciones ejecutables y entorno local; no exponer rutas tenant sin migraciones/RLS verificadas. No iniciar Fase 3 por concluir el esqueleto.

Esta entrega crea únicamente estos ocho documentos de Fase 1. La revisión documental verifica enlaces y alcance del diff; no ejecuta pruebas de funcionalidades inexistentes ni certifica seguridad. La ejecución se detiene para solicitar aprobación del responsable.
