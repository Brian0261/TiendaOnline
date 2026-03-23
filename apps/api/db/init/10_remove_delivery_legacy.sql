-- PostgreSQL delivery legacy cleanup (idempotente)

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
DROP TABLE IF EXISTS legacy_delivery_company_archive;
DROP TABLE IF EXISTS legacy_motorizado_delivery_archive;
DROP TABLE IF EXISTS legacy_envio_delivery_archive;
