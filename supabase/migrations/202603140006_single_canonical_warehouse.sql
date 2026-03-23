-- Consolidación segura de inventario hacia un único almacén canónico.
-- Mantiene compatibilidad con id_inventario e historial de movimientos.

BEGIN;

DO $$
DECLARE
  canonical_warehouse_id INT;
BEGIN
  SELECT id_almacen
  INTO canonical_warehouse_id
  FROM almacen
  ORDER BY id_almacen ASC
  LIMIT 1;

  IF canonical_warehouse_id IS NULL THEN
    INSERT INTO almacen (nombre_almacen, direccion, telefono, responsable)
    VALUES ('Tienda Principal', 'Av. Principal 123, Lima', '(01) 123-4567', 'Sistema')
    RETURNING id_almacen INTO canonical_warehouse_id;
  END IF;

  CREATE TEMP TABLE tmp_inventory_agg AS
  SELECT
    id_producto,
    COALESCE(SUM(cantidad_disponible), 0)::INT AS stock_total,
    MAX(fecha_ultima_actualizacion) AS last_update
  FROM inventario
  GROUP BY id_producto;

  CREATE TEMP TABLE tmp_inventory_target AS
  SELECT
    a.id_producto,
    (
      SELECT i.id_inventario
      FROM inventario i
      WHERE i.id_producto = a.id_producto
        AND i.id_almacen = canonical_warehouse_id
      ORDER BY i.id_inventario ASC
      LIMIT 1
    ) AS target_id_inventario
  FROM tmp_inventory_agg a;

  INSERT INTO inventario (cantidad_disponible, fecha_ultima_actualizacion, id_producto, id_almacen)
  SELECT
    a.stock_total,
    COALESCE(a.last_update, NOW()),
    a.id_producto,
    canonical_warehouse_id
  FROM tmp_inventory_agg a
  LEFT JOIN tmp_inventory_target t ON t.id_producto = a.id_producto
  WHERE t.target_id_inventario IS NULL;

  UPDATE tmp_inventory_target t
  SET target_id_inventario = v.id_inventario
  FROM (
    SELECT i.id_producto, MIN(i.id_inventario) AS id_inventario
    FROM inventario i
    WHERE i.id_almacen = canonical_warehouse_id
    GROUP BY i.id_producto
  ) v
  WHERE v.id_producto = t.id_producto;

  CREATE TEMP TABLE tmp_inventory_map AS
  SELECT
    i.id_inventario AS old_id_inventario,
    t.target_id_inventario AS new_id_inventario
  FROM inventario i
  INNER JOIN tmp_inventory_target t ON t.id_producto = i.id_producto;

  UPDATE inventario tgt
  SET
    cantidad_disponible = a.stock_total,
    fecha_ultima_actualizacion = COALESCE(a.last_update, NOW()),
    id_almacen = canonical_warehouse_id
  FROM tmp_inventory_target t
  INNER JOIN tmp_inventory_agg a ON a.id_producto = t.id_producto
  WHERE tgt.id_inventario = t.target_id_inventario;

  UPDATE entrada_inventario ei
  SET id_inventario = m.new_id_inventario
  FROM tmp_inventory_map m
  WHERE ei.id_inventario = m.old_id_inventario
    AND m.old_id_inventario <> m.new_id_inventario;

  UPDATE salida_inventario si
  SET id_inventario = m.new_id_inventario
  FROM tmp_inventory_map m
  WHERE si.id_inventario = m.old_id_inventario
    AND m.old_id_inventario <> m.new_id_inventario;

  UPDATE pedido_inventario_mov pm
  SET id_inventario = m.new_id_inventario
  FROM tmp_inventory_map m
  WHERE pm.id_inventario = m.old_id_inventario
    AND m.old_id_inventario <> m.new_id_inventario;

  DELETE FROM inventario i
  USING tmp_inventory_map m
  WHERE i.id_inventario = m.old_id_inventario
    AND m.old_id_inventario <> m.new_id_inventario;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_inventario_producto_almacen'
  ) THEN
    ALTER TABLE inventario
    ADD CONSTRAINT uq_inventario_producto_almacen UNIQUE (id_producto, id_almacen);
  END IF;
END $$;

COMMIT;
