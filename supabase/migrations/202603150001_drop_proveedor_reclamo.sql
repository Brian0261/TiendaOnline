-- Migration: remove unused proveedor and reclamo tables
-- Date: 2026-03-15

DROP TABLE IF EXISTS proveedor CASCADE;
DROP TABLE IF EXISTS reclamo CASCADE;
