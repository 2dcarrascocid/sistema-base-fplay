# Uso local de los módulos maestros Saphi

Para visualizar el recorrido con datos ficticios optativos, consultar el [set demo y sus cuentas](./recorrido-demo.md). La carga es una acción local independiente; las migraciones no crean esos datos automáticamente.

Con Base Fairplay iniciado, abrir `/saphi/companies` desde la entrada **Saphi Chile** del menú. Las empresas que aparecen provienen de las membresías/permisos reales; no se cargan empresas ficticias al aplicar las migraciones.

## Primera empresa

1. Un operador de plataforma crea o habilita otra persona usuaria en los mantenedores existentes de usuarios/perfiles. Debe estar activa y tener permisos globales Saphi suficientes. Se reutilizan la invitación, sesiones y MFA de Base Fairplay.
2. El superusuario abre **Crear empresa**, ingresa los datos reales y selecciona esa otra persona como primera gestora. La búsqueda utiliza el directorio administrativo existente, accesible al superusuario; no expone ese directorio a gestores empresariales.
3. La lista de permisos muestra el techo global del destinatario. La primera gestora debe tener, como mínimo, `saphi.companies:view`, `saphi.memberships:view` y `saphi.memberships:edit`. Crear/editar requiere Ver del mismo recurso. Registrar un motivo.
4. El alta crea empresa, membresía, concesiones y auditoría en una transacción. El creador no obtiene membresía automática. La primera gestora inicia sesión con su propia identidad y selecciona la empresa.
5. Desde **Miembros**, una gestora puede añadir otra persona por su UUID existente y asignar permisos dentro del techo global y del alcance propio. Puede dar acceso explícito al superusuario original, cuyo ID fijo es compatible con el contrato. No puede cambiar sus propios permisos/membresía.

Los UUID se obtienen por canales administrativos autorizados; no existe búsqueda global de usuarios para gestores agrícolas. No se crean roles empresariales ni perfiles globales automáticamente. Si la empresa no aparece, comprobar usuario/empresa/membresía activos y permiso `companies:view` global y contextual.

## Predios, cuarteles y puntos

Desde la empresa se accede únicamente a los módulos permitidos. Crear primero predio, después cuartel y luego punto. La selección de padres también necesita permiso de lectura; las opciones adicionales se cargan explícitamente. Las superficies usan hectáreas con punto decimal y hasta cuatro decimales, sin conversiones. El punto requiere longitud y latitud reales; no hay un mapa ni validación de polígonos en esta fase.

La edición conserva la versión leída. Si otra operación modificó el registro, se muestra conflicto; recargar antes de volver a guardar. Los estados no borran físicamente registros. Desactivar una empresa requiere superusuario con acceso empresarial y confirmación; impide el acceso y su recuperación queda fuera de este CRUD inicial.

Cada empresa tiene sus propias concesiones. Un permiso global no basta para operar. Cambiar empresa o cerrar sesión limpia el estado; las respuestas tardías se descartan. Los menús y botones son una ayuda de navegación: la API y RLS autorizan cada petición.

## Límites

No hay datos de laboratorio/IoT/satélite/riego/indicadores ni fórmulas agronómicas. La configuración AWS está preparada pero no desplegada. La API local utiliza los mismos handlers y PostgreSQL local; los dobles externos de autenticación/correo continúan siendo exclusivamente de desarrollo.
