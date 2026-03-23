-- Migration: repair common Spanish mojibake patterns persisted as double question marks
-- Date: 2026-03-15
-- Scope: remediation for already-corrupted persisted data (non-destructive)

BEGIN;

CREATE OR REPLACE FUNCTION public.fix_mojibake_es(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result_text text;
BEGIN
  IF input_text IS NULL THEN
    RETURN NULL;
  END IF;

  result_text := input_text;

  -- Personas
  result_text := REPLACE(result_text, 'P??rez', 'Pérez');
  result_text := REPLACE(result_text, 'G??mez', 'Gómez');
  result_text := REPLACE(result_text, 'L??pez', 'López');
  result_text := REPLACE(result_text, 'Rodr??guez', 'Rodríguez');
  result_text := REPLACE(result_text, 'Mart??nez', 'Martínez');
  result_text := REPLACE(result_text, 'S??nchez', 'Sánchez');
  result_text := REPLACE(result_text, 'D??az', 'Díaz');
  result_text := REPLACE(result_text, 'Sof??a', 'Sofía');
  result_text := REPLACE(result_text, 'Hern??ndez', 'Hernández');

  -- Catálogo / direcciones frecuentes
  result_text := REPLACE(result_text, 'Coste??o', 'Costeño');
  result_text := REPLACE(result_text, 'Bol??var', 'Bolívar');
  result_text := REPLACE(result_text, 'categor??a', 'categoría');
  result_text := REPLACE(result_text, 'Categor??a', 'Categoría');
  result_text := REPLACE(result_text, 'categor??as', 'categorías');
  result_text := REPLACE(result_text, 'Categor??as', 'Categorías');
  result_text := REPLACE(result_text, 'Auditor??a', 'Auditoría');
  result_text := REPLACE(result_text, 'M??todos', 'Métodos');

  RETURN result_text;
END;
$$;

DO $$
DECLARE
  col RECORD;
  sql text;
BEGIN
  FOR col IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying')
  LOOP
    sql := format(
      'UPDATE %I.%I SET %I = public.fix_mojibake_es(%I) WHERE %I LIKE ''%%??%%'';',
      col.table_schema,
      col.table_name,
      col.column_name,
      col.column_name,
      col.column_name
    );

    EXECUTE sql;
  END LOOP;
END $$;

COMMIT;
