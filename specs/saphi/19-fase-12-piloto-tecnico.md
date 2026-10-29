# Saphi Chile — Fase 12: ejecución técnica del piloto local

Fecha: 2026-10-28. El usuario solicitó continuar con la siguiente fase y resolver los pendientes al final. Se toma como siguiente paso operativo la ejecución técnica del [piloto preparado en Fase 11](./18-fase-11-piloto.md). Esta denominación extiende el plan original, que terminaba en Fase 10; no representa autorización de despliegue ni definición de reglas pendientes.

**Resultado: piloto técnico de consultas, acceso y sesiones ejecutado correctamente.** Se difieren las decisiones del cliente al [registro único de cierre](../../docs/saphi/pendientes-cierre.md). No se solicita resolverlas para completar los recorridos que ya son verificables localmente.

## Ejecución y evidencia

Se creó y ejecutó el [script de piloto local](../../apps/api/scripts/pilot-local.mjs) contra la API de desarrollo real, mediante HTTP en `127.0.0.1:3000`, conectado a la base local de trabajo. Fecha de resultado: **2026-10-28T14:48:00.989Z**. Identidad/MFA y servicios externos son simuladores locales; no es una prueba de AWS o de proveedores reales.

```powershell
node apps/api/scripts/pilot-local.mjs --local-pilot
```

El script usa únicamente las cuatro cuentas demo existentes, destino local fijo, peticiones con timeout de veinte segundos y redirecciones prohibidas. Exige `--local-pilot` y rechaza `NODE_ENV=production`. No admite una URL remota configurable. No escribe datos agrícolas ni perfiles o concesiones; los únicos POST son login, desafío MFA y logout. Cierra las sesiones propias en `finally` y comprueba que los tokens dejan de dar acceso. No imprime tokens, cookies ni cuerpos de autenticación.

Ejecuta **648 verificaciones**, incluidas comprobaciones repetidas de pertenencia e identidad por cada fila y cuenta. No son 648 casos de negocio independientes ni se suman al número de pruebas de Fase 10. No se reconstruyó ninguna base, ejecutó semilla o modificó un permiso para obtener el resultado.

| Cuenta demo | Empresas visibles | Permiso de editar predios Maule / Colchagua | Lecturas comprobadas |
|---|---:|---|---|
| Gestora | 2 | Sí / Sí | 3 predios, 6 cuarteles y 36 puntos por empresa |
| Operador | 2 | Sí / No | Mismos volúmenes, con capacidades distintas según empresa |
| Consulta | 2 | No / No | Consulta territorial sin capacidad de edición |
| Sin acceso | 0 | Sin acceso empresarial | Capacidades y predios denegados con 404 en ambas empresas |

### Recorridos comprobados

- Petición anónima al selector: 401.
- Login y desafío MFA con cada cuenta; rol global cliente conservado.
- Selector limitado exactamente a las empresas demo esperadas para cada cuenta.
- Capacidades de edición de predios diferenciadas por empresa, sin cambiar el techo global del operador.
- Predios/cuarteles con `companyId` de su ámbito en todas las filas devueltas.
- Puntos en dos páginas por empresa (25 + 11): 36 IDs únicos, pertenencia correcta, `hasMore` y cursor coherentes, paginación terminada.
- Consultar en Colchagua un cuartel conocido de Maule devuelve 404.
- Dashboard sin concesión demo: 403, sin forzar habilitación.
- Logout con cookie y CSRF de la sesión recién creada: 204; el access token anterior devuelve 401.

PIL01–PIL04, PIL06 y PIL11 del plan cuentan con evidencia técnica HTTP en su parte de consultas/acceso/sesiones. PIL05 tiene evidencia de capacidades y rechazo de acceso indirecto; no se ensayó una escritura de negocio en esta ejecución. Los recorridos visuales de Fase 10 se conservan como evidencia previa y no se presentan como repetidos ahora.

## Alcance diferido sin bloquear esta ejecución

PIL07/PIL08 (escrituras agrícolas y muestras) quedan diferidos; este recorrido no crea registros para luego intentar borrarlos. PIL09/PIL10 positivos requieren habilitación explícita y, para mediciones o archivos reales, sus fuentes aprobadas. Se comprobó su denegación cuando corresponde; eso no equivale a aceptar el flujo positivo de integración.

Las fórmulas, catálogos, fabricantes, fuentes/licencias, políticas de archivos, participantes y aceptación del cliente siguen **pendientes, por resolver al cierre**. Diferir una decisión no equivale a elegir un valor por defecto o aprobarla. El registro de cierre reúne las dependencias y su evidencia necesaria.

## Verificación del entregable

El script se ejecutó con resultado `passed` y salida sin secretos de sesión. Se comprueban sintaxis, enlaces documentales y `git diff --check`. La línea base de 411 pruebas automatizadas y 263 comprobaciones pgTAP corresponde a [Fase 10](./17-fase-10-validacion.md); no se declara una nueva ejecución de esas suites en esta fase. El nuevo script operativo no forma parte de los bundles Lambda y no modifica código de negocio.

**Cierre técnico:** ejecución local completada para el alcance descrito, con decisiones diferidas documentadas. No hay aceptación del cliente registrada, despliegue, modificación de seguridad ni integración externa. Los siguientes trabajos deben permanecer dentro de alcances definidos que no dependan de inventar las decisiones diferidas.
