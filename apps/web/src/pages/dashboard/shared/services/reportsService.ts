import { api } from "../../../../api/http";
import type { DashboardOverview, SalesReport } from "../types/reports.types";

export function fetchDashboardOverview(year: number): Promise<DashboardOverview> {
  return api.get<DashboardOverview>(`/reports/dashboard?year=${encodeURIComponent(String(year))}`);
}

export function fetchSalesReport(filters: { fechaInicio: string; fechaFin: string }): Promise<SalesReport> {
  const q = new URLSearchParams({ fechaInicio: filters.fechaInicio, fechaFin: filters.fechaFin });
  return api.get<SalesReport>(`/reports/sales?${q.toString()}`);
}
