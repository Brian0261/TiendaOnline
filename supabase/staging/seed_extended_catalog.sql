-- Extiende el catalogo de staging sin resetear la base.
-- Script idempotente: se puede ejecutar multiples veces sin duplicar filas.

BEGIN;

-- 1) Asegurar marcas requeridas para el catalogo demo extendido
WITH required_brands(name) AS (
  VALUES
    ('Gloria'),
    ('Nestle'),
    ('Coca-Cola'),
    ('Alicorp'),
    ('San Fernando'),
    ('Genérico'),
    ('Primor'),
    ('Don Vittorio'),
    ('Bolivar'),
    ('Lay''s'),
    ('Oral-B'),
    ('Doritos'),
    ('Redondos'),
    ('La Florencia'),
    ('Bimbo'),
    ('Snax')
)
INSERT INTO marca (nombre_marca)
SELECT rb.name
FROM required_brands rb
WHERE NOT EXISTS (
  SELECT 1
  FROM marca m
  WHERE LOWER(m.nombre_marca) = LOWER(rb.name)
);

-- 2) Insertar productos faltantes (referenciando categoria/marca por nombre, no por IDs)
WITH product_seed(nombre_producto, descripcion, precio, imagen, categoria, marca, stock) AS (
  VALUES
    ('Leche Gloria 1L', 'Leche entera 1L', 4.50, '/api/uploads/images/leche-gloria-1l.webp', 'Lácteos', 'Gloria', 100),
    ('Arroz Costeño 5kg', 'Arroz extra 5kg', 18.90, '/api/uploads/images/arroz-costeno-5kg.webp', 'Abarrotes', 'Alicorp', 150),
    ('Coca-Cola 3L', 'Gaseosa 3L', 10.50, '/api/uploads/images/coca-cola-3l.webp', 'Bebidas', 'Coca-Cola', 200),
    ('Aceite Primor 900ml', 'Aceite vegetal', 8.20, '/api/uploads/images/aceite-primor-900.webp', 'Abarrotes', 'Primor', 80),
    ('Pollo Entero 1kg', 'Pollo entero 1 kg', 12.80, '/api/uploads/images/pollo-sf-1kg.webp', 'Carnes', 'San Fernando', 50),
    ('Yogur Gloria Fresa 1L', 'Yogur sabor fresa 1 litro', 6.30, '/api/uploads/images/yogur-fresa-1l.webp', 'Lácteos', 'Gloria', 120),
    ('Spaghetti Don Vittorio 500g', 'Pasta spaghetti 500 g', 3.20, '/api/uploads/images/spaghetti-500g.webp', 'Abarrotes', 'Don Vittorio', 90),
    ('Jugo Del Valle 1L', 'Jugo de frutas surtidas 1 L', 5.90, '/api/uploads/images/jugo-del-valle-1l.webp', 'Bebidas', 'Coca-Cola', 180),
    ('Jabón Bolivar 200g', 'Jabón de lavar ropa 200 g', 4.80, '/api/uploads/images/jabon-bolivar-200g.webp', 'Limpieza', 'Bolivar', 70),
    ('Papas Fritas Lays 140g', 'Snack de papas 140 g', 6.50, '/api/uploads/images/lays-140g.webp', 'Snacks', 'Lay''s', 110),
    ('Carne Molida Premium', 'Carne molida de res', 18.50, '/api/uploads/images/carne-molida.webp', 'Carnes', 'Genérico', 45),
    ('Cepillo Eléctrico Oral-B', 'Cepillo dental electrico', 125.00, '/api/uploads/images/cepillo-electrico-oralb.webp', 'Cuidado Personal', 'Oral-B', 25),
    ('Doritos Queso 100g', 'Tortillas de maiz sabor queso', 7.50, '/api/uploads/images/doritos-queso-atrevido-100g.webp', 'Snacks', 'Doritos', 60),
    ('Fresa Congelada 1kg', 'Fresa congelada 1 kg', 18.90, '/api/uploads/images/fresa-entera-congelada-el-frutero-1kg.webp', 'Congelados', 'Genérico', 40),
    ('Hamburguesa de Pollo 360g', 'Hamburguesa empanizada', 15.90, '/api/uploads/images/hamburguesa-pollo-redondos-360g.webp', 'Congelados', 'Redondos', 55),
    ('Manzana Roja 1kg', 'Manzana roja fresca 1 kg', 7.90, '/api/uploads/images/manzana-roja-1kg.webp', 'Frutas y Verduras', 'Genérico', 70),
    ('Pan Carioca 400g', 'Pan carioca en bolsa', 6.50, '/api/uploads/images/pan-carioca-la-florencia-400g.webp', 'Panadería', 'La Florencia', 60),
    ('Pan de Molde Blanco 500g', 'Pan de molde blanco', 7.50, '/api/uploads/images/pan-molde-blanco-la-florencia-500g.webp', 'Panadería', 'La Florencia', 45),
    ('Pan de Molde Bimbo XL 770g', 'Pan de molde XL 770 g', 12.90, '/api/uploads/images/pan-molde-blanco-bimbo-xl-770g.webp', 'Panadería', 'Bimbo', 80),
    ('Piqueo Snax 110g', 'Snack sabor original', 6.90, '/api/uploads/images/piqueo-snax-original-110g.webp', 'Snacks', 'Snax', 75),
    ('Condimento SIBARITA Palillo amarillito Sobre 32.4Gr', 'Condimento SIBARITA Palillo amarillito Sobre 32.4Gr', 1.00, '/api/uploads/images/sibarita_palillo_amarillito_32.4g.webp', 'Abarrotes', 'Alicorp', 100)
),
inserted AS (
  INSERT INTO producto (nombre_producto, descripcion, precio, imagen, id_categoria, id_marca)
  SELECT
    ps.nombre_producto,
    ps.descripcion,
    ps.precio,
    ps.imagen,
    c.id_categoria,
    m.id_marca
  FROM product_seed ps
  JOIN categoria c ON LOWER(c.nombre_categoria) = LOWER(ps.categoria)
  JOIN marca m ON LOWER(m.nombre_marca) = LOWER(ps.marca)
  WHERE NOT EXISTS (
    SELECT 1
    FROM producto p
    WHERE LOWER(p.nombre_producto) = LOWER(ps.nombre_producto)
  )
  RETURNING id_producto, nombre_producto
)
SELECT COUNT(*) AS inserted_products
FROM inserted;

-- 3) Asegurar stock en almacen central para cada producto seed
WITH product_seed(nombre_producto, stock) AS (
  VALUES
    ('Leche Gloria 1L', 100),
    ('Arroz Costeño 5kg', 150),
    ('Coca-Cola 3L', 200),
    ('Aceite Primor 900ml', 80),
    ('Pollo Entero 1kg', 50),
    ('Yogur Gloria Fresa 1L', 120),
    ('Spaghetti Don Vittorio 500g', 90),
    ('Jugo Del Valle 1L', 180),
    ('Jabón Bolivar 200g', 70),
    ('Papas Fritas Lays 140g', 110),
    ('Carne Molida Premium', 45),
    ('Cepillo Eléctrico Oral-B', 25),
    ('Doritos Queso 100g', 60),
    ('Fresa Congelada 1kg', 40),
    ('Hamburguesa de Pollo 360g', 55),
    ('Manzana Roja 1kg', 70),
    ('Pan Carioca 400g', 60),
    ('Pan de Molde Blanco 500g', 45),
    ('Pan de Molde Bimbo XL 770g', 80),
    ('Piqueo Snax 110g', 75),
    ('Condimento SIBARITA Palillo amarillito Sobre 32.4Gr', 100)
),
central_warehouse AS (
  SELECT id_almacen
  FROM almacen
  ORDER BY id_almacen
  LIMIT 1
)
INSERT INTO inventario (cantidad_disponible, id_producto, id_almacen)
SELECT
  ps.stock,
  p.id_producto,
  cw.id_almacen
FROM product_seed ps
JOIN producto p ON LOWER(p.nombre_producto) = LOWER(ps.nombre_producto)
CROSS JOIN central_warehouse cw
WHERE NOT EXISTS (
  SELECT 1
  FROM inventario i
  WHERE i.id_producto = p.id_producto
    AND i.id_almacen = cw.id_almacen
);

COMMIT;

SELECT 'Seed extendido aplicado en staging' AS resultado;
