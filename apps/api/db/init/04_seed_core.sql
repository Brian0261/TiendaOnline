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

INSERT INTO almacen (nombre_almacen, direccion, telefono, responsable) VALUES
('Tienda Principal', 'Av. Principal 123, Lima', '(01) 123-4567', 'Luis Ramírez');

INSERT INTO motorizado (nombre, apellido, telefono, licencia) VALUES
('Roberto', 'García', '987111111', 'LIC001'),
('Jorge', 'Vargas', '987111112', 'LIC002'),
('Daniel', 'Quispe', '987111113', 'LIC003'),
('Fernando', 'Salas', '987111114', 'LIC004'),
('Ricardo', 'Mendoza', '987111115', 'LIC005');
SELECT 1;