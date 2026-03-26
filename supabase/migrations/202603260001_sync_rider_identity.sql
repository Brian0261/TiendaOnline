-- Migration: sync rider identity data from canonical usuario records
-- Date: 2026-03-26

-- 1) Ensure demo rider identity stays canonical across environments
UPDATE usuario
SET
  nombre = 'Diego',
  apellido = 'Reyes',
  telefono = COALESCE(NULLIF(telefono, ''), '987654331'),
  direccion_principal = COALESCE(NULLIF(direccion_principal, ''), 'Av. Delivery 100')
WHERE LOWER(email) = 'repartidor@email.com'
  AND rol = 'REPARTIDOR';

-- 2) Keep linked motorizado records aligned with linked usuario identity
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
