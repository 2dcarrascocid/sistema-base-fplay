# Saphi Chile — Fase 3: modelo base e integridad multiempresa

Autorización: responsable solicita avanzar a Fase 3 tras aprobar Fase 1 e implementar Fase 2. Alcance: persistencia y seguridad de la fundación empresarial y maestros, con pruebas SQL/integración; no CRUD HTTP, pantallas ni despliegue. Los catálogos, proveedores y fórmulas pendientes no quedan aprobados por avanzar de fase.

## Modelo implementado

Una [migración nueva](../../supabase/migrations/20261028000100_saphi_foundation.sql) crea el esquema `saphi` y siete tablas:

- `companies`: RUT canónico único, nombres/contacto, estado y versión.
- `company_users`: relación con `app.users`, estado y versión; sin identidad/roles duplicados.
- `company_user_permissions`: alcance empresarial sobre `app.menu_actions`, sin otro catálogo.
- `farms` y `plots`: empresa, claves de negocio, superficies opcionales y relación padre/hijo con FK compuesta.
- `sampling_points`: punto GeoJSON estructural de dos coordenadas con límites; sin polígonos, topología ni cálculo de superficie.
- `soil_samples`: cuartel, punto opcional del mismo cuartel, instante finito y notas; sin resultados de laboratorio inventados.

Todas tienen RLS. El actor de creación/modificación, fechas y versiones se estampan en BD. Las claves empresariales y padres son inmutables. Los grants por columna impiden inyectar actor, id o versión desde `app_api`. No hay borrado físico ni actualización libre de muestras. La superficie usa `numeric` con límites y escala explícitos para rechazar precisión excesiva, en lugar de redondearla silenciosamente al almacenar en `numeric(14,4)`; mantiene el rango aprobado del contrato.

Las relaciones empresa/predio/cuartel/punto/muestra se validan por claves compuestas. Un UUID real de otra empresa no puede ser padre de una fila autorizada. Se conservan los tipos de [Kysely](../../apps/api/src/lib/saphi-db-types.ts): bigint y numeric como cadenas, puntos como JSONB e instantes como Date; sin convertirlos silenciosamente a números JavaScript.

## Permisos, contexto y mínimos privilegios

Se registran las 27 combinaciones de catálogo de [Fase 2](../../packages/saphi/src/constants/permissions.ts) en las tablas existentes de Base Fairplay. Los menús no tienen ruta todavía y no se conceden permisos a perfiles base ni membresías a usuarios automáticamente.

El orden de inicialización base carga acciones desde semillas después de migraciones. Un trigger acotado de inserción de acciones conecta únicamente las combinaciones Saphi predefinidas; la migración también conecta acciones ya existentes para upgrades. Así se verifican instalación limpia y actualización sin modificar semillas ni migraciones históricas.

Los helpers de autorización consultan solo al actor actual: empresa activa, usuario activo, membresía activa y coincidencia entre concesión contextual y permiso global efectivo. El superusuario no recibe membresía ni concesiones empresariales implícitas. El selector empresarial por sí solo no autoriza y un GUC malformado cierra las consultas agrícolas.

`set_company_context(uuid)` comprueba membresía y fija contexto LOCAL a la transacción. Bloquea empresa y membresía en modo compartido hasta finalizar; una revocación administrativa que respete esos registros espera a las operaciones ya autorizadas. Rechaza cambiar normalmente de empresa dentro de la misma transacción. El runtime es un rol de servidor confiable, no una credencial entregada al navegador; RLS vuelve a verificar permisos incluso si ese rol altera manualmente el selector.

Los helpers privilegiados tienen `search_path` vacío y nombres calificados; PUBLIC no puede ejecutarlos. Los roles runtime no poseen objetos; `app_auth` carece de acceso al esquema Saphi. No se usa FORCE RLS: los helpers del propietario necesitan leer membresías sin recursión, siguiendo el patrón de la base. El propietario de migraciones sigue siendo una frontera de confianza, nunca el rol runtime.

Las tablas de empresas/membresías/concesiones tienen **solo lectura runtime**. No se abrió bootstrap, autoasignación ni administración parcial. Las funciones de administración deberán implementarse en una migración posterior antes de habilitar sus endpoints: techo de concesión, prohibición de autoedición, último gestor, versiones, razón y auditoría. Se conserva así la puerta de seguridad mientras se resuelven Q01–Q03 y se implementa Fase 4.

Las modificaciones permitidas de maestros se agregan a `app.audit_log` mediante trigger, incluyendo actor, entidad y empresa. No se reescriben filas ni hashes históricos. Las escrituras rollback revierten su evento. La procedencia HTTP (IP/userAgent/requestId) debe integrarse desde la aplicación al habilitar endpoints, sin duplicar el evento del trigger. La pantalla de auditoría sigue siendo global y no se delega a gestores agrícolas.

## Delimitación del resto del modelo

No se crean tablas de análisis, dispositivos/vínculos de proveedor, lecturas, satélite, riego ni indicadores en esta entrega. Sus claves, precisión, catálogos y autenticación siguen dependiendo de Q05–Q09; no se sustituye esa definición por JSON libre. El diseño PostgreSQL nativo de telemetría permanece como decisión inicial, sin particiones ni TimescaleDB antes de volumen/identidad de mensajes acordados. PostGIS sigue sin instalarse; el soporte de puntos no equivale a aprobar almacenamiento/validación de polígonos.

Esta es la fundación aplicable del modelo de Fase 3, no una afirmación de que todos los dominios agrícolas tengan persistencia terminada. Cada extensión posterior requiere nueva migración, grants/RLS desde su creación y pruebas del ámbito correspondiente. Las rutas Saphi y las pantallas siguen cerradas.

## Pruebas y validación

Los archivos [estructura](../../supabase/tests/07_saphi_structure.test.sql) y [aislamiento](../../supabase/tests/08_saphi_isolation.test.sql) cubren esquema/RLS, grants, catálogo, constraints, padres cruzados, escritura en empresa incorrecta, editor A/lector B, superusuario sin membresía, actor/perfil/empresa/membresía inactivos, auditoría y contexto ausente/malformado.

Las pruebas [de contexto](../../apps/api/test/saphi/context.test.ts) usan la misma conexión física para demostrar limpieza tras commit y rollback, y NOWAIT para demostrar bloqueos de empresa/membresía sin sleeps. Una membresía válida no sustituye permisos. Las pruebas [de migración](../../apps/api/test/saphi/migrations.test.ts) crean una BD aislada de nombre aleatorio, aplican la base histórica + semillas y luego la migración nueva; conservan usuarios/configuración/auditoría y eliminan únicamente esa BD de prueba. El global setup existente verifica la instalación limpia en `app_test`.

El test de catálogo administrativo existente se adapta para incluir el nuevo módulo y comprueba adicionalmente que el administrador sin concesiones Saphi no pueda otorgarlas. No se eliminan pruebas ni se rebajan umbrales.

| Verificación | Resultado |
|---|---|
| `pnpm typecheck` | Cinco paquetes pasan |
| `pnpm test` | 300 tests pasan: shared29, ui6, saphi10, web105, api150 |
| Umbrales de cobertura | Todos los paquetes cumplen≥80% en las cuatro métricas; API97,79% líneas /86,18% ramas |
| pgTAP en `app_test` | 182 pruebas en nueve archivos pasan; incluye79 pruebas nuevas de estructura/aislamiento |
| Bundle API | Seis entradas, incluida Saphi, empaquetadas sin despliegue |
| Upgrade aislado | Usuarios, configuración y cadena de auditoría conservados; catálogo27 en instalación ya sembrada |
| Aplicación local | Solo la migración nueva aplicada con `supabase migration up --local`; sin reset |
| pgTAP tras migración local | Las mismas182 pruebas pasan sobre la instalación de desarrollo actualizada |
| Smoke local | Web y `/api/auth/config` responden200 tras la migración |

Para pgTAP en la BD descartable se creó el esquema de soporte `extensions`, que el global setup de API no crea; no se añadió a la migración agrícola. Se utilizó el pgTAP existente del entorno local. No se instalaron PostGIS/TimescaleDB ni herramientas nuevas. No se ejecutó reset de la base de trabajo, ninguna migración remota ni despliegue AWS. Las fixtures SQL se revierten; no se cargaron empresas ficticias en la base de desarrollo.

## Próxima fase

Requiere autorización independiente para Fase 4. Implementar primero administración empresarial segura y capacidades, luego repositorios y CRUD de maestros sobre el mismo `tx` de `authed`. Comparar `expectedVersion` en el WHERE/función de escritura: la versión automática de BD detecta cambios, pero no compara por sí sola un cuerpo HTTP. Conservar los menús sin enlaces hasta que sus vistas y guards estén disponibles. Resolver recuperación/último gestor y definir ámbito del piloto antes de datos operativos.
