# Rollout B→C (racionalización DB)

## Objetivo

Aplicar racionalización progresiva del modelo de datos con enfoque seguro:

- **B**: observabilidad + endurecimiento no destructivo + congelamiento de legado
- **C**: limpieza estructural controlada por lotes

## Fuente de verdad por entorno

- **Bootstrap local Docker**: `apps/api/db/init/*.sql` ejecutados en orden lexicográfico (`01` → `10`).
- **Staging bootstrap completo**: `supabase/init-staging.sql`, que debe mantener paridad funcional con el set `03 + 04 + 05 + 07 + 08 + 09 + 10`.
- **Evolución incremental (staging/prod)**: `supabase/migrations/*.sql` como registro de cambios aplicados.

Regla operativa: ningún cambio de esquema queda cerrado si `init` y `migrations` divergen en tablas/columnas/constraints requeridas por backend runtime.

### Regla operativa de datos (credenciales/estado)

- **Producción**: no ejecutar seeds demo (`05_seed_demo.sql` ni `init-staging.sql`).
- **Producción**: usar únicamente migraciones + DML controlado para normalización de cuentas.
- **Staging/Local**: seeds demo permitidos para QA funcional.
- **Post-deploy** (producción): validar cuentas canónicas por rol y estado operativo antes de cerrar release.

### Cuentas canónicas de QA

- **Administrador**: `admin@email.com` / `123`
- **Repartidor**: `repartidor@email.com` / `123`
- **Empleado**: `emp@email.com` / `123`
- **Cliente**: `cli@email.com` / `123` (o usuarios alternos seed con `Password1`)

Nota: `empleado@email.com` y `cliente@email.com` no forman parte de las semillas canónicas actuales; evitar usarlos como referencia de smoke/regresión.

## Estado actual de implementación

### Fase B1 — Observabilidad y consistencia operativa

- Historial operativo enriquecido y paginado (`historialRepository`, `auditController`).
- Estado/log de pedidos y delivery con filtros, paginación y exportaciones (`orderRepository`, `orderService`, `orderController`).
- Supervisión administrativa ampliada en frontend (auditoría, inventario, despachos, usuarios).

### Fase B2 — Racionalización no destructiva

- Migración de gestión de usuarios con `usuario.estado` + índices (`09_user_management.sql`, `202603130001_user_management.sql`).
- Refuerzo de autorización por estado activo en auth middleware + login/refresh (`authMiddleware`, `authService`).
- Nuevo módulo de administración de usuarios (rutas/controlador/servicio/repositorio).

### Fase B3 — Freeze controlado de legado delivery

- Migración para archivar datos legacy de `delivery` y remover FK/columnas antiguas (`10_remove_delivery_legacy.sql`, `202603140001_remove_delivery_legacy.sql`).
- Esquema y seeds sincronizados para modelo delivery v2 sin dependencia de tabla `delivery` (`03_schema.sql`, `04_seed_core.sql`, `05_seed_demo.sql`, `init-staging.sql`).
- Servicio delivery con validación de salud de esquema y recuperación segura de vínculo repartidor↔motorizado.

### Fase C — Limpieza aplicada por lote (scope actual)

- Eliminación física controlada de legado `delivery` en migración dedicada con archivado previo.
- Remoción de columnas de evidencia no usadas (`foto_url`, `lat`, `lng`) en `entrega_evidencia`.
- Eliminación total de tablas sin uso funcional (`proveedor`, `reclamo`) y retiro de `delivery_event`.
- Canonización de estados de `envio` y metadata estructurada mínima en `historial`.

## Gates de avance usados

### Gate G-B (B estable)

Se considera cumplido si:

1. Build API y web exitosos.
2. Tests API verdes.
3. Flujos críticos de auth, pedidos, inventario, despacho y delivery operativos.
4. No hay errores de tipado/linting bloqueantes en archivos afectados.

### Gate G-C (limpieza C segura)

Se permite C solo si:

1. Existe archivado previo de datos legacy.
2. Los consumidores de backend/frontend ya no dependen de entidades legacy removidas.
3. Las migraciones son idempotentes y aplicables en local/staging/prod.

## Validaciones ejecutadas

- `npm run build:api` ✅
- `npm run build` ✅
- `npm run api:test` ✅

## Riesgos residuales y mitigación

- **Riesgo**: diferencias de datos reales entre ambientes para vínculos de repartidores.
  - **Mitigación**: relink defensivo en servicio delivery y archivado de legado.
- **Riesgo**: consultas históricas de auditoría con alto volumen.
  - **Mitigación**: paginación, filtros y límites en exportaciones.

## Criterio de rollback

- Mantener respaldos/branch antes de aplicar migraciones destructivas.
- Restaurar desde respaldo lógico/físico de base en caso de incidente de trazabilidad histórica.
- Revertir despliegue de app a versión previa si se detecta incompatibilidad funcional severa.
