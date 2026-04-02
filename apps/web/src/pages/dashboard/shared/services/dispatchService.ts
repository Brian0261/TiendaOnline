import { api } from "../../../../api/http";
import type { OutboundResponse } from "../types/inventory.types";
import type { DispatchInventorySearchResponse, DispatchCreatePayload, DispatchCreateResponse } from "../types/dispatch.types";

export function fetchOutbound(filters: {
  page: number;
  pageSize?: string;
  fechaInicio?: string;
  fechaFin?: string;
  search?: string;
}): Promise<OutboundResponse> {
  const q = new URLSearchParams();
  q.set("page", String(filters.page));
  q.set("pageSize", filters.pageSize || "20");
  if (filters.fechaInicio?.trim()) q.set("fechaInicio", filters.fechaInicio.trim());
  if (filters.fechaFin?.trim()) q.set("fechaFin", filters.fechaFin.trim());
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  const qs = q.toString();
  return api.get<OutboundResponse>(`/dispatch/outbound${qs ? `?${qs}` : ""}`);
}

export function searchDispatchInventory(filters: { search: string; page?: number; pageSize?: number }): Promise<DispatchInventorySearchResponse> {
  const q = new URLSearchParams();
  q.set("search", filters.search);
  q.set("page", String(filters.page || 1));
  q.set("pageSize", String(filters.pageSize || 8));
  return api.get<DispatchInventorySearchResponse>(`/inventory/search-dispatch?${q.toString()}`);
}

export function createDispatch(payload: DispatchCreatePayload): Promise<DispatchCreateResponse> {
  return api.post<DispatchCreateResponse>("/dispatch", payload);
}
