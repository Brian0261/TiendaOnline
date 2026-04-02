import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getErrorMessage } from "../../shared/utils/errors";
import { money, toDateInputValue } from "../../shared/utils/format";
import { fetchSalesReport } from "../../shared/services/reportsService";

interface Props {
  exportFile: (path: string, fallbackFilename: string) => Promise<void>;
  exportingGeneric: boolean;
  genericExportError: string | null;
}

export function ReportsSection({ exportFile, exportingGeneric, genericExportError }: Props) {
  /* ── Estado local ────────────────────────────────────────── */
  const [salesDraft, setSalesDraft] = useState<{ fechaInicio: string; fechaFin: string }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { fechaInicio: toDateInputValue(start), fechaFin: toDateInputValue(end) };
  });
  const [salesApplied, setSalesApplied] = useState<{ fechaInicio: string; fechaFin: string } | null>(null);

  /* ── Query ───────────────────────────────────────────────── */
  const {
    data: salesReport,
    isLoading: salesLoading,
    error: salesError,
  } = useQuery({
    queryKey: ["admin", "sales", salesApplied?.fechaInicio, salesApplied?.fechaFin],
    queryFn: () => {
      const range = salesApplied;
      if (!range) throw new Error("Rango no aplicado");
      return fetchSalesReport({ fechaInicio: range.fechaInicio, fechaFin: range.fechaFin });
    },
    enabled: !!salesApplied,
  });

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">Reporte de Ventas</h4>
            <div className="text-muted small">Consulta por rango de fechas.</div>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              disabled={!salesApplied || exportingGeneric}
              onClick={() => {
                if (!salesApplied) return;
                const q = new URLSearchParams({ fechaInicio: salesApplied.fechaInicio, fechaFin: salesApplied.fechaFin });
                exportFile(`/reports/sales/export/csv?${q.toString()}`, "reporte-ventas.csv");
              }}
            >
              {exportingGeneric ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>
        </div>

        {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}

        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            if (!salesDraft.fechaInicio || !salesDraft.fechaFin) return;
            setSalesApplied({ ...salesDraft });
          }}
        >
          <div className="col-sm-4 col-md-3">
            <label className="form-label" htmlFor="sales-fi">
              Fecha inicio
            </label>
            <input
              id="sales-fi"
              type="date"
              className="form-control form-control-sm"
              value={salesDraft.fechaInicio}
              onChange={e => setSalesDraft(s => ({ ...s, fechaInicio: e.target.value }))}
              required
            />
          </div>
          <div className="col-sm-4 col-md-3">
            <label className="form-label" htmlFor="sales-ff">
              Fecha fin
            </label>
            <input
              id="sales-ff"
              type="date"
              className="form-control form-control-sm"
              value={salesDraft.fechaFin}
              onChange={e => setSalesDraft(s => ({ ...s, fechaFin: e.target.value }))}
              required
            />
          </div>
          <div className="col-sm-4 col-md-2">
            <button type="submit" className="btn btn-sm btn-primary w-100">
              Consultar
            </button>
          </div>
        </form>

        {salesError ? <div className="alert alert-danger">{getErrorMessage(salesError)}</div> : null}
        {salesLoading ? <div className="text-muted">Cargando...</div> : null}

        {!salesLoading && salesReport ? (
          <div className="row g-3">
            <div className="col-md-4">
              <div className="card shadow-sm h-100">
                <div className="card-body">
                  <div className="text-muted small">Total ventas (S/)</div>
                  <div className="fs-4 fw-semibold">{money.format(salesReport.totalVentas ?? 0)}</div>
                  <div className="text-muted small">Pedidos completados: {salesReport.pedidosCompletados ?? 0}</div>
                </div>
              </div>
            </div>
            <div className="col-md-8">
              <div className="card shadow-sm h-100">
                <div className="card-body">
                  <h6 className="card-title mb-2">Top productos</h6>
                  <div className="table-responsive">
                    <table className="table table-sm table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th className="text-end">Cantidad</th>
                          <th className="text-end">Total (S/)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesReport.topProductos?.length ? (
                          salesReport.topProductos.map(p => (
                            <tr key={p.nombre}>
                              <td>{p.nombre}</td>
                              <td className="text-end">{p.cantidad}</td>
                              <td className="text-end">{money.format(p.total)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="text-muted">—</td>
                            <td className="text-end text-muted">—</td>
                            <td className="text-end text-muted">—</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="card shadow-sm">
                <div className="card-body">
                  <h6 className="card-title mb-2">Métodos de pago</h6>
                  <div className="table-responsive">
                    <table className="table table-sm table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Método</th>
                          <th className="text-end">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesReport.topMetodosPago?.length ? (
                          salesReport.topMetodosPago.map(m => (
                            <tr key={m.nombre}>
                              <td>{m.nombre}</td>
                              <td className="text-end">{m.cantidad}</td>
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
