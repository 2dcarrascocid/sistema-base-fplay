# Repetir la validación local de Saphi

Usa Node.js 24, pnpm y las dependencias disponibles del repositorio, con PostgreSQL local activo en el puerto 54322. Las suites simulan servicios externos y no requieren credenciales AWS. No ejecutar contra una base productiva o compartida de trabajo.

Ejecuta las comprobaciones en secuencia para reducir contención durante la preparación de fixtures:

```powershell
pnpm typecheck
pnpm --filter @base/shared test
pnpm --filter @base/saphi test
pnpm --filter @base/ui test
pnpm db:test
pnpm --filter @base/api test
pnpm --filter @base/web exec vitest run --coverage --maxWorkers=1
pnpm --filter @base/web build
pnpm --filter @base/api bundle:check
git diff --check
```

`db:test` usa transacciones pgTAP con rollback. La suite API **elimina y reconstruye `app_test`** mediante su setup y crea una base temporal exclusiva para probar upgrades. No reconstruye `postgres`, la base de desarrollo. No usar `db:reset` para realizar la validación ni editar migraciones históricas para solucionar una prueba.

Una ejecución fallida o con pruebas omitidas requiere revisar su causa; no reducir aserciones o cobertura. La preparación API tiene un límite de treinta segundos para fixtures multiempresa y cada prueba conserva veinte segundos. En el equipo local se usa un worker web para reducir la contención; el límite de diez segundos por prueba web se mantiene. El mínimo de cobertura es 80% en líneas, ramas, funciones y sentencias por paquete.

Para el recorrido visual, utiliza las [cuentas demo y sus permisos](./recorrido-demo.md). Comprueba selector, empresa, predios, cuarteles, puntos y cambio de empresa. La ausencia de concesiones para módulos posteriores debe producir falta de acceso; no otorgar permisos automáticamente para aparentar una validación positiva. Los escenarios autorizados de esos módulos se ejercitan con fixtures de integración.

Si Vite responde `504 Outdated Optimize Dep` después de compilaciones o cambios del servidor, recarga el servidor de desarrollo y la página para sincronizar las dependencias optimizadas. No es necesario cambiar versiones o instalar bibliotecas por ese mensaje.

Los simuladores locales no demuestran integración con fabricantes, fuentes satelitales o AWS. Fórmulas agrícolas, capacidad, costos, retención, recuperación y producción requieren aceptación y pruebas específicas. Consulta la evidencia y las limitaciones en el [informe de Fase 10](../../specs/saphi/17-fase-10-validacion.md).
