import type { PaginatedResponse } from "./common.types";
import type { InventoryRow } from "./inventory.types";

export type DispatchInventorySearchResponse = PaginatedResponse<InventoryRow>;

export type DispatchDraftItem = {
  id_inventario: string;
  cantidad: string;
  searchDraft: string;
  selectedLabel: string;
};

export type DispatchListFilters = {
  fechaInicio: string;
  fechaFin: string;
  search: string;
  pageSize: string;
};

export type DispatchCreatePayload = {
  observacion: string;
  items: Array<{ id_inventario: number; cantidad: number }>;
};

export type DispatchCreateResponse = {
  ok: boolean;
  message?: string;
  items?: Array<{ id_inventario: number; cantidad: number; nuevo_stock: number | null; nombre: string }>;
};
