-- Migration: canonical shipping states and cleanup
-- Date: 2026-03-15

UPDATE envio
SET estado_envio = 'EN_RUTA'
WHERE UPPER(TRIM(estado_envio)) = 'EN CAMINO';

UPDATE envio
SET estado_envio = 'PENDIENTE'
WHERE estado_envio IS NULL OR TRIM(estado_envio) = '';

ALTER TABLE envio DROP CONSTRAINT IF EXISTS envio_estado_envio_check;
ALTER TABLE envio
  ADD CONSTRAINT envio_estado_envio_check
  CHECK (estado_envio IN ('PENDIENTE', 'PENDIENTE_ASIGNACION', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'REPROGRAMADO'));
