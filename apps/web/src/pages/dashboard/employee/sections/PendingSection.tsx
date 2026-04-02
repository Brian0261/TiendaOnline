import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { useExportFile } from "../../shared/hooks/useExportFile";
import { fetchPendingOrders, markOrderPrepared } from "../../shared/services/ordersService";
import { getErrorMessage } from "../../shared/utils/errors";
import type { PendingOrder } from "../../shared/types/orders.types";

export function PendingSection() {
  const qc = useQueryClient();
  const { exporting, exportError, exportFile } = useExportFile();

  const [pendingDraft, setPendingDraft] = useState<{ fechaInicio: string; fechaFin: string; search: string }>({
    fechaInicio: "",
    fechaFin: "",
    search: "",
  });
  const [pendingApplied, setPendingApplied] = useState<{ fechaInicio: string; fechaFin: string; search: string } | null>(null);

  const {
    data: pendingOrders,
    isLoading: pendingLoading,
    error: pendingError,
  } = useQuery<PendingOrder[]>({
    queryKey: ["orders", "pending", pendingApplied],
    queryFn: () => {
      const f = pendingApplied || { fechaInicio: "", fechaFin: "", search: "" };
      return fetchPendingOrders(f);
    },
  });

  const markPreparedMut = useMutation({
    mutationFn: markOrderPrepared,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders", "pending"] }),
        qc.invalidateQueries({ queryKey: ["employee", "delivery", "queue"] }),
        qc.invalidateQueries({ queryKey: ["orders", "status-log"] }),
        qc.invalidateQueries({ queryKey: ["employee", "kpis"] }),
      ]);
    },
  });

  function handleExport() {
    const f = pendingApplied || { fechaInicio: "", fechaFin: "", search: "" };
    const q = new URLSearchParams();
    if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
    if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
    if (f.search.trim()) q.set("search", f.search.trim());
    const qs = q.toString();
    exportFile(`/orders/pending/export${qs ? `?${qs}` : ""}`, "pedidos-pendientes.csv");
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex justify-content-end mb-3">
          <button className="btn btn-outline-primary btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exportando..." : "Exportar pendientes (CSV)"}
          </button>
        </div>

        {exportError ? <div className="alert alert-danger">{exportError}</div> : null}

        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            setPendingApplied({ ...pendingDraft });
          }}
        >
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="emp-pending-fechaInicio">
              Fecha inicio
            </label>
            <input
              id="emp-pending-fechaInicio"
              type="date"
              className="form-control form-control-sm"
              value={pendingDraft.fechaInicio}
              onChange={e => setPendingDraft(s => ({ ...s, fechaInicio: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="emp-pending-fechaFin">
              Fecha fin
            </label>
            <input
              id="emp-pending-fechaFin"
              type="date"
              className="form-control form-control-sm"
              value={pendingDraft.fechaFin}
              onChange={e => setPendingDraft(s => ({ ...s, fechaFin: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="emp-pending-search">
              Buscar
            </label>
            <input
              id="emp-pending-search"
              type="search"
              className="form-control form-control-sm"
              placeholder="ID pedido, cliente o producto"
              value={pendingDraft.search}
              onChange={e => setPendingDraft(s => ({ ...s, search: e.target.value }))}
            />
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
                const clean = { fechaInicio: "", fechaFin: "", search: "" };
                setPendingDraft(clean);
                setPendingApplied(clean);
              }}
            >
              Limpiar
            </button>
          </div>
        </form>

        <div className="small text-muted mb-3">Mostrando {pendingLoading ? "…" : (pendingOrders?.length ?? 0)} pedidos pendientes.</div>

        {pendingError ? <div className="alert alert-danger">{getErrorMessage(pendingError)}</div> : null}
        {pendingLoading ? <div className="text-muted">Cargando...</div> : null}

        {!pendingLoading && pendingOrders && pendingOrders.length === 0 ? (
          <div className="alert alert-info mb-0">No hay pedidos pendientes.</div>
        ) : null}

        {!pendingLoading && pendingOrders && pendingOrders.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th title="ID del pedido">N° pedido</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Dirección</th>
                  <th>Productos</th>
                  <th className="text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map(p => (
                  <tr key={p.id_pedido}>
                    <td className="fw-semibold">{p.id_pedido}</td>
                    <td className="text-nowrap">
                      {(() => {
                        const dt = formatDateTime(p.fecha_creacion, "auto");
                        if (!dt) return <span className="text-muted">—</span>;
                        return (
                          <div title={dt.raw}>
                            <div className="fw-semibold">{dt.date}</div>
                            {dt.time ? <div className="text-muted small">{dt.time}</div> : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td>{p.cliente}</td>
                    <td className="text-truncate" style={{ maxWidth: 260 }} title={p.direccion_envio || ""}>
                      {p.direccion_envio || "—"}
                    </td>
                    <td style={{ whiteSpace: "pre-line" }}>{p.productos.map(it => `${it.nombre} x${it.cantidad}`).join("\n")}</td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={markPreparedMut.isPending}
                        onClick={() => markPreparedMut.mutate(p.id_pedido)}
                      >
                        {markPreparedMut.isPending ? "Procesando..." : "Marcar preparado"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
