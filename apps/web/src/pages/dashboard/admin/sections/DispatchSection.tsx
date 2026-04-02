import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { fetchOutbound } from "../../shared/services/dispatchService";
import { getErrorMessage } from "../../shared/utils/errors";

import type { OutboundResponse } from "../../shared/types/inventory.types";
import type { JumpIntent } from "../AdminShell";

interface Props {
  dispatchDefaults: { fechaInicio: string; fechaFin: string; search: string };
  jumpIntent: JumpIntent | null;
  onConsumeJump: () => void;
  exportFile: (path: string, fallbackFilename: string) => Promise<void>;
  exportingGeneric: boolean;
  genericExportError: string | null;
}

export function DispatchSection({ dispatchDefaults, jumpIntent, onConsumeJump, exportFile, exportingGeneric, genericExportError }: Props) {
  const [dispatchDraft, setDispatchDraft] = useState<{ fechaInicio: string; fechaFin: string; search: string }>(() => ({
    ...dispatchDefaults,
  }));
  const [dispatchApplied, setDispatchApplied] = useState<typeof dispatchDraft | null>(() => ({
    ...dispatchDefaults,
  }));
  const [dispatchPage, setDispatchPage] = useState(1);

  // Process jump intent during render (React 19 recommended pattern)
  const [prevJump, setPrevJump] = useState<typeof jumpIntent>(null);
  if (jumpIntent && jumpIntent !== prevJump) {
    setPrevJump(jumpIntent);
    setDispatchPage(1);
  }

  // Side effect: consume jump intent
  useEffect(() => {
    if (jumpIntent) onConsumeJump();
  }, [jumpIntent, onConsumeJump]);

  const {
    data: outboundRows,
    isLoading: outboundLoading,
    error: outboundError,
  } = useQuery<OutboundResponse>({
    queryKey: [
      "admin",
      "dispatch",
      "outbound",
      dispatchPage,
      dispatchApplied?.fechaInicio || "",
      dispatchApplied?.fechaFin || "",
      dispatchApplied?.search || "",
    ],
    queryFn: () => {
      const f = dispatchApplied || { fechaInicio: "", fechaFin: "", search: "" };
      return fetchOutbound({
        page: dispatchPage,
        pageSize: "20",
        fechaInicio: f.fechaInicio || undefined,
        fechaFin: f.fechaFin || undefined,
        search: f.search || undefined,
      });
    },
    enabled: !!dispatchApplied,
  });

  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">Despachos (Supervisión)</h4>
            <div className="text-muted small">Consulta, trazabilidad y exportación de salidas de inventario.</div>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              disabled={exportingGeneric}
              onClick={() => {
                const f = dispatchApplied || { fechaInicio: "", fechaFin: "", search: "" };
                const q = new URLSearchParams();
                if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
                if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
                if (f.search.trim()) q.set("search", f.search.trim());
                const qs = q.toString();
                exportFile(`/dispatch/outbound/export${qs ? `?${qs}` : ""}`, "despachos.csv");
              }}
            >
              {exportingGeneric ? "Exportando..." : "Exportar despachos (CSV)"}
            </button>
          </div>
        </div>

        {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}

        <div className="row g-3">
          <div className="col-12">
            <div className="card border">
              <div className="card-body">
                <h6 className="mb-2">Modo supervisión</h6>
                <p className="small text-muted mb-0">
                  El registro operativo de salidas se realiza desde el dashboard de empleado. Esta vista está orientada a control, análisis y
                  exportación histórica de despachos.
                </p>
              </div>
            </div>
          </div>

          <div className="col-12">
            <div className="card border">
              <div className="card-body">
                <h6 className="mb-3">Filtros</h6>
                <form
                  className="row g-2 align-items-end"
                  onSubmit={e => {
                    e.preventDefault();
                    setDispatchPage(1);
                    setDispatchApplied({ ...dispatchDraft });
                  }}
                >
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="disp-fechaInicio">
                      Fecha inicio
                    </label>
                    <input
                      id="disp-fechaInicio"
                      type="date"
                      className="form-control form-control-sm"
                      value={dispatchDraft.fechaInicio}
                      onChange={e => setDispatchDraft(s => ({ ...s, fechaInicio: e.target.value }))}
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="disp-fechaFin">
                      Fecha fin
                    </label>
                    <input
                      id="disp-fechaFin"
                      type="date"
                      className="form-control form-control-sm"
                      value={dispatchDraft.fechaFin}
                      onChange={e => setDispatchDraft(s => ({ ...s, fechaFin: e.target.value }))}
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="disp-search">
                      Buscar
                    </label>
                    <input
                      id="disp-search"
                      type="search"
                      className="form-control form-control-sm"
                      placeholder="Producto / motivo / responsable"
                      value={dispatchDraft.search}
                      onChange={e => setDispatchDraft(s => ({ ...s, search: e.target.value }))}
                    />
                  </div>
                  <div className="col-12 col-md-3">
                    <button type="submit" className="btn btn-sm btn-primary w-100">
                      Aplicar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>

        <hr className="my-4" />

        {outboundError ? <div className="alert alert-danger">{getErrorMessage(outboundError)}</div> : null}
        {!dispatchApplied ? <div className="alert alert-info">Aplica filtros para cargar el listado.</div> : null}
        {dispatchApplied && outboundLoading ? <div className="text-muted">Cargando...</div> : null}

        {dispatchApplied && !outboundLoading && outboundRows && outboundRows.rows.length === 0 ? (
          <div className="alert alert-info mb-0">Sin registros para los filtros actuales.</div>
        ) : null}

        {dispatchApplied && !outboundLoading && outboundRows && outboundRows.rows.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Fecha</th>
                  <th>Producto</th>
                  <th className="text-end" style={{ width: 120 }}>
                    Cant.
                  </th>
                  <th>Motivo</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {outboundRows.rows.map(r => (
                  <tr key={r.id_salida_inventario}>
                    <td className="text-nowrap">
                      {(() => {
                        const dt = formatDateTime(r.fecha_salida_utc, "datetime");
                        if (!dt) return <span className="text-muted">—</span>;
                        return (
                          <div title={dt.raw}>
                            <div className="fw-semibold">{dt.date}</div>
                            <div className="text-muted small">{dt.time}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td>{r.producto}</td>
                    <td className="text-end fw-semibold">{r.cantidad}</td>
                    <td>{r.motivo || "—"}</td>
                    <td>{r.responsable || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
              <div className="small text-muted">
                Página {outboundRows.page} de {outboundRows.totalPages} · {outboundRows.total} registros
              </div>
              <div className="btn-group btn-group-sm" role="group" aria-label="Paginación despachos admin">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={outboundRows.page <= 1 || outboundLoading}
                  onClick={() => setDispatchPage(p => Math.max(p - 1, 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={outboundRows.page >= outboundRows.totalPages || outboundLoading}
                  onClick={() => setDispatchPage(p => Math.min(p + 1, outboundRows.totalPages))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
