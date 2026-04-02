import type { PaginatedResponse } from "./common.types";

export type AuditRow = {
  id_historial: number;
  accion: string;
  resumen_label?: string | null;
  modulo?: string | null;
  descripcion: string;
  fecha_accion: string;
  id_pedido: number | null;
  entidad_tipo?: string | null;
  entidad_id?: number | null;
  referencia_tipo?: string | null;
  referencia_valor?: string | null;
  referencia_label?: string | null;
  id_usuario: number;
  usuario: string;
};

export type AuditModule = "" | "INVENTARIO" | "DESPACHO" | "PRODUCTO" | "CATEGORIA" | "PEDIDO" | "DELIVERY" | "REPORTE" | "SEGURIDAD" | "SISTEMA";

export type AuditPaginatedResponse = PaginatedResponse<AuditRow>;

export const AUDIT_MODULE_OPTIONS: Array<{ value: AuditModule; label: string }> = [
  { value: "", label: "Todos" },
  { value: "INVENTARIO", label: "Inventario" },
  { value: "DESPACHO", label: "Despachos" },
  { value: "PRODUCTO", label: "Productos" },
  { value: "CATEGORIA", label: "Categorías" },
  { value: "PEDIDO", label: "Pedidos" },
  { value: "DELIVERY", label: "Reparto" },
  { value: "REPORTE", label: "Reportes" },
  { value: "SEGURIDAD", label: "Seguridad" },
  { value: "SISTEMA", label: "Sistema" },
];

export const AUDIT_QUICK_FILTERS: Array<{ label: string; modulo: AuditModule }> = [
  { label: "Todos", modulo: "" },
  { label: "Inventario", modulo: "INVENTARIO" },
  { label: "Despachos", modulo: "DESPACHO" },
  { label: "Productos", modulo: "PRODUCTO" },
  { label: "Pedidos", modulo: "PEDIDO" },
  { label: "Reparto", modulo: "DELIVERY" },
];
