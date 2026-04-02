import type { PaginatedResponse } from "./common.types";

export type EmployeeKpis = {
  pendientes: number;
  encamino: number;
  entregadosHoy: number;
};

export type PendingOrder = {
  id_pedido: number;
  fecha_creacion: string;
  cliente: string;
  direccion_envio: string | null;
  estado: string;
  productos: Array<{ cantidad: number; nombre: string }>;
};

export type StatusLogRow = {
  fecha_accion_utc: string;
  id_pedido: number;
  responsable: string;
  evento: string;
  accion: string;
  detalle: string;
  anterior: string | null;
  nuevo: string | null;
};

export type StatusLogResponse = PaginatedResponse<StatusLogRow>;

export type AdminOrder = {
  id_pedido: number;
  fecha_creacion: string;
  estado_pedido: string;
  estado_envio?: string | null;
  tipo_comprobante?: string | null;
  numero_comprobante?: string | null;
  estado_comprobante?: string | null;
  total_pedido: number;
  id_usuario: number;
  cliente: string;
  email: string;
  productos: Array<{ nombre: string; cantidad: number; precio_unitario_venta: number }>;
};
