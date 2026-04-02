import type { PaginatedResponse } from "./common.types";

/** Used by Employee dashboard — basic inventory row */
export type InventoryRow = {
  id_inventario: number;
  id_producto: number;
  id_almacen: number;
  nombre_almacen: string;
  nombre_producto: string;
  stock: number;
};

/** Used by Admin dashboard — enriched with price and category */
export type InventoryRowEnriched = {
  id_inventario: number;
  nombre_producto: string;
  precio: number;
  nombre_categoria: string;
  nombre_almacen: string;
  stock: number;
};

export type InventoryKpis = {
  totalProductos: number;
  agotados: number;
  stockBajo: number;
};

export type InventoryPaginatedResponse = PaginatedResponse<InventoryRowEnriched>;

export type InboundRow = {
  id_entrada_inventario: number;
  fecha_entrada_utc: string;
  producto: string;
  cantidad: number;
  motivo: string | null;
  almacen: string | null;
  id_usuario: number | null;
  responsable: string | null;
};

export type InboundResponse = PaginatedResponse<InboundRow>;

export type OutboundRow = {
  id_salida_inventario: number;
  fecha_salida_utc: string;
  producto: string;
  cantidad: number;
  motivo: string | null;
  almacen: string | null;
  responsable: string | null;
};

export type OutboundResponse = PaginatedResponse<OutboundRow>;

export type InboundCreatePayload = {
  id_inventario: number;
  cantidad: number;
  motivo: string;
};

export type InboundCreateResponse = {
  ok: boolean;
  message?: string;
  entry?: {
    id_entrada_inventario?: number;
    fecha_entrada_utc?: string;
    id_inventario?: number;
    producto: string;
    cantidad?: number;
    motivo?: string;
    responsable_id?: number | null;
  };
  stock?: { anterior: number; nuevo: number };
};
