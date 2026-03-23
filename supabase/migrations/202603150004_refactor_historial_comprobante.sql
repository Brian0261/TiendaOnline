-- Migration: structured audit metadata and comprobante semantics
-- Date: 2026-03-15

ALTER TABLE historial
  ADD COLUMN IF NOT EXISTS modulo VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS entidad VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS referencia_id INT NULL;

UPDATE historial
SET
  modulo = COALESCE(modulo, CASE
    WHEN UPPER(accion) LIKE 'DELIVERY%' THEN 'DELIVERY'
    WHEN UPPER(accion) LIKE 'PREPARAR_PEDIDO%' OR UPPER(accion) LIKE 'TRANSICION_ESTADO%' OR UPPER(accion) LIKE 'PEDIDO%' THEN 'PEDIDO'
    WHEN UPPER(accion) LIKE 'INVENTARIO%' OR UPPER(accion) LIKE 'STOCK%' THEN 'INVENTARIO'
    WHEN UPPER(accion) LIKE 'DESPACHO%' OR UPPER(accion) LIKE 'SALIDA_DESPACHO%' THEN 'DESPACHO'
    WHEN UPPER(accion) LIKE 'USUARIO%' THEN 'USUARIO'
    ELSE NULL
  END),
  entidad = COALESCE(entidad, CASE WHEN id_pedido IS NOT NULL THEN 'PEDIDO' ELSE entidad END),
  referencia_id = COALESCE(referencia_id, id_pedido);

CREATE INDEX IF NOT EXISTS idx_historial_modulo_fecha ON historial (modulo, fecha_accion DESC);
CREATE INDEX IF NOT EXISTS idx_historial_entidad_ref ON historial (entidad, referencia_id);

ALTER TABLE comprobante DROP CONSTRAINT IF EXISTS comprobante_tipo_check;
ALTER TABLE comprobante
  ADD CONSTRAINT comprobante_tipo_check
  CHECK (tipo_comprobante IN ('BOLETA', 'FACTURA'));
