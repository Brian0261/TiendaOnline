-- PostgreSQL user management v1 (idempotente)

-- 1) Estado operativo de usuario para desactivación segura (soft delete)
ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS estado VARCHAR(15) NOT NULL DEFAULT 'ACTIVO';

ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_estado_check;
ALTER TABLE usuario
  ADD CONSTRAINT usuario_estado_check
  CHECK (estado IN ('ACTIVO', 'INACTIVO'));

-- 2) Índices para búsqueda y filtros administrativos
CREATE INDEX IF NOT EXISTS idx_usuario_rol_estado ON usuario (rol, estado);
CREATE INDEX IF NOT EXISTS idx_usuario_email_lower ON usuario (LOWER(email));

-- 3) Compatibilidad con instalaciones previas
UPDATE usuario
SET estado = 'ACTIVO'
WHERE estado IS NULL;
