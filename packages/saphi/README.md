# @base/saphi

Contratos de Saphi compartidos entre API y futuros módulos Vue, según [Fase 1](../../specs/saphi/01-arquitectura.md).

- DTO: empresa, predio, cuartel, punto de muestreo, membresía, paginación y capacidades empresariales.
- Fase 5: DTO y alta de muestra de suelo inmutable, filtros de período con ISO/zona horaria explícita y validación de orden temporal. No contiene un catálogo agronómico ni autoriza resultados de análisis.
- Fase 6: dispositivos, metadatos descriptivos acotados, versiones y consultas de telemetría por período/dispositivo/magnitud. DTO de lecturas con valores decimales de origen como cadenas. No incluye credenciales, validación de proveedor ni un catálogo de unidades aprobado.
- Fase 7: filtros de catálogo satelital por cuartel/período y DTO de observaciones con procedencia, licencia y activos opacos. Estados explícitos de índices/descarga pendientes; sin URLs, secretos, proveedor seleccionado ni fórmulas.
- Validadores Zod estrictos: GUID compatible con la base/ámbito, paginación estructural, versiones, RUT canónico reutilizado, superficie decimal, maestros, bootstrap y administración empresarial.
- Referencias al catálogo de permisos de Base Fairplay: las constantes no crean ni conceden permisos.
- Contratos de intercambio IoT/satélite tipados, todavía sin validadores de proveedor, catálogos de unidades, rangos agronómicos o fórmulas.

No contiene infraestructura, autenticación, repositorios PostgreSQL ni componentes Vue. Un DTO de capacidades o un UUID de empresa no prueban autorización. La API deberá verificar membresía, techo global, concesión empresarial y RLS dentro de la misma transacción.

La Fase 4 agrega contratos administrativos y puntos GeoJSON sin mapas ni topología de polígonos. Los contratos dependientes de catálogos/proveedores permanecen pendientes; TypeScript no valida datos externos en runtime. El cursor de paginación tiene validación estructural en este paquete; el servidor autentica su contenido y ámbito y no acepta un cursor como autoridad.

Comandos desde la raíz, con Node24 y dependencias del workspace enlazadas:

```sh
pnpm --filter @base/saphi typecheck
pnpm --filter @base/saphi test
```

Mínimo80% de cobertura en las cuatro métricas, sin excluir lógica de negocio nueva. Los exports son TypeScript fuente, siguiendo la convención de los paquetes existentes.
