import { api } from "../../../../api/http";
import type {
  InventoryRow,
  InventoryKpis,
  InventoryPaginatedResponse,
  InboundResponse,
  InboundCreatePayload,
  InboundCreateResponse,
} from "../types/inventory.types";
import type { ProductCatalogOption } from "../types/products.types";

export function fetchInventory(filters: { search?: string }): Promise<InventoryRow[]> {
  const q = new URLSearchParams();
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  const qs = q.toString();
  return api.get<InventoryRow[]>(`/inventory${qs ? `?${qs}` : ""}`);
}

export function fetchInventoryKpis(): Promise<InventoryKpis> {
  return api.get<InventoryKpis>("/inventory/kpis");
}

export function fetchInventoryCategories(): Promise<ProductCatalogOption[]> {
  return api.get<ProductCatalogOption[]>("/products/categories");
}

export function fetchInventoryPaginated(filters: {
  page: number;
  pageSize: string;
  search?: string;
  categoriaId?: string;
}): Promise<InventoryPaginatedResponse> {
  const q = new URLSearchParams();
  q.set("page", String(filters.page));
  q.set("pageSize", filters.pageSize);
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  if (filters.categoriaId?.trim()) q.set("categoriaId", filters.categoriaId.trim());
  return api.get<InventoryPaginatedResponse>(`/inventory/paginated?${q.toString()}`);
}

export function fetchInbound(filters: { page: number; pageSize: string; search?: string; categoriaId?: string }): Promise<InboundResponse> {
  const q = new URLSearchParams();
  q.set("page", String(filters.page));
  q.set("pageSize", filters.pageSize);
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  if (filters.categoriaId?.trim()) q.set("categoriaId", filters.categoriaId.trim());
  return api.get<InboundResponse>(`/inventory/inbound?${q.toString()}`);
}

export function fetchEmployeeInbound(filters: { page: number; pageSize?: string; search?: string }): Promise<InboundResponse> {
  const q = new URLSearchParams();
  q.set("page", String(filters.page));
  q.set("pageSize", filters.pageSize || "10");
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  return api.get<InboundResponse>(`/inventory/inbound?${q.toString()}`);
}

export function createInbound(payload: InboundCreatePayload): Promise<InboundCreateResponse> {
  return api.post<InboundCreateResponse>("/inventory/inbound", payload);
}
