# Saphi Chile — Fase 2: esqueleto modular

Autorización: el responsable aprobó Fase 1 y solicitó iniciar Fase 2. Se adopta el alcance seguro recomendado en [07-pruebas](./07-pruebas.md): contratos/puertos y pruebas, sin exponer datos antes de migraciones/RLS de Fase 3. La aprobación no aporta los parámetros de proveedor, catálogos ni reglas agronómicas pendientes.

## Cambios realizados

| Área | Resultado y justificación |
|---|---|
| [@base/saphi](../../packages/saphi/package.json) | Paquete workspace TypeScript con Zod4.6.7 ya usado en API y utilidades `@base/shared`; sin versiones nuevas de herramientas |
| [contratos](../../packages/saphi/src/index.ts) | DTO iniciales de maestros/capacidades, paginación y tipos de intercambio IoT/satélite; validadores estructurales sin agronomía |
| [puertos de composición](../../apps/api/src/saphi/composition.ts) | Repositorios y autorización empresarial abstractos; sin adapters PostgreSQL ni autorización simulada |
| [entrada API](../../apps/api/src/saphi/index.ts) | Entrada empaquetable agrupada y tabla de rutas cerrada; no accede a BD ni proveedores |
| [bundle check](../../apps/api/scripts/bundle-check.mjs) | Incluye nueva entrada, sin crear función cloud |
| [CI](../../.github/workflows/ci.yml) | Ejecuta tests del paquete; `typecheck` recursivo ya lo incluye |
| [lockfile](../../pnpm-lock.yaml) | Solo importadores/enlaces del paquete y API; instalación offline reutilizando caché, sin descargas |
| Documentación | READMEs de paquete/módulo y este registro de alcance/verificación |

No hay migraciones, grants, permisos asignados, recursos cloud, despliegues, cambios de autenticación, configuración de seguridad ni modificaciones de la web. No se generaron directorios vacíos para los doce dominios ni vistas ficticias. Los dominios futuros se incorporan cuando tengan contratos/casos de uso autorizados.

## Diferencias deliberadas respecto del árbol objetivo

- Sin registro en Serverless/servidor local: no existe todavía un endpoint seguro de datos tenant. Un stub200 con datos vacíos no demostraría funcionamiento ni aislamiento. La entrada se comprueba por bundle y tests, pero no se publica.
- Sin stores/rutas Vue: dependen de capacidades y membresías reales; Base Fairplay conserva su interfaz actual. El paquete está listo para consumo posterior sin añadir un import artificial a web.
- Sin bootstrap, concesiones ni implementación de `CompanyAuthorization`: Fase 3 aportará modelo físico, helpers y RLS. Ninguna constante o interfaz concede autoridad por sí misma.
- Sin validación definitiva IoT, GIS, laboratorio, riego o fórmulas: unidades, catálogos, proveedores y precisión pendientes. Geometría/ubicación quedan fuera de los schemas iniciales.

## Verificaciones

Ejecutadas con Node24.22.1 y pnpm10.34.8 disponibles en caché. Las primeras ejecuciones de esbuild en sandbox fallaron por permisos de lectura del entorno; las verificaciones se repitieron con acceso autorizado. No se cambió código para ocultar esas restricciones.

| Comprobación | Resultado |
|---|---|
| `pnpm typecheck` | Los cinco paquetes pasan |
| `pnpm test` | 295 tests pasan: shared29, ui6, saphi10, web105, api145 |
| Cobertura Saphi | 100% líneas, sentencias, funciones y ramas del código ejecutable |
| Cobertura base | Todos los umbrales≥80% pasan; API97,79% líneas /86,18% ramas; web97,70% /90,42% |
| `pnpm --filter @base/api bundle:check` | Seis entradas empaquetadas, incluida Saphi; sin despliegue |
| `pnpm --filter @base/web build` | Compilación de producción completada, 540 módulos transformados |
| `pnpm db:test` | 103 pruebas pgTAP en siete archivos, todas pasan; sin migraciones nuevas |

Los cuatro tests nuevos de API verifican tabla cerrada y404 en GET/POST/PATCH de empresas, predios e ingesta. Los diez tests del paquete cubren inyección de companyId/campos desconocidos, formato de permisos, precisión decimal, versión/paginación y cambios válidos/inválidos. No son pruebas de aislamiento SQL: no hay tablas Saphi todavía. La suite API reconstruye solo `app_test`, separada de la BD de desarrollo. No se ejecutó reset de la BD de trabajo.

## Siguiente puerta

Fase 3 requiere autorización independiente para nuevas migraciones, helpers, RLS y pruebas pgTAP. Antes de escrituras administrativas/productivas, resolver Q01–Q03 del [resumen](./08-resumen-ejecutivo.md); antes de integraciones, resolver catálogos y proveedores correspondientes. No activar rutas ni crear recursos con costo por haber terminado el esqueleto.
