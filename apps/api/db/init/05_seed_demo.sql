-- PostgreSQL seeds demo

-- USUARIOS (bcrypt hash para DEV)
-- Password DEV: Password1 (excepto cli@email.com, emp@email.com, admin@email.com => 123)
-- email_verificado=1 para no bloquear logins demo
INSERT INTO usuario (nombre, apellido, email, contrasena, telefono, direccion_principal, rol, email_verificado) VALUES
('Juan', 'Pérez', 'cli@email.com', '$2a$10$tKJ56pQTAAvrb8Uerajsyuq5h30XvGp6NBaqwRGwZpF/ZkPsjUMPS', '987654321', 'Av. Lima 123', 'CLIENTE', true),
('María', 'Gómez', 'emp@email.com', '$2a$10$tKJ56pQTAAvrb8Uerajsyuq5h30XvGp6NBaqwRGwZpF/ZkPsjUMPS', '987654322', 'Av. Arequipa 456', 'EMPLEADO', true),
('Carlos', 'López', 'admin@email.com', '$2a$10$tKJ56pQTAAvrb8Uerajsyuq5h30XvGp6NBaqwRGwZpF/ZkPsjUMPS', '987654323', 'Jr. Cusco 789', 'ADMINISTRADOR', true),
('Diego', 'Reyes', 'repartidor@email.com', '$2a$10$tKJ56pQTAAvrb8Uerajsyuq5h30XvGp6NBaqwRGwZpF/ZkPsjUMPS', '987654331', 'Av. Delivery 100', 'REPARTIDOR', true),
('Ana', 'Rodríguez', 'ana@email.com', '$2a$10$B5o9vCtVsQC9xGNbeQjfleBj.ZpUNIK/3uO8KJwCUVsOTiedHdu0K', '987654324', 'Av. Tacna 321', 'CLIENTE', true),
('Luis', 'Martínez', 'luis@email.com', '$2a$10$B5o9vCtVsQC9xGNbeQjfleBj.ZpUNIK/3uO8KJwCUVsOTiedHdu0K', '987654325', 'Jr. Ayacucho 654', 'CLIENTE', true),
('Pedro', 'Sánchez', 'pedro@email.com', '$2a$10$B5o9vCtVsQC9xGNbeQjfleBj.ZpUNIK/3uO8KJwCUVsOTiedHdu0K', '987654326', 'Av. Bolívar 987', 'ADMINISTRADOR', true),
('Laura', 'Díaz', 'laura@email.com', '$2a$10$B5o9vCtVsQC9xGNbeQjfleBj.ZpUNIK/3uO8KJwCUVsOTiedHdu0K', '987654327', 'Jr. Huancavelica 654', 'EMPLEADO', true),
('Sofía', 'Hernández', 'sofia@email.com', '$2a$10$B5o9vCtVsQC9xGNbeQjfleBj.ZpUNIK/3uO8KJwCUVsOTiedHdu0K', '987654328', 'Av. Salaverry 321', 'CLIENTE', true),
('Miguel', 'Torres', 'miguel@email.com', '$2a$10$B5o9vCtVsQC9xGNbeQjfleBj.ZpUNIK/3uO8KJwCUVsOTiedHdu0K', '987654329', 'Jr. Junín 159', 'CLIENTE', true),
('Elena', 'Ruiz', 'elena@email.com', '$2a$10$B5o9vCtVsQC9xGNbeQjfleBj.ZpUNIK/3uO8KJwCUVsOTiedHdu0K', '987654330', 'Av. Brasil 753', 'CLIENTE', true)
ON CONFLICT (email) DO UPDATE
SET
	nombre = EXCLUDED.nombre,
	apellido = EXCLUDED.apellido,
	contrasena = EXCLUDED.contrasena,
	telefono = EXCLUDED.telefono,
	direccion_principal = EXCLUDED.direccion_principal,
	rol = EXCLUDED.rol,
	email_verificado = EXCLUDED.email_verificado;

INSERT INTO usuario (nombre, apellido, email, contrasena, telefono, direccion_principal, rol, email_verificado) VALUES
('Jorge', 'Vargas', 'repartidor2@email.com', '$2a$10$tKJ56pQTAAvrb8Uerajsyuq5h30XvGp6NBaqwRGwZpF/ZkPsjUMPS', '987111112', 'Av. Delivery 101', 'REPARTIDOR', true),
('Daniel', 'Quispe', 'repartidor3@email.com', '$2a$10$tKJ56pQTAAvrb8Uerajsyuq5h30XvGp6NBaqwRGwZpF/ZkPsjUMPS', '987111113', 'Av. Delivery 102', 'REPARTIDOR', true),
('Fernando', 'Salas', 'repartidor4@email.com', '$2a$10$tKJ56pQTAAvrb8Uerajsyuq5h30XvGp6NBaqwRGwZpF/ZkPsjUMPS', '987111114', 'Av. Delivery 103', 'REPARTIDOR', true),
('Ricardo', 'Mendoza', 'repartidor5@email.com', '$2a$10$tKJ56pQTAAvrb8Uerajsyuq5h30XvGp6NBaqwRGwZpF/ZkPsjUMPS', '987111115', 'Av. Delivery 104', 'REPARTIDOR', true)
ON CONFLICT (email) DO UPDATE
SET
	nombre = EXCLUDED.nombre,
	apellido = EXCLUDED.apellido,
	contrasena = EXCLUDED.contrasena,
	telefono = EXCLUDED.telefono,
	direccion_principal = EXCLUDED.direccion_principal,
	rol = EXCLUDED.rol,
	email_verificado = EXCLUDED.email_verificado;

-- Vincular usuario repartidor demo con un motorizado
UPDATE motorizado
SET id_usuario = (SELECT id_usuario FROM usuario WHERE email = 'repartidor@email.com')
WHERE id_motorizado = 1;

UPDATE motorizado m
SET
	nombre = u.nombre,
	apellido = u.apellido,
	telefono = COALESCE(NULLIF(u.telefono, ''), m.telefono)
FROM usuario u
WHERE u.email = 'repartidor@email.com'
	AND m.id_motorizado = 1;

UPDATE motorizado
SET id_usuario = (SELECT id_usuario FROM usuario WHERE email = 'repartidor2@email.com')
WHERE id_motorizado = 2;

UPDATE motorizado
SET id_usuario = (SELECT id_usuario FROM usuario WHERE email = 'repartidor3@email.com')
WHERE id_motorizado = 3;

UPDATE motorizado
SET id_usuario = (SELECT id_usuario FROM usuario WHERE email = 'repartidor4@email.com')
WHERE id_motorizado = 4;

UPDATE motorizado
SET id_usuario = (SELECT id_usuario FROM usuario WHERE email = 'repartidor5@email.com')
WHERE id_motorizado = 5;

-- Forzar identidad canónica para repartidor oficial y sincronizar todos los motorizados vinculados
UPDATE usuario
SET
	nombre = 'Diego',
	apellido = 'Reyes',
	telefono = COALESCE(NULLIF(telefono, ''), '987654331'),
	direccion_principal = COALESCE(NULLIF(direccion_principal, ''), 'Av. Delivery 100')
WHERE LOWER(email) = 'repartidor@email.com'
	AND rol = 'REPARTIDOR';

UPDATE motorizado m
SET
	nombre = u.nombre,
	apellido = u.apellido,
	telefono = COALESCE(NULLIF(u.telefono, ''), m.telefono)
FROM usuario u
WHERE m.id_usuario = u.id_usuario
	AND (
		COALESCE(m.nombre, '') IS DISTINCT FROM COALESCE(u.nombre, '')
		OR COALESCE(m.apellido, '') IS DISTINCT FROM COALESCE(u.apellido, '')
		OR (
			NULLIF(u.telefono, '') IS NOT NULL
			AND COALESCE(m.telefono, '') IS DISTINCT FROM u.telefono
		)
	);

-- PRODUCTOS
INSERT INTO producto (nombre_producto, descripcion, precio, imagen, id_categoria, id_marca) VALUES
('Leche Entera Gloria 1L', 'Leche entera en caja 1 L', 4.50, '/api/uploads/images/leche-gloria-1l.webp', 3, 1),
('Arroz Costeño 5 kg', 'Arroz extra 5 kg', 18.90, '/api/uploads/images/arroz-costeno-5kg.webp', 1, 4),
('Coca-Cola 3 L', 'Gaseosa sabor original 3 L', 10.50, '/api/uploads/images/coca-cola-3l.webp', 2, 3),
('Aceite Primor 900 ml', 'Aceite vegetal', 8.20, '/api/uploads/images/aceite-primor-900.webp', 1, 7),
('Pollo Entero San Fernando 1 kg', 'Pollo entero 1 kg', 12.80, '/api/uploads/images/pollo-sf-1kg.webp', 5, 5),
('Yogur Gloria Fresa 1 L', 'Yogur sabor fresa 1 litro', 6.30, '/api/uploads/images/yogur-fresa-1l.webp', 3, 1),
('Spaghetti Don Vittorio 500 g', 'Pasta spaghetti 500 g', 3.20, '/api/uploads/images/spaghetti-500g.webp', 1, 4),
('Jugo Del Valle 1 L', 'Jugo de frutas surtidas 1 L', 5.90, '/api/uploads/images/jugo-del-valle-1l.webp', 2, 3),
('Jabón Bolívar 200 g', 'Jabón de lavar ropa 200 g', 4.80, '/api/uploads/images/jabon-bolivar-200g.webp', 6, 4),
('Papas Fritas Lay''s 140 g', 'Snack de papas 140 g', 6.50, '/api/uploads/images/lays-140g.webp', 9, 10),
('Carne Molida El Buen Corte', 'Carne molida de res', 18.50, '/api/uploads/images/carne-molida.webp', 8, 5),
('Cepillo Eléctrico Oral-B Pro Series 3', 'Cepillo dental eléctrico Oral-B Pro Series 3', 125.00, '/api/uploads/images/cepillo-electrico-oralb.webp', 10, 11),
('Doritos Queso Atrevido 100 g', 'Tortillas fritas de maíz sabor a queso 100 g', 7.50, '/api/uploads/images/doritos-queso-atrevido-100g.webp', 9, 9),
('Fresa Entera Congelada El Frutero 1 kg', 'Fresa entera congelada 1 kg', 18.90, '/api/uploads/images/fresa-entera-congelada-el-frutero-1kg.webp', 8, 13),
('Hamburguesa de Pollo Redondos 360 g', 'Hamburguesa de pollo empanizada 360 g', 15.90, '/api/uploads/images/hamburguesa-pollo-redondos-360g.webp', 8, 12),
('Manzana Roja 1 kg', 'Manzana roja fresca 1 kg', 7.90, '/api/uploads/images/manzana-roja-1kg.webp', 4, 16),
('Pan Carioca La Florencia 400 g', 'Pan carioca en bolsa 400 g', 6.50, '/api/uploads/images/pan-carioca-la-florencia-400g.webp', 7, 14),
('Pan de Molde Blanco La Florencia 500 g', 'Pan de molde blanco 500 g', 7.50, '/api/uploads/images/pan-molde-blanco-la-florencia-500g.webp', 7, 14),
('Pan de Molde Blanco XL Bimbo 770 g', 'Pan de molde blanco XL 770 g', 12.90, '/api/uploads/images/pan-molde-blanco-bimbo-xl-770g.webp', 7, 15),
('Piqueo Snax Original 110 g', 'Snack piqueo sabor original 110 g', 6.90, '/api/uploads/images/piqueo-snax-original-110g.webp', 9, 9),
('Condimento SIBARITA Palillo amarillito Sobre 32.4Gr', 'Condimento SIBARITA Palillo amarillito Sobre 32.4Gr', 1.00, '/api/uploads/images/sibarita_palillo_amarillito_32.4g.webp', 1, 4);

-- INVENTARIO
INSERT INTO inventario (cantidad_disponible, id_producto, id_almacen) VALUES
(100, 1, 1),
(150, 2, 1),
(200, 3, 1),
(80, 4, 1),
(50, 5, 1),
(120, 6, 1),
(90, 7, 1),
(180, 8, 1),
(70, 9, 1),
(110, 10, 1),
(45, 11, 1),
(25, 12, 1),
(60, 13, 1),
(40, 14, 1),
(55, 15, 1),
(70, 16, 1),
(60, 17, 1),
(45, 18, 1),
(80, 19, 1),
(75, 20, 1),
(100, 21, 1);

-- ENTRADA_INVENTARIO
INSERT INTO entrada_inventario (cantidad_recibida, fecha_entrada, motivo_entrada, id_inventario) VALUES
(20, '2025-01-05', 'Compra', 1),
(35, '2025-01-18', 'Compra', 6),
(25, '2025-02-07', 'Compra', 2),
(40, '2025-02-20', 'Compra', 8),
(30, '2025-03-03', 'Compra', 3),
(15, '2025-03-19', 'Compra', 9),
(22, '2025-04-09', 'Compra', 4),
(28, '2025-04-26', 'Compra', 7),
(18, '2025-05-06', 'Compra', 5),
(33, '2025-05-24', 'Compra', 10),
(26, '2025-06-04', 'Compra', 6),
(31, '2025-06-20', 'Compra', 1),
(24, '2025-07-08', 'Compra', 7),
(29, '2025-07-23', 'Compra', 2),
(27, '2025-08-11', 'Compra', 8),
(20, '2025-08-28', 'Compra', 3),
(23, '2025-09-02', 'Compra', 9),
(34, '2025-09-16', 'Compra', 4),
(50, '2025-10-01', 'Compra', 1),
(30, '2025-10-05', 'Compra', 2),
(40, '2025-10-06', 'Compra', 3),
(20, '2025-10-07', 'Devolución', 4),
(15, '2025-10-11', 'Compra', 5),
(25, '2025-10-12', 'Compra', 6),
(35, '2025-10-13', 'Compra', 7),
(45, '2025-10-21', 'Devolución', 8),
(10, '2025-10-21', 'Compra', 9),
(55, '2025-10-22', 'Compra', 10),
(28, '2025-11-02', 'Compra', 5),
(19, '2025-11-15', 'Compra', 10),
(30, '2025-12-07', 'Compra', 6),
(25, '2025-12-18', 'Compra', 1);

-- SALIDA_INVENTARIO
INSERT INTO salida_inventario (cantidad_salida, fecha_salida, motivo_salida, id_inventario, id_usuario) VALUES
(9, '2025-01-06', 'Venta', 1, 2),
(12, '2025-01-21', 'Venta', 6, 7),
(11, '2025-02-08', 'Venta', 2, 2),
(8, '2025-02-22', 'Venta', 8, 7),
(10, '2025-03-04', 'Venta', 3, 7),
(7, '2025-03-20', 'Venta', 9, 2),
(13, '2025-04-10', 'Venta', 4, 7),
(9, '2025-04-27', 'Venta', 7, 2),
(8, '2025-05-07', 'Venta', 5, 2),
(14, '2025-05-25', 'Venta', 10, 7),
(10, '2025-06-05', 'Venta', 6, 7),
(12, '2025-06-21', 'Venta', 1, 2),
(9, '2025-07-09', 'Venta', 7, 2),
(11, '2025-07-24', 'Venta', 2, 7),
(10, '2025-08-12', 'Venta', 8, 7),
(8, '2025-08-29', 'Venta', 3, 2),
(9, '2025-09-03', 'Venta', 9, 2),
(13, '2025-09-17', 'Venta', 4, 7),
(13, '2025-10-01', 'Venta', 1, 2),
(15, '2025-10-02', 'Venta', 2, 2),
(14, '2025-10-03', 'Venta', 3, 7),
(28, '2025-10-04', 'Venta', 4, 7),
(26, '2025-10-05', 'Venta', 5, 2),
(19, '2025-10-06', 'Venta', 6, 7),
(18, '2025-10-07', 'Venta', 7, 2),
(11, '2025-10-08', 'Venta', 8, 7),
(14, '2025-10-09', 'Venta', 9, 7),
(21, '2025-10-10', 'Venta', 10, 2),
(12, '2025-11-03', 'Venta', 5, 2),
(10, '2025-11-16', 'Venta', 10, 7),
(11, '2025-12-08', 'Venta', 6, 7),
(9, '2025-12-19', 'Venta', 1, 2);

-- PEDIDO
INSERT INTO pedido (id_pedido, fecha_creacion, estado_pedido, total_pedido, costo_envio, direccion_envio, id_usuario, id_metodo_pago) VALUES
(1,  '2025-01-05', 'ENTREGADO', 19.50, 5.00, 'Av. Lima 123', 1, 1),
(2,  '2025-01-20', 'EN CAMINO', 25.30, 5.00, 'Av. Arequipa 456', 11, 2),
(3,  '2025-02-07', 'ENTREGADO', 25.80, 5.00, 'Jr. Cusco 789', 5, 3),
(4,  '2025-02-21', 'PENDIENTE', 28.20, 5.00, 'Av. Tacna 321', 6, 4),
(5,  '2025-03-03', 'ENTREGADO', 22.40, 5.00, 'Jr. Ayacucho 654', 9, 1),
(6,  '2025-03-18', 'CANCELADO', 31.70, 5.00, 'Av. Bolívar 987', 10, 2),
(7,  '2025-04-09', 'ENTREGADO', 33.60, 5.00, 'Av. Lima 123', 1, 3),
(8,  '2025-04-25', 'EN CAMINO', 20.50, 5.00, 'Av. Arequipa 456', 11, 4),
(9,  '2025-05-06', 'ENTREGADO', 18.30, 5.00, 'Jr. Cusco 789', 5, 1),
(10, '2025-05-22', 'PENDIENTE', 46.00, 5.00, 'Av. Tacna 321', 6, 2),
(11, '2025-06-04', 'ENTREGADO', 22.20, 5.00, 'Jr. Ayacucho 654', 9, 3),
(12, '2025-06-19', 'PREPARADO', 44.30, 5.00, 'Av. Bolívar 987', 10, 4),
(13, '2025-07-08', 'ENTREGADO', 22.00, 5.00, 'Av. Lima 123', 1, 1),
(14, '2025-07-23', 'EN CAMINO', 30.50, 5.00, 'Av. Arequipa 456', 11, 2),
(15, '2025-08-11', 'ENTREGADO', 44.10, 5.00, 'Jr. Cusco 789', 5, 3),
(16, '2025-08-27', 'PENDIENTE', 33.80, 5.00, 'Av. Tacna 321', 6, 4),
(17, '2025-09-02', 'ENTREGADO', 21.20, 5.00, 'Jr. Ayacucho 654', 9, 1),
(18, '2025-09-16', 'PREPARADO', 25.30, 5.00, 'Av. Bolívar 987', 10, 2),
(19, '2025-10-01', 'ENTREGADO', 45.50, 5.00, 'Av. Lima 123', 1, 1),
(20, '2025-10-02', 'EN CAMINO', 38.70, 5.00, 'Av. Arequipa 456', 11, 2),
(21, '2025-10-03', 'PENDIENTE', 52.30, 5.00, 'Jr. Cusco 789', 5, 3),
(22, '2025-10-04', 'ENTREGADO', 27.90, 5.00, 'Av. Tacna 321', 6, 4),
(23, '2025-10-05', 'EN CAMINO', 64.20, 5.00, 'Jr. Ayacucho 654', 9, 1),
(24, '2025-10-06', 'ENTREGADO', 19.80, 5.00, 'Av. Bolívar 987', 10, 2),
(25, '2025-10-07', 'PENDIENTE', 42.50, 5.00, 'Jr. Huancavelica 654', 1, 3),
(26, '2025-10-08', 'ENTREGADO', 35.70, 5.00, 'Av. Salaverry 321', 11, 4),
(27, '2025-10-09', 'EN CAMINO', 58.90, 5.00, 'Jr. Junín 159', 5, 1),
(28, '2025-10-10', 'PENDIENTE', 23.40, 5.00, 'Av. Brasil 753', 6, 2),
(29, '2025-11-01', 'ENTREGADO', 45.50, 5.00, 'Av. Lima 123', 9, 1),
(30, '2025-11-02', 'EN CAMINO', 38.70, 5.00, 'Av. Arequipa 456', 10, 2),
(31, '2025-11-03', 'ENTREGADO', 52.30, 5.00, 'Jr. Cusco 789', 1, 3),
(32, '2025-11-04', 'ENTREGADO', 27.90, 5.00, 'Av. Tacna 321', 11, 4),
(33, '2025-11-05', 'EN CAMINO', 64.20, 5.00, 'Jr. Ayacucho 654', 5, 1),
(34, '2025-12-06', 'ENTREGADO', 19.80, 5.00, 'Av. Bolívar 987', 6, 2),
(35, '2025-12-07', 'PENDIENTE', 42.50, 5.00, 'Jr. Huancavelica 654', 9, 3),
(36, '2025-12-08', 'ENTREGADO', 35.70, 5.00, 'Av. Salaverry 321', 10, 4),
(37, '2025-12-09', 'ENTREGADO', 58.90, 5.00, 'Jr. Junín 159', 1, 1),
(38, '2025-12-10', 'ENTREGADO', 23.40, 5.00, 'Av. Brasil 753', 11, 2);

SELECT setval(pg_get_serial_sequence('pedido','id_pedido'), (SELECT MAX(id_pedido) FROM pedido));

-- ENVIO
INSERT INTO envio (numero_rastreo, transportista, fecha_envio, estado_envio, costo_envio, id_pedido) VALUES
('TRK021', 'Reparto interno', '2025-01-06', 'ENTREGADO', 5.00, 1),
('TRK022', 'Reparto interno', '2025-01-21', 'EN_RUTA', 5.00, 2),
('TRK023', 'Reparto interno', '2025-02-08', 'ENTREGADO', 5.00, 3),
('TRK025', 'Reparto interno', '2025-03-04', 'ENTREGADO', 5.00, 5),
('TRK027', 'Reparto interno', '2025-04-10', 'ENTREGADO', 5.00, 7),
('TRK028', 'Reparto interno', '2025-04-26', 'EN_RUTA', 5.00, 8),
('TRK029', 'Reparto interno', '2025-05-07', 'ENTREGADO', 5.00, 9),
('TRK031', 'Reparto interno', '2025-06-05', 'ENTREGADO', 5.00, 11),
('TRK033', 'Reparto interno', '2025-07-09', 'ENTREGADO', 5.00, 13),
('TRK034', 'Reparto interno', '2025-07-24', 'EN_RUTA', 5.00, 14),
('TRK035', 'Reparto interno', '2025-08-12', 'ENTREGADO', 5.00, 15),
('TRK037', 'Reparto interno', '2025-09-03', 'ENTREGADO', 5.00, 17),
('TRK001', 'Reparto interno', '2025-10-01', 'ENTREGADO', 5.00, 19),
('TRK002', 'Reparto interno', '2025-10-02', 'EN_RUTA', 5.00, 20),
('TRK004', 'Reparto interno', '2025-10-04', 'ENTREGADO', 5.00, 22),
('TRK005', 'Reparto interno', '2025-10-05', 'EN_RUTA', 5.00, 23),
('TRK006', 'Reparto interno', '2025-10-06', 'ENTREGADO', 5.00, 24),
('TRK008', 'Reparto interno', '2025-10-08', 'ENTREGADO', 5.00, 26),
('TRK009', 'Reparto interno', '2025-10-09', 'EN_RUTA', 5.00, 27),
('TRK011', 'Reparto interno', '2025-11-01', 'ENTREGADO', 5.00, 29),
('TRK012', 'Reparto interno', '2025-11-02', 'EN_RUTA', 5.00, 30),
('TRK013', 'Reparto interno', '2025-11-03', 'ENTREGADO', 5.00, 31),
('TRK014', 'Reparto interno', '2025-11-04', 'ENTREGADO', 5.00, 32),
('TRK015', 'Reparto interno', '2025-11-05', 'EN_RUTA', 5.00, 33),
('TRK016', 'Reparto interno', '2025-12-06', 'ENTREGADO', 5.00, 34),
('TRK018', 'Reparto interno', '2025-12-08', 'ENTREGADO', 5.00, 36),
('TRK019', 'Reparto interno', '2025-12-09', 'ENTREGADO', 5.00, 37),
('TRK020', 'Reparto interno', '2025-12-10', 'ENTREGADO', 5.00, 38),
('TRK003', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 21),
('TRK007', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 25),
('TRK010', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 28),
('TRK017', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 35),
('TRK024', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 4),
('TRK026', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 6),
('TRK030', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 10),
('TRK032', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 12),
('TRK036', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 16),
('TRK038', 'Reparto interno', NULL, 'PENDIENTE', 5.00, 18);

-- COMPROBANTE
INSERT INTO comprobante (tipo_comprobante, numero_comprobante, fecha_creacion, monto_total, estado_comprobante, fecha_emision, ultima_actualizacion, id_pedido, id_metodo_pago) VALUES
('BOLETA',  'B001-0011', '2025-01-05', 24.50, 'PAGADO',    '2025-01-05', '2025-01-05', 1, 1),
('FACTURA', 'F001-0011', '2025-01-20', 30.30, 'PAGADO',    '2025-01-20', '2025-01-20', 2, 2),
('BOLETA',  'B001-0012', '2025-02-07', 30.80, 'PAGADO',    '2025-02-07', '2025-02-07', 3, 3),
('FACTURA', 'F001-0012', '2025-02-21', 33.20, 'PENDIENTE', NULL,        '2025-02-21', 4, 4),
('BOLETA',  'B001-0013', '2025-03-03', 27.40, 'PAGADO',    '2025-03-03', '2025-03-03', 5, 1),
('FACTURA', 'F001-0013', '2025-03-18', 36.70, 'ANULADO',   '2025-03-19', '2025-03-19', 6, 2),
('BOLETA',  'B001-0014', '2025-04-09', 38.60, 'PAGADO',    '2025-04-09', '2025-04-09', 7, 3),
('FACTURA', 'F001-0014', '2025-04-25', 25.50, 'PAGADO',    '2025-04-25', '2025-04-25', 8, 4),
('BOLETA',  'B001-0015', '2025-05-06', 23.30, 'PAGADO',    '2025-05-06', '2025-05-06', 9, 1),
('FACTURA', 'F001-0015', '2025-05-22', 51.00, 'PENDIENTE', NULL,        '2025-05-22', 10, 2),
('BOLETA',  'B001-0016', '2025-06-04', 27.20, 'PAGADO',    '2025-06-04', '2025-06-04', 11, 3),
('FACTURA', 'F001-0016', '2025-06-19', 49.30, 'PENDIENTE', NULL,        '2025-06-19', 12, 4),
('BOLETA',  'B001-0017', '2025-07-08', 27.00, 'PAGADO',    '2025-07-08', '2025-07-08', 13, 1),
('FACTURA', 'F001-0017', '2025-07-23', 35.50, 'PAGADO',    '2025-07-23', '2025-07-23', 14, 2),
('BOLETA',  'B001-0018', '2025-08-11', 49.10, 'PAGADO',    '2025-08-11', '2025-08-11', 15, 3),
('FACTURA', 'F001-0018', '2025-08-27', 38.80, 'PENDIENTE', NULL,        '2025-08-27', 16, 4),
('BOLETA',  'B001-0019', '2025-09-02', 26.20, 'PAGADO',    '2025-09-02', '2025-09-02', 17, 1),
('FACTURA', 'F001-0019', '2025-09-16', 30.30, 'PENDIENTE', NULL,        '2025-09-16', 18, 2),
('BOLETA',  'B001-0001', '2025-10-01', 50.50, 'PAGADO',    '2025-10-01', '2025-10-01', 19, 1),
('FACTURA', 'F001-0001', '2025-10-02', 43.70, 'PAGADO',    '2025-10-02', '2025-10-02', 20, 2),
('BOLETA',  'B001-0002', '2025-10-03', 57.30, 'ANULADO',   '2025-10-05', '2025-10-05', 21, 3),
('FACTURA', 'F001-0002', '2025-10-04', 32.90, 'PAGADO',    '2025-10-04', '2025-10-04', 22, 4),
('BOLETA',  'B001-0003', '2025-10-05', 69.20, 'PAGADO',    '2025-10-05', '2025-10-05', 23, 1),
('FACTURA', 'F001-0003', '2025-10-06', 24.80, 'PENDIENTE',  NULL,        '2025-10-06', 24, 2),
('BOLETA',  'B001-0004', '2025-10-07', 47.50, 'PENDIENTE',  NULL,        '2025-10-07', 25, 3),
('FACTURA', 'F001-0004', '2025-10-08', 40.70, 'PENDIENTE',  NULL,        '2025-10-08', 26, 4),
('BOLETA',  'B001-0005', '2025-10-09', 63.90, 'OBSERVADO', '2025-10-09', '2025-10-09', 27, 1),
('FACTURA', 'F001-0005', '2025-10-10', 28.40, 'PAGADO',    '2025-10-10', '2025-10-10', 28, 2),
('BOLETA',  'B001-0006', '2025-11-01', 50.50, 'PAGADO',    '2025-11-01', '2025-11-01', 29, 1),
('FACTURA', 'F001-0006', '2025-11-02', 43.70, 'PAGADO',    '2025-11-02', '2025-11-02', 30, 2),
('BOLETA',  'B001-0007', '2025-11-03', 57.30, 'OBSERVADO', '2025-11-03', '2025-11-03', 31, 3),
('FACTURA', 'F001-0007', '2025-11-04', 32.90, 'PAGADO',    '2025-11-04', '2025-11-04', 32, 4),
('BOLETA',  'B001-0008', '2025-11-05', 69.20, 'PAGADO',    '2025-11-05', '2025-11-05', 33, 1),
('FACTURA', 'F001-0008', '2025-12-06', 24.80, 'PENDIENTE', NULL,         '2025-12-06', 34, 2),
('BOLETA',  'B001-0009', '2025-12-07', 47.50, 'ANULADO',   '2025-12-07', '2025-12-07', 35, 3),
('FACTURA', 'F001-0009', '2025-12-08', 40.70, 'PENDIENTE', NULL,         '2025-12-08', 36, 4),
('BOLETA',  'B001-0010', '2025-12-09', 63.90, 'OBSERVADO', '2025-12-09', '2025-12-09', 37, 1),
('FACTURA', 'F001-0010', '2025-12-10', 28.40, 'PAGADO',    '2025-12-10', '2025-12-10', 38, 2);

-- BOLETA
INSERT INTO boleta (nombre_cliente, dni_cliente, id_comprobante) VALUES
('Juan Pérez', '12345678', 1),
('Carlos López', '23456789', 3),
('Luis Martínez', '34567890', 5),
('Laura Díaz', '45678901', 7),
('Elena Ruiz', '56789012', 9);

-- FACTURA
INSERT INTO factura (monto_base, monto_impuesto, razon_social_cliente, ruc_cliente, direccion_cliente, id_comprobante) VALUES
(41.30, 2.40, 'María Gómez EIRL', '20123456789', 'Av. Arequipa 456', 2),
(30.60, 2.30, 'Ana Rodríguez SAC', '20234567890', 'Av. Tacna 321', 4),
(22.20, 2.60, 'Pedro Sánchez EIRL', '20345678901', 'Av. Bolívar 987', 6),
(34.50, 6.20, 'Sofía Hernández SAC', '20456789012', 'Av. Salaverry 321', 8),
(24.00, 4.40, 'Miguel Torres EIRL', '20567890123', 'Jr. Junín 159', 10);

-- DETALLE_PEDIDO
INSERT INTO detalle_pedido (cantidad, precio_unitario_venta, subtotal, id_pedido, id_producto) VALUES
(2, 4.50, 9.00, 19, 1),
(1, 18.90, 18.90, 19, 2),
(1, 10.50, 10.50, 20, 3),
(2, 8.20, 16.40, 20, 4),
(1, 12.80, 12.80, 21, 5),
(2, 6.30, 12.60, 21, 6),
(3, 3.20, 9.60, 22, 7),
(2, 5.90, 11.80, 22, 8),
(1, 4.80, 4.80, 23, 9),
(2, 6.50, 13.00, 23, 10),
(2, 4.50, 9.00, 24, 1),
(1, 18.90, 18.90, 24, 2),
(1, 10.50, 10.50, 25, 3),
(2, 8.20, 16.40, 25, 4),
(1, 12.80, 12.80, 26, 5),
(2, 6.30, 12.60, 26, 6),
(3, 3.20, 9.60, 27, 7),
(2, 5.90, 11.80, 27, 8),
(1, 4.80, 4.80, 28, 9),
(2, 6.50, 13.00, 28, 10),
(2, 4.50, 9.00, 29, 1),
(1, 18.90, 18.90, 29, 2),
(1, 10.50, 10.50, 30, 3),
(2, 8.20, 16.40, 30, 4),
(1, 12.80, 12.80, 31, 5),
(2, 6.30, 12.60, 31, 6),
(3, 3.20, 9.60, 32, 7),
(2, 5.90, 11.80, 32, 8),
(1, 4.80, 4.80, 33, 9),
(2, 6.50, 13.00, 33, 10),
(2, 4.50, 9.00, 34, 1),
(1, 18.90, 18.90, 34, 2),
(1, 10.50, 10.50, 35, 3),
(2, 8.20, 16.40, 35, 4),
(1, 12.80, 12.80, 36, 5),
(2, 6.30, 12.60, 36, 6),
(3, 3.20, 9.60, 37, 7),
(2, 5.90, 11.80, 37, 8),
(1, 4.80, 4.80, 38, 9),
(2, 6.50, 13.00, 38, 10),
(2, 4.50, 9.00, 1, 1),
(1, 10.50, 10.50, 1, 3),
(1, 18.90, 18.90, 2, 2),
(2, 3.20, 6.40, 2, 7),
(3, 6.50, 19.50, 3, 10),
(1, 6.30, 6.30, 3, 6),
(2, 8.20, 16.40, 4, 4),
(2, 5.90, 11.80, 4, 8),
(1, 12.80, 12.80, 5, 5),
(2, 4.80, 9.60, 5, 9),
(4, 3.20, 12.80, 6, 7),
(1, 18.90, 18.90, 6, 2),
(2, 6.30, 12.60, 7, 6),
(2, 10.50, 21.00, 7, 3),
(1, 4.50, 4.50, 8, 1),
(5, 3.20, 16.00, 8, 7),
(2, 5.90, 11.80, 9, 8),
(1, 6.50, 6.50, 9, 10),
(1, 8.20, 8.20, 10, 4),
(2, 18.90, 37.80, 10, 2),
(2, 4.80, 9.60, 11, 9),
(2, 6.30, 12.60, 11, 6),
(3, 10.50, 31.50, 12, 3),
(1, 12.80, 12.80, 12, 5),
(2, 4.50, 9.00, 13, 1),
(2, 6.50, 13.00, 13, 10),
(1, 5.90, 5.90, 14, 8),
(3, 8.20, 24.60, 14, 4),
(2, 18.90, 37.80, 15, 2),
(1, 6.30, 6.30, 15, 6),
(1, 12.80, 12.80, 16, 5),
(2, 10.50, 21.00, 16, 3),
(2, 8.20, 16.40, 17, 4),
(1, 4.80, 4.80, 17, 9),
(3, 6.30, 18.90, 18, 6),
(2, 3.20, 6.40, 18, 7);

-- HISTORIAL
INSERT INTO historial (descripcion, accion, fecha_accion, id_pedido, id_usuario) VALUES
('Seguimiento de retraso','VERIFICACIÓN','2025-01-23',2,6),
('Reposición por producto dañado','REEMPLAZO PRODUCTO','2025-03-07',5,6),
('Corrección de datos de comprobante','CORRECCIÓN FACTURA','2025-05-24',10,6),
('Envío de ítem faltante','ENVÍO PRODUCTO','2025-07-11',13,6),
('Revisión por producto vencido','VERIFICACIÓN','2025-09-07',17,6),
('Se reemplazó producto dañado','REEMPLAZO PRODUCTO','2025-10-02',19,6),
('Verificación de retraso en entrega','VERIFICACIÓN','2025-10-03',20,6),
('Envío de producto faltante','ENVÍO PRODUCTO','2025-10-04',21,6),
('Validación de producto equivocado','VERIFICACIÓN','2025-10-05',22,6),
('Reembolso por empaque dañado','REEMBOLSO','2025-10-06',23,6),
('Revisión de entrega incompleta','VERIFICACIÓN','2025-10-07',24,6),
('Inspección por producto vencido','VERIFICACIÓN','2025-10-08',25,6),
('Reemplazo de producto en mal estado','REEMPLAZO PRODUCTO','2025-10-09',26,6),
('Corrección de factura errónea','CORRECCIÓN FACTURA','2025-10-10',27,6),
('Revisión de producto abierto','VERIFICACIÓN','2025-10-11',28,6),
('Revisión de entrega incompleta','VERIFICACIÓN','2025-12-13',36,6);

SELECT 1;