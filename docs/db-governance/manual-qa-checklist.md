# Checklist QA manual (post B→C)

## 0) Cuentas canónicas para pruebas por rol

- [ ] `ADMINISTRADOR`: `admin@email.com` / `123`
- [ ] `EMPLEADO`: `emp@email.com` / `123`
- [ ] `REPARTIDOR`: `repartidor@email.com` / `123`
- [ ] `CLIENTE`: `cli@email.com` / `123` (alternos seed válidos con `Password1`)

Notas:

- [ ] No usar `cliente@email.com` ni `empleado@email.com` como cuentas base de smoke (no canónicas).
- [ ] En producción, validar primero que las cuentas canónicas existan y estén operativas antes de ejecutar el resto del checklist.

## 1) Autenticación y roles

- [ ] Login `CLIENTE` activo funciona.
- [ ] Login `EMPLEADO` activo funciona.
- [ ] Login `REPARTIDOR` activo funciona.
- [ ] Usuario inactivo no puede iniciar sesión.
- [ ] Refresh token de usuario inactivo es rechazado.

## 1.1) Recuperación de contraseña (local / staging)

- [ ] Forgot password con correo existente responde mensaje genérico y envía correo.
- [ ] Forgot password con correo inexistente responde el mismo mensaje genérico (sin enumeración).
- [ ] Correo recibido incluye URL de reset correcta por entorno (`localhost` en local, dominio staging en staging).
- [ ] Reset password con token válido cambia la contraseña y permite login posterior.
- [ ] Token de reset no puede reutilizarse (segundo intento falla).
- [ ] Token inválido o expirado retorna error controlado.
- [ ] Contraseña débil es rechazada en frontend y backend.
- [ ] Login, verify-email, refresh y logout siguen funcionando tras los cambios.

## 2) Dashboard administrador

- [ ] Sección Usuarios lista/pagina correctamente.
- [ ] Crear empleado/repartidor funciona.
- [ ] Desactivar/reactivar usuario funciona y audita en historial.
- [ ] Inventario admin: KPIs, filtros, paginación y export CSV.
- [ ] Auditoría admin: filtros por módulo/acción/usuario/fechas y navegación contextual.

## 3) Dashboard empleado

- [ ] Pedidos pendientes: filtros + export.
- [ ] Historial de estados: filtros + paginación + export.
- [ ] Inventario operativo: filtros + export.
- [ ] Despachos: registrar salida + listado paginado + export.
- [ ] Delivery: cola, asignación de repartidor y detalle por pedido.

## 4) Dashboard repartidor

- [ ] Mis envíos filtran por estado.
- [ ] Iniciar ruta funciona.
- [ ] Marcar entregado con receptor/dni/observación funciona.
- [ ] Marcar no entregado con motivo funciona.

## 5) Consistencia de datos

- [ ] Envíos nuevos no dependen de `delivery.id_delivery`.
- [ ] Envíos usan estados canónicos (`PENDIENTE`, `ASIGNADO`, `EN_RUTA`, `ENTREGADO`, `NO_ENTREGADO`, `REPROGRAMADO`).
- [ ] Historial registra eventos de transición/delivery/despacho.
- [ ] Historial expone `modulo`/`entidad`/`referencia_id` cuando aplica para navegación y filtros.
- [ ] Motorizado puede relinkearse a usuario repartidor activo cuando aplica.

## 6) Migraciones

- [ ] `202603150000_payments_mercadopago.sql` aplicada sin error.
- [ ] `202603130001_user_management.sql` aplicada sin error.
- [ ] `202603140001_remove_delivery_legacy.sql` aplicada sin error.
- [ ] `202603150001_drop_proveedor_reclamo.sql` aplicada sin error.
- [ ] `202603150002_drop_delivery_event.sql` aplicada sin error.
- [ ] `202603150003_refactor_envio_estado.sql` aplicada sin error.
- [ ] `202603150004_refactor_historial_comprobante.sql` aplicada sin error.
- [ ] `202603150005_refactor_motorizado_integrity.sql` aplicada sin error.
- [ ] `202603150006_fix_text_mojibake.sql` aplicada sin error.

## 7) Prevención de reincidencia (producción)

- [ ] No se ejecutaron seeds demo (`05_seed_demo.sql` / `init-staging.sql`) en producción.
- [ ] La normalización de cuentas se aplicó solo vía DML controlado.
- [ ] Smoke de post-deploy por rol ejecutado y evidenciado con respuestas JSON (`/api/auth/me`, dashboard admin, envíos repartidor).
