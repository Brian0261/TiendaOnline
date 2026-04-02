import { api } from "../../../../api/http";
import type { AuditPaginatedResponse } from "../types/audit.types";

export function fetchAuditHistory(filters: {
  page: number;
  pageSize: string;
  modulo?: string;
  accion?: string;
  usuario?: string;
  fechaInicio?: string;
  fechaFin?: string;
}): Promise<AuditPaginatedResponse> {
  const q = new URLSearchParams();
  q.set("page", String(filters.page));
  q.set("pageSize", filters.pageSize);
  if (filters.modulo?.trim()) q.set("modulo", filters.modulo.trim());
  if (filters.accion?.trim()) q.set("accion", filters.accion.trim());
  if (filters.usuario?.trim()) q.set("usuario", filters.usuario.trim());
  if (filters.fechaInicio?.trim()) q.set("fechaInicio", filters.fechaInicio.trim());
  if (filters.fechaFin?.trim()) q.set("fechaFin", filters.fechaFin.trim());
  return api.get<AuditPaginatedResponse>(`/audit/historial?${q.toString()}`);
}
