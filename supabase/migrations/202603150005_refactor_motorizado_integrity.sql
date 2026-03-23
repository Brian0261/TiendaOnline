-- Migration: motorizado integrity hardening
-- Date: 2026-03-15

UPDATE motorizado
SET telefono = 'NO_REGISTRADO'
WHERE telefono IS NULL OR TRIM(telefono) = '';

UPDATE motorizado
SET licencia = 'PENDIENTE'
WHERE licencia IS NULL OR TRIM(licencia) = '';

ALTER TABLE motorizado DROP CONSTRAINT IF EXISTS motorizado_telefono_nonempty_check;
ALTER TABLE motorizado
  ADD CONSTRAINT motorizado_telefono_nonempty_check
  CHECK (LENGTH(TRIM(telefono)) > 0);

ALTER TABLE motorizado DROP CONSTRAINT IF EXISTS motorizado_licencia_nonempty_check;
ALTER TABLE motorizado
  ADD CONSTRAINT motorizado_licencia_nonempty_check
  CHECK (LENGTH(TRIM(licencia)) > 0);
