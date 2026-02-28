-- PostgreSQL indices

CREATE INDEX IF NOT EXISTS ix_producto_activo_cat ON producto (activo, id_categoria);
CREATE INDEX IF NOT EXISTS ix_inventario_producto ON inventario (id_producto);
CREATE INDEX IF NOT EXISTS ix_carrito_usuario ON carrito (id_usuario);

SELECT 1;