import { api } from "../../../../api/http";
import type { EmployeeKpis, PendingOrder, StatusLogResponse, AdminOrder } from "../types/orders.types";

export function fetchEmployeeKpis(): Promise<EmployeeKpis> {
  return api.get<EmployeeKpis>("/orders/kpis");
}

export function fetchPendingOrders(filters: { fechaInicio?: string; fechaFin?: string; search?: string }): Promise<PendingOrder[]> {
  const q = new URLSearchParams();
  if (filters.fechaInicio?.trim()) q.set("fechaInicio", filters.fechaInicio.trim());
  if (filters.fechaFin?.trim()) q.set("fechaFin", filters.fechaFin.trim());
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  const qs = q.toString();
  return api.get<PendingOrder[]>(`/orders/pending${qs ? `?${qs}` : ""}`);
}

export function fetchStatusLog(filters: {
  page: number;
  pageSize?: string;
  idPedido?: string;
  evento?: string;
  fechaInicio?: string;
  fechaFin?: string;
}): Promise<StatusLogResponse> {
  const q = new URLSearchParams();
  q.set("page", String(filters.page));
  q.set("pageSize", filters.pageSize || "20");
  if (filters.idPedido?.trim()) q.set("idPedido", filters.idPedido.trim());
  if (filters.evento?.trim()) q.set("evento", filters.evento.trim());
  if (filters.fechaInicio?.trim()) q.set("fechaInicio", filters.fechaInicio.trim());
  if (filters.fechaFin?.trim()) q.set("fechaFin", filters.fechaFin.trim());
  return api.get<StatusLogResponse>(`/orders/status-log?${q.toString()}`);
}

export function fetchAdminOrders(filters: { search?: string; estado?: string; fechaInicio?: string; fechaFin?: string }): Promise<AdminOrder[]> {
  const q = new URLSearchParams();
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  if (filters.estado?.trim()) q.set("estado", filters.estado.trim());
  if (filters.fechaInicio?.trim()) q.set("fechaInicio", filters.fechaInicio.trim());
  if (filters.fechaFin?.trim()) q.set("fechaFin", filters.fechaFin.trim());
  const qs = q.toString();
  return api.get<AdminOrder[]>(`/orders${qs ? `?${qs}` : ""}`);
}

export function markOrderPrepared(id: number): Promise<{ ok: true; message?: string }> {
  return api.patch<{ ok: true; message?: string }>(`/orders/${id}/prepare`);
}

export function refundOrder(id: number): Promise<{ ok: true; restockedItems?: number }> {
  return api.patch<{ ok: true; restockedItems?: number }>(`/orders/${id}/refund`);
}
