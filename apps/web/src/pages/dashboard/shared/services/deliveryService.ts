import { api } from "../../../../api/http";
import type { DeliveryDetail, DeliveryQueueRow, DeliveryRider } from "../types/delivery.types";

export function fetchDeliveryQueue(filters: { search?: string }): Promise<DeliveryQueueRow[]> {
  const q = new URLSearchParams();
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  const qs = q.toString();
  return api.get<DeliveryQueueRow[]>(`/delivery/queue${qs ? `?${qs}` : ""}`);
}

export function fetchDeliveryRiders(): Promise<DeliveryRider[]> {
  return api.get<DeliveryRider[]>("/delivery/riders");
}

export function fetchDeliveryDetail(orderId: number): Promise<DeliveryDetail> {
  return api.get<DeliveryDetail>(`/delivery/${orderId}/detail`);
}

export function assignDelivery(payload: { orderId: number; motorizadoId: number }): Promise<{ ok: boolean }> {
  return api.patch<{ ok: boolean }>("/delivery/assign", payload);
}
