# Saphi Chile — 07. Pruebas y aceptación

Estado: **PLAN DE FASE 1 — pendiente de aprobación**. Define pruebas futuras; no afirma su ejecución. En esta fase solo se validan documentos y alcance, sin modificar código, instalar herramientas, ejecutar migraciones ni desplegar.

Referencias: [arquitectura](./01-arquitectura.md), [datos](./02-modelo-datos.md), [seguridad](./03-seguridad.md), [API](./04-api.md), [frontend](./05-frontend.md), [integraciones](./06-integraciones.md).

## Estrategia y entorno

Mantener Vitest, pgTAP y Vue Test Utils ya usados. API: BD local real con roles `app_api`/`app_auth` y dobles externos; no credenciales cloud. Pruebas de aplicación con puertos fake para fallos deterministas. `@base/saphi`: contratos y validadores puros, sin conexiones externas. Web: componentes/store/guard con Pinia, router, i18n y Vuetify del harness existente.

Ubicación futura: API y web `test/saphi/**/*.test.ts`; paquete `src/**/*.test.ts`; pgTAP en directorio actual de tests SQL hasta verificar recursividad. No reducir umbrales ni excluir módulos nuevos para lograr cobertura: mínimo80% en líneas, funciones, ramas y sentencias por paquete. Los adapters reales requieren suite contractual cuando existan; cobertura no sustituye prueba de IAM, transporte ni aislamiento.

El arranque local posterior a la auditoría respondió200 en web y configuración pública de API con Node24 temporal; esto es un smoke del sistema base, no prueba Saphi ni ejecución de suite. No repetir instalaciones ni iniciar/alterar servicios para esta fase documental. La suite API actual reconstruye `app_test`: ejecutar solamente en entorno local descartable explícito, nunca en BD de trabajo/productiva.

## Matriz trazable de pruebas futuras

| ID | Capa y escenario | Resultado esperado |
|---|---|---|
| UNIT01 | Contratos: UUID, códigos, campos desconocidos, límites, decimales y fechas | Rechazo coherente, sin eco de valores sensibles |
| UNIT02 | Intersección global/empresa y cálculo de capacidades | Sin permiso en cualquiera de las capas → denegar; no bypass superusuario |
| UNIT03 | Casos de uso con fallos de repositorio/auditoría | Escritura atómica, error controlado, sin efecto parcial |
| UNIT04 | Idempotencia: ID igual/hash igual; ID igual/hash distinto | Sin duplicado / conflicto sin sobrescritura |
| UNIT05 | Puertos IoT: identidad por cuenta y dispositivo, normalización | No confiar en companyId del payload, conservar instantes/unidades |
| UNIT06 | Estrategia de indicador no aprobada / unidad no aprobada | No calcular ni convertir; estado de definición pendiente |
| DB01 | PK, uniques, checks y FKs de cada tabla | Rechazo de duplicados/valores inválidos; relaciones válidas aceptadas |
| DB02 | Hijo de empresa A referencia padre B, incluso con UUID existente | Error por FK compuesta; sin fila parcial |
| DB03 | RLS con rol real `app_api`, sin actor/contexto/membresía | Cero filas en lectura, escritura denegada |
| DB04 | Grants PUBLIC/app_auth/roles Supabase; propietarios | Sin acceso Saphi inesperado; runtime no propietario ni BYPASSRLS |
| DB05 | Helpers privilegiados y RLS recursiva | `search_path` fijo, EXECUTE mínimo; consultas finitas, sin actor arbitrario |
| DB06 | Replay de migraciones y actualización desde base anterior | Tablas/políticas iguales, datos previos intactos, migraciones históricas sin cambios |
| DB07 | Rollback/commit y reutilización de la misma conexión | No quedan `app.user_id` ni `saphi.company_id` de la solicitud anterior |
| SEC01 | Global sí/contextual no; global no/contextual sí; ambos sí | Denegar, denegar, permitir solo con membresía/empresa activa |
| SEC02 | Usuario editor en A y lector en B | GET en ambas; PATCH solo en A; misma regla API, SQL y UI |
| SEC03 | Alterar URL, cuerpo, GUC, padre, cursor o UUID ajeno | No fuga ni escalamiento; errores404/400 según contrato |
| SEC04 | Bootstrap, autoasignación, concesión superior y último gestor | Bootstrap atómico; abusos denegados; revocaciones concurrentes serializadas |
| SEC05 | Superusuario sin membresía/concesión; rol admin global | Ninguno obtiene datos tenant automáticamente; bootstrap no da lectura general |
| SEC06 | Desactivar membresía/empresa, revocar sesión o permiso global | Próxima operación denegada conforme a snapshots/documentación; no caché autoritativa |
| SEC07 | Logs/auditoría, error SQL, secretos y fallo transaccional | Redacción, requestId, hash base intacto, sin falso evento de éxito |
| SEC08 | Dashboard, objetos, geometría, lista, detalles y filtros de otra empresa | Mismo aislamiento que CRUD; sin conteos o URLs filtrados |
| SEC09 | Sesión/MFA/contraseña pendientes de Base Fairplay | No acceso agrícola hasta completar requisitos; base conserva resultados |
| API01-24 | Endpoints definidos en contrato con C1..C8 aplicables | Método, permiso, DTO, error, versión y paginación conformes |
| API25 | Cursor límite/filtros/orden, múltiples páginas e inserción concurrente | Máximo100, cursor ligado al ámbito, orden determinista, sin duplicados recorridos |
| API26 | PATCH simultáneos de mismo expectedVersion | Solo uno confirma; otro409; sin lost update |
| UI01 | Selector, rutas puente y enlace empresarial directo | Guard espera capacidades y preserva únicamente destino interno permitido |
| UI02 | Solicitud lenta de A termina después de seleccionar B | Respuesta A descartada, estado B sin contaminación |
| UI03 | Logout,401/403/404/409 y refresh | Limpieza de stores, capacidades revalidadas, formulario recuperable |
| UI04 | es/en, móvil, teclado, lector de pantalla y tabla alternativa | Información usable sin color/mapa/canvas; nombres y unidades consistentes |
| INT01 | Reentrega, crash antes/después de commit y ack, DLQ | Procesamiento idempotente, sin pérdida declarada ni exactly-once ficticio |
| INT02 | Identidad externa revocada o ID compartido por cuentas distintas | Sin cruce de cuentas/empresas; binding revalidado |
| INT03 | Satélite: URL maliciosa, archivo inválido, licencia/índice ausente | Rechazo/cuarentena, sin SSRF, sin datos o índices fabricados |
| GIS01 | GeoJSON, límites, anillos, SRID y topología si se adopta PostGIS | Nivel de validación real; prueba espacial bloqueada hasta decisión |
| PERF01 | Volumen medido, consultas temporales y conexiones Lambda | Plan/índices y latencias dentro de presupuesto aprobado; sin benchmark ficticio |

## Fixtures y concurrencia

Dos empresas A/B, predios/cuarteles diferentes y códigos iguales permitidos entre empresas. Usuarios: editorA/lectorB; lectorA sin accesoB; usuario con techo global sin concesión; usuario con concesión sin techo; membresía inactiva; empresa inactiva; superusuario sin membresía; superusuario miembro explícito. Usar usuarios existentes en fixtures de prueba mediante el patrón base, sin crear otra tabla de identidades.

Pruebas negativas de lectura/escritura ejecutadas como `app_api` dentro de contexto real. Propietario solo prepara fixtures y verifica resultado, nunca demuestra RLS. Test de manipulación GUC debe probar que cambiar empresa sin membresía no basta, reconociendo que el rol runtime es de servidor confiable y no se entrega al frontend.

Carreras con barreras deterministas, no sleeps: dos revocaciones del último gestor, modificación de concesiones frente a escritura, cambio de empresa en UI, dos envíos de un mismo mensaje y dos PATCH con misma versión. Comprobar snapshot documentado; no exigir cancelación retroactiva de SELECT ya iniciado. Evitar contaminación entre archivos que comparten BD; conservar configuración de ejecución secuencial API actual.

## Regresiones obligatorias y ejecución posterior

Conservar suites de login local/federado, refresh/logout, MFA, recuperación, usuarios/perfiles, menús, configuración, auditoría y rate limiting. Validar bundles sin adapters locales/fakes desplegados; nueva Lambda debe quedar incluida en lista explícita de empaquetado. CI deberá incorporar tests de `@base/saphi`, además de `typecheck` recursivo.

Secuencia posterior autorizada: `pnpm typecheck`; tests shared/ui/web y nuevo paquete; build web; bundle API; BD local descartable y `pnpm db:test`; suite API. No ejecutar reset destructivo sobre BD de trabajo. Añadir smoke integrado web/API/BD en entorno local sin credenciales reales; servicios externos dobles claramente identificados. Validación de AWS real requiere etapa separada autorizada, sin despliegues automáticos por este plan.

## Criterios de aceptación y puertas de fase

**Fase 1 documental:** siete especificaciones y resumen presentes, enlaces internos válidos, términos/IDs/permiso coherentes entre documentos, decisiones aprobadas separadas de recomendaciones/preguntas, y diff limitado a documentación. Esta validación no prueba RLS ni funcionalidades todavía inexistentes.

**Entrada a Fase 2:** aprobación explícita de esta documentación y alcance de esqueleto; resolver o excluir expresamente contratos bloqueados; autorizar por separado cambios necesarios de manifiestos/registro de rutas. Acordar si Fase 2 incluye validadores con Zod y cómo se expondrán contratos sin datos tenant mientras aún no existen migraciones. Recomendación: contratos/puertos y pruebas puros; ninguna ruta de datos accesible antes de RLS de Fase 3. No sustituir por endpoints que devuelvan mediciones falsas.

**Salida de Fase 2 futura:** paquete/puertos acotados, imports sin ciclos, typecheck/tests/bundle aprobados, sin reglas agronómicas/proveedores reales ni infraestructura creada, y documentación de alcance real. Rutas solo si se autorizaron y su contrato es seguro sin esquema agrícola; no declarar CRUD terminado con stubs.

**Salida funcional de fases posteriores:** ≥80% por paquete, todos los casos críticos SEC/DB aplicables pasando, base sin regresiones, migraciones replay/upgrade verificadas y ninguna fuga A/B. Sin fórmulas o proveedores aprobados no se marca ese módulo como aceptado. Los SLA/rendimiento/costos necesitan valores del cliente antes de aceptar producción.
