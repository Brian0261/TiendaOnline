import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardOverview } from "../../shared/services/reportsService";
import { getErrorMessage } from "../../shared/utils/errors";
import { money } from "../../shared/utils/format";
import type { DashboardOverview } from "../../shared/types/reports.types";

interface Props {
  now: Date;
}

export function DashboardSection({ now }: Props) {
  const [year, setYear] = useState<number>(() => now.getFullYear());

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useQuery<DashboardOverview>({
    queryKey: ["admin", "overview", year],
    queryFn: () => fetchDashboardOverview(year),
  });

  const kpis = overview?.kpis;

  const monthNames = useMemo(() => ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"], []);

  return (
    <section id="section-dashboard">
      <div className="dash-header d-flex align-items-start align-items-md-center flex-column flex-md-row gap-2">
        <div>
          <h4 className="mb-1">Dashboard — Resumen anual</h4>
          <div className="text-muted small">Vistas listas para datos del año en curso y últimos 12 meses.</div>
        </div>

        <div className="ms-md-auto d-flex align-items-center gap-2">
          <label className="small text-muted" htmlFor="admin-year">
            Año
          </label>
          <input
            id="admin-year"
            type="number"
            className="form-control form-control-sm"
            style={{ width: 110 }}
            value={year}
            min={2000}
            max={2100}
            onChange={e => setYear(Number(e.target.value) || now.getFullYear())}
          />
        </div>
      </div>

      {overviewError ? <div className="alert alert-danger mt-3">{getErrorMessage(overviewError)}</div> : null}

      <div className="kpi-grid my-3">
        <div className="kpi-card">
          <div className="kpi-title">Ventas del año (S/)</div>
          <div className="kpi-value">{overviewLoading ? "…" : money.format(kpis?.salesYear ?? 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Pedidos del año</div>
          <div className="kpi-value">{overviewLoading ? "…" : (kpis?.ordersYear ?? 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Ticket promedio (S/)</div>
          <div className="kpi-value">{overviewLoading ? "…" : money.format(kpis?.avgTicket ?? 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Unidades vendidas</div>
          <div className="kpi-value">{overviewLoading ? "…" : (kpis?.units ?? 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Clientes</div>
          <div className="kpi-value">{overviewLoading ? "…" : (kpis?.customers ?? 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Tasa de entrega (%)</div>
          <div className="kpi-value">{overviewLoading ? "…" : `${(kpis?.deliveredRate ?? 0).toFixed(1)}%`}</div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h6 className="card-title">
                <i className="bi bi-graph-up me-2"></i>Ventas mensuales del año {year}
              </h6>
              {overview?.monthly?.sales?.length ? (
                <div className="table-responsive">
                  <table className="table table-sm table-hover table-dashboard-sm mb-0">
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th className="text-end">Ventas (S/)</th>
                        <th className="text-end">Pedidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.monthly.sales.map(s => {
                        const ordersForMonth = overview.monthly.orders.find(o => o.m === s.m);
                        return (
                          <tr key={s.m}>
                            <td>{monthNames[s.m - 1] || `Mes ${s.m}`}</td>
                            <td className="text-end">{money.format(s.total)}</td>
                            <td className="text-end">{ordersForMonth?.count ?? 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="chart-empty small text-muted">{overviewLoading ? "Cargando..." : "Sin datos"}</div>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h6 className="card-title">
                <i className="bi bi-tags me-2"></i>Top categorías del año
              </h6>
              <table className="table table-sm table-hover table-dashboard-sm mb-0">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="text-end">Ventas (S/)</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewLoading ? (
                    <tr>
                      <td className="text-muted">Cargando...</td>
                      <td className="text-end text-muted">…</td>
                    </tr>
                  ) : overview && overview.topCategories.length ? (
                    overview.topCategories.map(c => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td className="text-end">{money.format(c.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="text-muted">—</td>
                      <td className="text-end text-muted">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
