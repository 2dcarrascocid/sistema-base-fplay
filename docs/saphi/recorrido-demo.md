# Recorrido de demostración local — datos completos

Datos ficticios para visualizar los módulos implementados. No representan empresas, personas, propiedades, mediciones ni recomendaciones agronómicas reales. Los puntos se agrupan cerca de Talca y Curicó, Región del Maule; no son deslindes ni levantamientos de terreno. Las lecturas y referencias satelitales se identifican como DEMO y no provienen de equipos o imágenes reales. El catálogo de resultados de laboratorio y los indicadores aún no tienen tablas operativas.

## Cargar o repetir

Con PostgreSQL local iniciado, desde la raíz del repositorio:

```powershell
pnpm --filter @base/api exec tsx dev/seed-saphi.ts --local-demo
```

El [script](../../apps/api/dev/seed-saphi.ts) se conecta exclusivamente a `127.0.0.1:54322/postgres`, exige la identidad local de desarrollo y rechaza `NODE_ENV=production`. No admite URL remota ni usa secretos AWS. Carga usuarios/perfiles, luego cada empresa con la conexión `app_api` y finalmente las tablas de ingesta y catálogo con el propietario local, ya que no hay permiso de escritura humana en ellas. Cada etapa usa una transacción. No modifica migraciones, semillas automáticas ni contraseñas.

Se puede repetir sin duplicar registros. Actualiza las coordenadas de los puntos DEMO existentes y añade los permisos DEMO faltantes; conserva los demás cambios. Migra el nombre de la segunda empresa DEMO de Colchagua a Curicó. No incluye borrado masivo ni reset. Si se desactivan empresas o cambian permisos necesarios, puede detenerse por las protecciones de acceso.

## Inventario inicial

| Empresa ficticia | Predios | Cuarteles | Puntos | Miembros |
| --- | ---: | ---: | ---: | ---: |
| DEMO Saphi Valle del Maule SpA | 3 | 6 | 36 | 5 (uno inactivo) |
| DEMO Saphi Valle de Curicó SpA | 3 | 6 | 36 | 4 |
| Total | 6 | 12 | 72 | 9 membresías |

Cada empresa tiene dos predios activos y uno inactivo, con dos cuarteles por predio. Sus puntos incluyen estados activos/inactivos. Los códigos `DEMO-P1`, etc. se repiten entre empresas deliberadamente para mostrar que la identidad y unicidad son empresariales. Hay suficientes puntos para mostrar **Siguiente** con el límite inicial de 25.

Además, cada empresa incorpora 18 muestras de suelo con tres fechas por cuartel, 6 dispositivos, 6 observaciones y 6 referencias de activos satelitales ficticias. Los 4 dispositivos activos de cada empresa tienen un binding local, un recibo de simulador y una lectura de humedad. Así quedan pobladas las tablas de datos del esquema `saphi`: empresas, membresías, permisos, predios, cuarteles, puntos, muestras, dispositivos, lecturas, observaciones, activos, bindings y recibos. Los activos ficticios no son descargables ni se usan como imágenes Sentinel-2.

## Cuentas locales

Todas utilizan la contraseña de desarrollo `Local-Dev-2026!` y MFA `123456` exclusivamente con el simulador local. Las cuentas demo tienen rol global **Usuario cliente** y perfiles Saphi específicos; ninguna es superusuario.

| Cuenta | Maule | Curicó |
| --- | --- | --- |
| `superadmin@local.test` (ya existente) | Gestión de módulos implementados | Gestión de módulos implementados |
| `gestora.saphi@local.test` | Gestión de módulos implementados | Gestión de módulos implementados |
| `operador.saphi@local.test` | Ver/crear/editar predios, cuarteles y puntos | Solo consulta territorial |
| `consulta.saphi@local.test` | Solo consulta territorial | Solo consulta territorial |
| `sinacceso.saphi@local.test` | Membresía inactiva, sin concesiones | Sin membresía |

El operador tiene el mismo techo global en ambas empresas y distintas concesiones empresariales. Consulta no puede ver miembros. La cuenta sin acceso puede iniciar sesión pero no obtiene empresas en el selector. No se otorgan permisos de módulos futuros ni se alteran los perfiles existentes de plataforma. El acceso del superusuario se asigna explícitamente mediante el gestor; no se introduce bypass RLS.

UUID de usuarios, para el formulario **Añadir miembro**:

| Usuario | UUID |
| --- | --- |
| Gestora | `de400000-0000-4000-8000-000000000001` |
| Operador | `de400000-0000-4000-8000-000000000002` |
| Consulta | `de400000-0000-4000-8000-000000000003` |
| Sin acceso | `de400000-0000-4000-8000-000000000004` |

## Recorrido recomendado

1. Abrir [Saphi local](http://localhost:5173/saphi/companies) y usar el superusuario actual. Recargar si la sesión estaba abierta antes de poblar. Se muestran ambas empresas.
2. Entrar a Maule y revisar razón social, RUT ficticio válido y contactos. Editar nombre comercial o teléfono con motivo; observar el incremento de versión. Evitar desactivar la empresa: su recuperación no está implementada.
3. Abrir **Predios**. Filtrar activos/inactivos; entrar a edición y modificar un nombre o superficie. Crear un predio propio con código único para ensayar el alta.
4. Abrir **Cuarteles**, filtrar por predio y revisar variedad, año, suelo y superficie. Crear un cuartel bajo un predio visible. Los campos son datos descriptivos, sin cálculos ni validación agronómica.
5. Abrir **Puntos de muestreo**. Probar filtro por cuartel, estado y **Siguiente**; cambiar un filtro reinicia el listado. Crear un punto con código único y seleccionar sus coordenadas en el mapa o introducirlas manualmente. No hay resultados de laboratorio.
6. Abrir **Miembros**. Revisar concesiones del operador, consulta y la membresía inactiva. Cambiar permisos del operador con motivo y versión. La propia membresía no puede editarse. No retirar permisos de administración a la gestora si se desea conservar este recorrido.
7. Cambiar a Curicó. Los recursos y filtros pertenecen a esa empresa; los nombres/códigos similares no comparten registros.
8. Cerrar sesión y entrar como operador. En Maule aparecen las acciones de creación/edición; en Curicó solo lectura. Con consulta desaparecen escritura y miembros; con sinacceso el selector queda vacío. Usar sesiones separadas de navegador si se comparan simultáneamente.
9. Volver al superusuario y abrir **Seguridad → Usuarios/Perfiles** para ver las cuatro identidades y los dos perfiles demo. En **Auditoría**, revisar los eventos `saphi.company.bootstrap`, `saphi.membership.changed`, `saphi.permissions.changed` y los eventos de maestros. La carga conserva el encadenamiento de auditoría; no lo desactiva.
10. Para comprobar conflicto de edición, abrir un registro en dos pestañas y guardar cambios desde ambas sin recargar la segunda. El segundo guardado muestra conflicto; recargar antes de reintentar.

La carga conserva la autenticación y autorización reales de la plataforma local: administración por funciones SQL estrechas y escrituras territoriales como `app_api`, con contexto empresarial, RLS y auditoría activos. Solo la creación explícita de identidades/perfiles de desarrollo utiliza el propietario local. El script imprime las URLs e inventario al finalizar.

## Verificación de la carga inicial

La versión anterior de la carga fue comprobada por HTTP y navegador. Esta ampliación requiere una nueva ejecución y verificación local tras iniciar PostgreSQL y disponer de Node.js y pnpm en el entorno.
