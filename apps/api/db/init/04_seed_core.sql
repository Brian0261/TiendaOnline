-- PostgreSQL seeds core

INSERT INTO metodos_de_pago (tipo_metodo, detalles) VALUES
('Yape', 'Pago móvil con Yape'),
('Plin', 'Pago móvil con Plin'),
('Transferencia', 'Transferencia bancaria'),
('Tarjeta', 'Visa / Mastercard');

INSERT INTO categoria (nombre_categoria) VALUES
('Abarrotes'),
('Bebidas'),
('Lácteos'),
('Frutas y Verduras'),
('Carnes'),
('Limpieza'),
('Panadería'),
('Congelados'),
('Snacks'),
('Cuidado Personal');

INSERT INTO marca (nombre_marca) VALUES
('Gloria'),
('Nestlé'),
('Coca-Cola'),
('Alicorp'),
('San Fernando'),
('Laive'),
('Primor'),
('Molitalia'),
('Pepsico'),
('Unilever'),
('Oral-B'),
('Redondos'),
('El Frutero'),
('La Florencia'),
('Bimbo'),
('Genérico');

INSERT INTO proveedor (nombre_proveedor, telefono, email, direccion) VALUES
('Distribuidora Alfa', '987333331', 'alfa@dist.com', 'Av. Argentina 123'),
('Mayorista Beta', '987333332', 'beta@mayorista.com', 'Av. Brasil 456'),
('Importadora Gamma', '987333333', 'gamma@import.com', 'Av. Colombia 789'),
('Comercial Delta', '987333334', 'delta@comercial.com', 'Av. Ecuador 321'),
('Distribuidora Épsilon', '987333335', 'epsilon@dist.com', 'Av. Venezuela 654'),
('Mayorista Zeta', '987333336', 'zeta@mayorista.com', 'Av. Bolivia 987'),
('Importadora Eta', '987333337', 'eta@import.com', 'Av. Paraguay 159'),
('Comercial Theta', '987333338', 'theta@comercial.com', 'Av. Uruguay 753'),
('Distribuidora Iota', '987333339', 'iota@dist.com', 'Av. Chile 951'),
('Mayorista Kappa', '987333340', 'kappa@mayorista.com', 'Av. Perú 357');

INSERT INTO almacen (nombre_almacen, direccion, telefono, responsable) VALUES
('Almacén Central', 'Av. Industrial 123', '987222221', 'Luis Ramírez'),
('Almacén Norte', 'Av. Túpac Amaru 456', '987222222', 'Carlos Gutiérrez'),
('Almacén Sur', 'Av. Javier Prado 789', '987222223', 'Marta Sánchez'),
('Almacén Este', 'Av. La Molina 321', '987222224', 'Jorge López');

INSERT INTO delivery (nombre_empresa, telefono, email) VALUES
('Delivery Express', '987123456', 'express@delivery.com'),
('Rápido Envíos', '987123457', 'rapido@envios.com'),
('Moto Mensajeros', '987123458', 'moto@mensajeros.com'),
('Envíos Seguros', '987123459', 'seguros@envios.com'),
('Veloz Delivery', '987123460', 'veloz@delivery.com'),
('Moto Rápidos', '987123461', 'moto@rapidos.com'),
('Express Motos', '987123462', 'express@motos.com'),
('Mensajeros YA', '987123463', 'ya@mensajeros.com'),
('Envíos Flash', '987123464', 'flash@envios.com'),
('Rápidos Moto', '987123465', 'rapidos@moto.com');

INSERT INTO motorizado (nombre, apellido, telefono, licencia, id_delivery) VALUES
('Roberto', 'García', '987111111', 'LIC001', 1),
('Jorge', 'Vargas', '987111112', 'LIC002', 1),
('Daniel', 'Quispe', '987111113', 'LIC003', 2),
('Fernando', 'Salas', '987111114', 'LIC004', 2),
('Ricardo', 'Mendoza', '987111115', 'LIC005', 3),
('Alberto', 'Castro', '987111116', 'LIC006', 3),
('Héctor', 'Rojas', '987111117', 'LIC007', 4),
('Oscar', 'Paredes', '987111118', 'LIC008', 4),
('Pablo', 'Silva', '987111119', 'LIC009', 5),
('Raúl', 'Díaz', '987111120', 'LIC010', 5);
SELECT 1;