# Informe de avance de Saphi Chile

**Fecha:** 28 de octubre de 2026
**Base de revisión:** código y documentación del repositorio, evidencia histórica de pruebas y consulta de la base local de demostración.
**Estado general:** solución funcional para revisión y piloto local; sin aceptación de usuarios ni despliegue productivo de Saphi registrados.

## Resumen ejecutivo

Saphi Chile se incorporó a Base Fairplay como módulo empresarial. Ya permite administrar empresas, membresías y permisos contextuales; registrar predios, cuarteles y puntos de muestreo; crear y consultar muestras; mantener dispositivos; consultar telemetría almacenada y metadatos satelitales; y navegar por un dashboard centrado en los datos generales y territoriales de cada empresa. La autorización combina sesión, permisos globales y concesiones por empresa, con controles adicionales en PostgreSQL.

El visor Sentinel-2 conectado a Google Earth Engine generó y cargó teselas NDVI y NDWI en una prueba local real. El catálogo satelital y el visor son flujos distintos: las filas `demo.local` del catálogo se agregaron para recorrer la interfaz y **no son escenas descargadas de Earth Engine**. La conexión MQTT con AWS IoT Core también se comprobó localmente, pero no existe evidencia de publicación y persistencia extremo a extremo de un dispositivo real.

## Cobertura lograda

| Área | Disponible en el proyecto | Límite actual |
|---|---|---|
| Plataforma y seguridad | Inicio de sesión y MFA de Base Fairplay; selección de empresa; membresías, permisos efectivos por empresa, auditoría, claves foráneas empresariales y RLS. | El procedimiento excepcional para recuperar o habilitar empresas sin un gestor con permisos nuevos requiere decisión del cliente. |
| Empresas y territorio | Alta y edición de empresa; predios, cuarteles y puntos con creación, edición, estados activo/inactivo y relaciones visibles. Selección de coordenadas del punto mediante mapa. | Los puntos no definen un lindero catastral. No hay polígonos ni superficie espacial validada. |
| Muestras e histórico | Registro inmutable de muestras, consulta por cuartel y fecha/hora, detalle y vinculación opcional a punto. | No existe aún un catálogo aprobado de análisis de laboratorio ni resultados analíticos. |
| Dispositivos y telemetría | Mantenimiento de dispositivos, consulta de lecturas almacenadas y panel de actualización. Existe contrato y componente de ingesta IoT. | Sin recorrido verificado AWS IoT → Lambda → PostgreSQL con publicación real; los dispositivos y lecturas de la base demo son simulados. |
| Satélite | Catálogo de observaciones y detalle; visor Leaflet con Sentinel-2 SR Harmonized de Earth Engine, filtros de cuartel, período, nubosidad, NDVI y NDWI. | El visor usa una envolvente de puntos, no el polígono real. No importa escenas al catálogo ni habilita exportaciones o descargas persistentes. |
| Dashboard | Datos generales de empresa y vistas previas de predios, cuarteles, puntos y muestras, respetando permisos. | Las vistas previas no son totales empresariales; no se presentan indicadores agronómicos sin fórmula validada. |
| Datos de demostración | Tres empresas locales, con **7 predios, 13 cuarteles, 81 puntos, 63 muestras, 12 dispositivos, 8 lecturas, 39 observaciones y 39 referencias de activos** tras ejecutar el arranque completo el 28-10-2026. | Son datos ficticios, sin mediciones de equipos ni productos satelitales reales. |

La implementación y uso local de los módulos se describen en las guías de [maestros](./maestros-local.md), [laboratorio/muestras](./laboratorio-local.md), [IoT](./iot-local.md), [satélite](./satelital-local.md), [visor GEE](./satelital-gee-local.md) y [dashboard](./dashboard-local.md). La carga repetible más reciente está en el [script de datos visuales](../../apps/api/scripts/populate-saphi-visual-demo.mjs).

## Tecnología utilizada

| Capa | Tecnología y función |
|---|---|
| Aplicación web | Vue 3 y TypeScript; Vite para desarrollo/compilación; Vue Router para navegación; Pinia para estado; Vuetify para interfaz; Leaflet para mapas; vue-i18n para etiquetas. Véase [manifiesto web](../../apps/web/package.json). |
| API y contratos | Node.js 24 y TypeScript; API de Base Fairplay y módulos Saphi; Zod para validación de entradas; paquete compartido `@base/saphi` para contratos; Kysely y `pg` para acceso a datos. Véanse [manifiesto API](../../apps/api/package.json) y [contratos](../../packages/saphi/src/index.ts). |
| Datos | PostgreSQL 17 en el entorno local, gestionado con Supabase CLI/Docker; esquema `saphi`, migraciones SQL, RLS, funciones restringidas, auditoría y pruebas pgTAP. Véanse [migraciones](../../supabase/migrations/) y [guía de validación](./validacion-local.md). |
| Infraestructura definida | Serverless Framework v4 y AWS Lambda/API Gateway para la API; la plataforma Base Fairplay también define Cognito, CloudFront/WAF, Secrets Manager, S3 y SES. El [manifiesto principal](../../apps/api/serverless.yml) es configuración de despliegue, **no evidencia de que Saphi se haya desplegado**. |
| Imágenes satelitales | Google Earth Engine mediante proveedor Python local, colección Sentinel-2, y teselas visualizadas con Leaflet. La integración se verificó localmente con Google real según el [registro técnico GEE](../../specs/saphi/20-fase-7-integracion-gee.md). |
| IoT | AWS IoT Core, MQTT5 y SDK oficial en el simulador; diseño de regla y Lambda dedicada en una [pila opcional deshabilitada](../../apps/api/serverless.iot.yml). La conexión al broker se probó; publicación y persistencia reales quedan pendientes. |
| Pruebas | Vitest para paquetes/API/web, pgTAP para base, pruebas de contratos y compilación de bundles. Las cifras documentadas en [validación de Fase 10](../../specs/saphi/17-fase-10-validacion.md) y en [AWS IoT](../../specs/saphi/21-fase-6-aws-iot.md) corresponden a aquellas ejecuciones, no a una regresión completa posterior a los últimos ajustes de interfaz y datos demo. |

## Pendientes que debe definir el cliente

| Prioridad propuesta | Definición o entrega requerida | Para qué se necesita |
|---|---|---|
| 1 | Responsable que acepta el piloto, participantes, empresas, tareas, fecha y criterios de éxito; decidir qué escrituras de prueba se autorizan. | Ejecutar y cerrar una sesión de usuarios con acta, separada de las pruebas técnicas. |
| 1 | Procedimiento y responsables para habilitar capacidades nuevas y recuperar empresas sin gestor autorizado. | Operar los módulos nuevos en empresas existentes sin ampliar permisos por vías informales. |
| 1 | Catálogo de análisis: parámetros, unidades, métodos, precisión, tipos de resultado y ejemplos validados por un referente agronómico. | Completar laboratorio y sus históricos de resultados. |
| 1 | Fichas de indicadores: fórmula, entradas, fuentes, período, casos límite, redondeo, interpretación y resultados esperados aprobados. | Implementar indicadores agrícolas verificables; los conteos del dashboard no sustituyen estos cálculos. |
| 2 | Fabricante y modelo IoT, payload real, identidad/certificado, tópico, clasificación de temperatura y tolerancia de reloj; empresa y dispositivo piloto. | Probar publicación autorizada y persistencia extremo a extremo. |
| 2 | Producto y licencia satelital, uso permitido, atribución, índices requeridos y datos de referencia; decidir si se necesita guardar escenas. | Pasar del visor transitorio a una integración satelital con trazabilidad y aceptación de resultados. |
| 2 | Política de archivos: formato, tamaño, acceso, firma/TTL, conservación y descarga. | Habilitar importación/exportación de activos con controles definidos. |
| 2 | Alcance geográfico: si se requieren linderos/polígonos reales, quién los aporta, precisión y decisión sobre PostGIS. | Mostrar una superficie del cuartel en lugar de la actual envolvente ilustrativa de puntos. |
| 3 | Volumen esperado, crecimiento, retención, cuotas, SLA, respaldo/restauración y presupuesto. | Dimensionar IoT, base, almacenamiento y operación antes de un piloto externo. |
| 3 | Cuenta/entorno AWS, responsables de acceso, revisión de seguridad y autorización concreta de despliegue. | Preparar y validar un entorno externo sin confundir configuración con servicio activo. |

El [registro único de pendientes](./pendientes-cierre.md) conserva los identificadores C01–C11 y la evidencia esperada. El [acta de piloto](./piloto-local.md) aún no contiene aceptación del cliente.

## Evidencia y próximos hitos

- La [Fase 10](../../specs/saphi/17-fase-10-validacion.md) documentó **411 pruebas automatizadas y 263 comprobaciones pgTAP** en su línea base local. La ampliación IoT/GEE tiene evidencia técnica posterior en sus informes; esas cifras son históricas y no certifican los cambios más recientes.
- El [piloto técnico local](../../specs/saphi/19-fase-12-piloto-tecnico.md) ejecutó **648 verificaciones HTTP** de acceso, pertenencia y sesiones. Son comprobaciones repetidas, no 648 casos de negocio ni aceptación de usuarios.
- La carga de datos visuales se ejecutó repetidamente sin duplicados; se verificó que la gestora puede leer las tres observaciones demo de su cuartel dentro del período de la captura. El arranque completo `pnpm dev:saphi` preparó el contenedor, las migraciones, las empresas y las tablas demo, y finalizó correctamente con servicios locales existentes. La sintaxis del script y `git diff --check` también se revisaron.
- Antes de presentar la versión actual como candidata de piloto, corresponde ejecutar la [regresión completa](./validacion-local.md), revisar las pantallas con usuarios designados y registrar resultados en el [acta](./piloto-local.md). Un commit o push del código no constituye un despliegue de Saphi.

**Conclusión:** Saphi cubre el flujo empresarial y territorial, el registro de muestras, consultas técnicas y un visor satelital local funcional. El cierre funcional de laboratorio, indicadores, integración física IoT, archivos satelitales, GIS y operación externa depende de definiciones y aceptación expresa del cliente.
