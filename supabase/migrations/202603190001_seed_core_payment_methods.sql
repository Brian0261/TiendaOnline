-- Migration: enforce core payment methods parity across local/staging
-- Date: 2026-03-19

INSERT INTO metodos_de_pago (tipo_metodo, detalles)
SELECT 'Yape', 'Pago móvil con Yape'
WHERE NOT EXISTS (
  SELECT 1 FROM metodos_de_pago WHERE LOWER(TRIM(tipo_metodo)) = LOWER(TRIM('Yape'))
);

INSERT INTO metodos_de_pago (tipo_metodo, detalles)
SELECT 'Plin', 'Pago móvil con Plin'
WHERE NOT EXISTS (
  SELECT 1 FROM metodos_de_pago WHERE LOWER(TRIM(tipo_metodo)) = LOWER(TRIM('Plin'))
);

INSERT INTO metodos_de_pago (tipo_metodo, detalles)
SELECT 'Transferencia', 'Transferencia bancaria'
WHERE NOT EXISTS (
  SELECT 1 FROM metodos_de_pago WHERE LOWER(TRIM(tipo_metodo)) = LOWER(TRIM('Transferencia'))
);

INSERT INTO metodos_de_pago (tipo_metodo, detalles)
SELECT 'Tarjeta', 'Visa / Mastercard'
WHERE NOT EXISTS (
  SELECT 1 FROM metodos_de_pago WHERE LOWER(TRIM(tipo_metodo)) = LOWER(TRIM('Tarjeta'))
);

INSERT INTO metodos_de_pago (tipo_metodo, detalles)
SELECT 'Mercado Pago', 'Checkout Pro (redirect)'
WHERE NOT EXISTS (
  SELECT 1 FROM metodos_de_pago WHERE LOWER(TRIM(tipo_metodo)) = LOWER(TRIM('Mercado Pago'))
);
