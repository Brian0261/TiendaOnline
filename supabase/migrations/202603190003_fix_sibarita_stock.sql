BEGIN;

WITH target_product AS (
  SELECT id_producto
  FROM producto
  WHERE LOWER(nombre_producto) = LOWER('Condimento SIBARITA Palillo amarillito Sobre 32.4Gr')
  LIMIT 1
),
central_warehouse AS (
  SELECT id_almacen
  FROM almacen
  ORDER BY id_almacen
  LIMIT 1
)
INSERT INTO inventario (cantidad_disponible, id_producto, id_almacen)
SELECT
  100,
  tp.id_producto,
  cw.id_almacen
FROM target_product tp
CROSS JOIN central_warehouse cw
WHERE NOT EXISTS (
  SELECT 1
  FROM inventario i
  WHERE i.id_producto = tp.id_producto
    AND i.id_almacen = cw.id_almacen
);

UPDATE inventario i
SET cantidad_disponible = 100
FROM producto p
WHERE i.id_producto = p.id_producto
  AND LOWER(p.nombre_producto) = LOWER('Condimento SIBARITA Palillo amarillito Sobre 32.4Gr')
  AND i.cantidad_disponible < 100;

COMMIT;