import { api } from "../../../../api/http";
import type { DeliveryDetail, DeliveryQueueRow, DeliveryRider, Shipment } from "../types/delivery.types";

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

export function fetchMyShipments(estado?: string): Promise<Shipment[]> {
  const q = new URLSearchParams();
  if (estado) q.set("estado", estado);
  const qs = q.toString();
  return api.get<Shipment[]>(`/delivery/my-shipments${qs ? `?${qs}` : ""}`);
}

export function startRoute(orderId: number): Promise<unknown> {
  return api.patch(`/delivery/${orderId}/start-route`);
}

export function deliverOrder(input: { orderId: number; nombreReceptor: string; dniReceptor?: string; observacion?: string }): Promise<unknown> {
  return api.patch(`/delivery/${input.orderId}/deliver`, {
    nombre_receptor: input.nombreReceptor,
    dni_receptor: input.dniReceptor || undefined,
    observacion: input.observacion || undefined,
  });
}

export function failDelivery(input: { orderId: number; motivo: string }): Promise<unknown> {
  return api.patch(`/delivery/${input.orderId}/fail`, { motivo: input.motivo });
}
