-- PostgreSQL cleanup de tablas no usadas (paridad con supabase/migrations/202603150001_drop_proveedor_reclamo.sql)

DROP TABLE IF EXISTS proveedor CASCADE;
DROP TABLE IF EXISTS reclamo CASCADE;
