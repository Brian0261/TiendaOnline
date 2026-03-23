-- Migration: remove residual delivery_event table
-- Date: 2026-03-15

DROP INDEX IF EXISTS idx_delivery_event_pedido;
DROP TABLE IF EXISTS delivery_event CASCADE;
