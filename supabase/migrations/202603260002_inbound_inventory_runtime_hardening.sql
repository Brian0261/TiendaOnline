ALTER TABLE entrada_inventario
ADD COLUMN IF NOT EXISTS id_usuario INT NULL REFERENCES usuario(id_usuario);

CREATE INDEX IF NOT EXISTS idx_entrada_inventario_inventario_fecha
  ON entrada_inventario (id_inventario, fecha_entrada DESC);
