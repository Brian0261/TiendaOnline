-- Governance hardening: ensure critical indexes exist in all environments
CREATE INDEX IF NOT EXISTS idx_entrada_inventario_fecha
  ON entrada_inventario (fecha_entrada DESC);

CREATE INDEX IF NOT EXISTS idx_entrada_inventario_usuario_fecha
  ON entrada_inventario (id_usuario, fecha_entrada DESC);

CREATE INDEX IF NOT EXISTS idx_entrada_inventario_inventario_fecha
  ON entrada_inventario (id_inventario, fecha_entrada DESC);

CREATE INDEX IF NOT EXISTS ix_inventario_producto
  ON inventario (id_producto);
