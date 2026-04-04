import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { useExportFile } from "../../shared/hooks/useExportFile";
import { fetchStatusLog } from "../../shared/services/ordersService";
import { getErrorMessage } from "../../shared/utils/errors";
import { PaginationControls } from "../../shared/components/PaginationControls";
import type { StatusLogResponse } from "../../shared/types/orders.types";

export function StatusLogSection() {
  const { exporting, exportError, exportFile } = useExportFile();

  const [draft, setDraft] = useState<{
    idPedido: string;
    evento: string;
    fechaInicio: string;
    fechaFin: string;
    pageSize: string;
  }>({ idPedido: "", evento: "", fechaInicio: "", fechaFin: "", pageSize: "20" });
  const [applied, setApplied] = useState<typeof draft | null>(null);
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState<string | null>(null);

  const {
    data: statusLog,
    isLoading,
    error,
  } = useQuery<StatusLogResponse>({
    queryKey: ["orders", "status-log", applied, page],
    queryFn: () => {
      const f = applied || { idPedido: "", evento: "", fechaInicio: "", fechaFin: "", pageSize: "20" };
      return fetchStatusLog({ page, pageSize: f.pageSize, idPedido: f.idPedido, evento: f.evento, fechaInicio: f.fechaInicio, fechaFin: f.fechaFin });
    },
  });

  const appliedSummary = useMemo(() => {
    const f = applied;
    if (!f) return "Sin filtros activos";
    const parts: string[] = [];
    if (f.idPedido.trim()) parts.push(`Pedido #${f.idPedido.trim()}`);
    if (f.evento.trim()) {
      const eventLabelMap: Record<string, string> = {
        PREPARAR_PEDIDO: "Pedido preparado",
        TRANSICION_ESTADO: "Cambio de estado",
        DELIVERY_ASIGNADO: "Repartidor asignado",
        DELIVERY_EN_RUTA: "Inicio de ruta",
        DELIVERY_ENTREGADO: "Entrega completada",
        DELIVERY_NO_ENTREGADO: "Entrega no completada",
        PICKUP_ENTREGADO: "Entrega en tienda",
      };
      parts.push(`Evento: ${eventLabelMap[f.evento] || f.evento}`);
    }
    if (f.fechaInicio.trim() || f.fechaFin.trim()) parts.push(`Rango: ${f.fechaInicio || "…"} → ${f.fechaFin || "…"}`);
    parts.push(`Tamaño: ${f.pageSize || "20"}`);
    return parts.join(" · ");
  }, [applied]);

  function handleExport() {
    const f = applied || { idPedido: "", evento: "", fechaInicio: "", fechaFin: "", pageSize: "20" };
    const q = new URLSearchParams();
    if (f.idPedido.trim()) q.set("idPedido", f.idPedido.trim());
    if (f.evento.trim()) q.set("evento", f.evento.trim());
    if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
    if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
    const qs = q.toString();
    exportFile(`/orders/status-log/export${qs ? `?${qs}` : ""}`, "historial-estados.csv");
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex justify-content-end mb-3">
          <button className="btn btn-outline-primary btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exportando..." : "Exportar historial (CSV)"}
          </button>
        </div>

        {exportError ? <div className="alert alert-danger">{exportError}</div> : null}

        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            if (draft.fechaInicio.trim() && draft.fechaFin.trim() && draft.fechaInicio > draft.fechaFin) {
              setFilterError("El rango de fechas es inválido: la fecha de inicio no puede ser mayor que la fecha fin.");
              return;
            }
            setFilterError(null);
            setPage(1);
            setApplied({ ...draft });
          }}
        >
          <div className="col-12 col-md-2">
            <label className="form-label" htmlFor="emp-log-idPedido">
              Pedido
            </label>
            <input
              id="emp-log-idPedido"
              type="number"
              className="form-control form-control-sm"
              placeholder="ID"
              value={draft.idPedido}
              onChange={e => setDraft(s => ({ ...s, idPedido: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="emp-log-evento">
              Evento
            </label>
            <select
              id="emp-log-evento"
              className="form-select form-select-sm"
              value={draft.evento}
              onChange={e => setDraft(s => ({ ...s, evento: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="PREPARAR_PEDIDO">Pedido preparado</option>
              <option value="TRANSICION_ESTADO">Cambio de estado</option>
              <option value="DELIVERY_ASIGNADO">Repartidor asignado</option>
              <option value="DELIVERY_EN_RUTA">Inicio de ruta</option>
              <option value="DELIVERY_ENTREGADO">Entrega completada</option>
              <option value="DELIVERY_NO_ENTREGADO">Entrega no completada</option>
              <option value="PICKUP_ENTREGADO">Entrega en tienda</option>
            </select>
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label" htmlFor="emp-log-fechaInicio">
              Fecha inicio
            </label>
            <input
              id="emp-log-fechaInicio"
              type="date"
              className="form-control form-control-sm"
              value={draft.fechaInicio}
              onChange={e => setDraft(s => ({ ...s, fechaInicio: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label" htmlFor="emp-log-fechaFin">
              Fecha fin
            </label>
            <input
              id="emp-log-fechaFin"
              type="date"
              className="form-control form-control-sm"
              value={draft.fechaFin}
              onChange={e => setDraft(s => ({ ...s, fechaFin: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-1">
            <label className="form-label" htmlFor="emp-log-pageSize">
              Tamaño
            </label>
            <select
              id="emp-log-pageSize"
              className="form-select form-select-sm"
              value={draft.pageSize}
              onChange={e => setDraft(s => ({ ...s, pageSize: e.target.value }))}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="col-6 col-md-1">
            <button type="submit" className="btn btn-sm btn-primary w-100">
              Aplicar
            </button>
          </div>
          <div className="col-6 col-md-1">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary w-100"
              onClick={() => {
                const c = { idPedido: "", evento: "", fechaInicio: "", fechaFin: "", pageSize: "20" };
                setDraft(c);
                setApplied(c);
                setFilterError(null);
                setPage(1);
              }}
            >
              Limpiar
            </button>
          </div>
        </form>

        {filterError ? <div className="alert alert-warning py-2">{filterError}</div> : null}
        <div className="small text-muted mb-3">Filtros activos: {appliedSummary}</div>

        {error ? <div className="alert alert-danger">{getErrorMessage(error)}</div> : null}
        {isLoading ? <div className="text-muted">Cargando...</div> : null}

        {!isLoading && statusLog && statusLog.rows.length === 0 ? <div className="alert alert-info mb-0">No hay registros.</div> : null}

        {!isLoading && statusLog && statusLog.rows.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Evento</th>
                  <th>Estado anterior</th>
                  <th>Estado nuevo</th>
                  <th>Detalle</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {statusLog.rows.map(r => (
                  <tr key={`${r.fecha_accion_utc}:${r.id_pedido}`}>
                    <td className="text-nowrap">
                      {(() => {
                        const dt = formatDateTime(r.fecha_accion_utc, "datetime");
                        if (!dt) return <span className="text-muted">—</span>;
                        return (
                          <div title={dt.raw}>
                            <div className="fw-semibold">{dt.date}</div>
                            <div className="text-muted small">{dt.time}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="fw-semibold">{r.id_pedido}</td>
                    <td>{r.evento || "—"}</td>
                    <td>{r.anterior || "No aplica"}</td>
                    <td>{r.nuevo || "No aplica"}</td>
                    <td>{r.detalle || "Sin detalle adicional"}</td>
                    <td>{r.responsable}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <PaginationControls
              currentPage={statusLog.page}
              totalPages={statusLog.totalPages}
              totalRows={statusLog.total}
              isLoading={isLoading}
              onPageChange={setPage}
              ariaLabel="Paginación historial"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
