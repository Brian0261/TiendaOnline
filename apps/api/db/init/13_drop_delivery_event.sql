-- PostgreSQL cleanup de delivery_event residual (paridad con supabase/migrations/202603150002_drop_delivery_event.sql)

DROP INDEX IF EXISTS idx_delivery_event_pedido;
DROP TABLE IF EXISTS delivery_event CASCADE;
