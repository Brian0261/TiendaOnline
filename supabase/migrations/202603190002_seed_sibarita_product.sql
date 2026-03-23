BEGIN;

WITH upsert_product AS (
  INSERT INTO producto (nombre_producto, descripcion, precio, imagen, id_categoria, id_marca)
  SELECT
    'Condimento SIBARITA Palillo amarillito Sobre 32.4Gr',
    'Condimento SIBARITA Palillo amarillito Sobre 32.4Gr',
    1.00,
    '/api/uploads/images/sibarita_palillo_amarillito_32.4g.webp',
    c.id_categoria,
    m.id_marca
  FROM categoria c
  JOIN marca m ON LOWER(m.nombre_marca) = LOWER('Alicorp')
  WHERE LOWER(c.nombre_categoria) = LOWER('Abarrotes')
    AND NOT EXISTS (
      SELECT 1
      FROM producto p
      WHERE LOWER(p.nombre_producto) = LOWER('Condimento SIBARITA Palillo amarillito Sobre 32.4Gr')
    )
  RETURNING id_producto
),
target_product AS (
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

COMMIT;