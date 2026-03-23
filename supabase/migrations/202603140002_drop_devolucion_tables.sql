-- Migration: remove unused return tables
-- Date: 2026-03-14

DROP TABLE IF EXISTS detalle_devolucion CASCADE;
DROP TABLE IF EXISTS devolucion CASCADE;
