-- Migration: remove legacy delivery entity and preserve historical traceability
-- Date: 2026-03-14

CREATE TABLE IF NOT EXISTS legacy_delivery_company_archive (
  id_delivery INT PRIMARY KEY,
  nombre_empresa VARCHAR(100) NOT NULL,
  telefono VARCHAR(20),
  email VARCHAR(100),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legacy_motorizado_delivery_archive (
  id_motorizado INT PRIMARY KEY,
  id_usuario INT NULL,
  id_delivery INT NOT NULL,
  licencia VARCHAR(50) NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legacy_envio_delivery_archive (
  id_envio INT PRIMARY KEY,
  id_pedido INT NOT NULL,
  id_delivery INT NOT NULL,
  transportista VARCHAR(100) NULL,
  estado_envio VARCHAR(50) NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delivery'
  ) THEN
    INSERT INTO legacy_delivery_company_archive (id_delivery, nombre_empresa, telefono, email)
    SELECT d.id_delivery, d.nombre_empresa, d.telefono, d.email
    FROM delivery d
    ON CONFLICT (id_delivery) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'motorizado' AND column_name = 'id_delivery'
  ) THEN
    INSERT INTO legacy_motorizado_delivery_archive (id_motorizado, id_usuario, id_delivery, licencia)
    SELECT m.id_motorizado, m.id_usuario, m.id_delivery, m.licencia
    FROM motorizado m
    WHERE m.id_delivery IS NOT NULL
    ON CONFLICT (id_motorizado) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'envio' AND column_name = 'id_delivery'
  ) THEN
    INSERT INTO legacy_envio_delivery_archive (id_envio, id_pedido, id_delivery, transportista, estado_envio)
    SELECT e.id_envio, e.id_pedido, e.id_delivery, e.transportista, e.estado_envio
    FROM envio e
    WHERE e.id_delivery IS NOT NULL
    ON CONFLICT (id_envio) DO NOTHING;
  END IF;
END $$;

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delivery'
  ) THEN
    FOR constraint_row IN
      SELECT conrelid::regclass AS table_name, conname
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid = 'delivery'::regclass
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', constraint_row.table_name, constraint_row.conname);
    END LOOP;
  END IF;
END $$;

ALTER TABLE motorizado DROP COLUMN IF EXISTS id_delivery;
ALTER TABLE envio DROP COLUMN IF EXISTS id_delivery;
DROP TABLE IF EXISTS delivery;
