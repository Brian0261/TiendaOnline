import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { getErrorMessage } from "../../shared/utils/errors";
import { money, formatStateLabel } from "../../shared/utils/format";
import { getAdminOrderStateLabel } from "../../shared/utils/user-helpers";
import { fetchAdminOrders, refundOrder as refundOrderApi } from "../../shared/services/ordersService";
import { fetchDeliveryDetail } from "../../shared/services/deliveryService";
import type { JumpIntent } from "../AdminShell";

interface Props {
  jumpIntent: JumpIntent | null;
  onConsumeJump: () => void;
  exportFile: (path: string, fallbackFilename: string) => Promise<void>;
  exportingGeneric: boolean;
  genericExportError: string | null;
}

export function OrdersSection({ jumpIntent, onConsumeJump, exportFile, exportingGeneric, genericExportError }: Props) {
  const qc = useQueryClient();

  /* ── Estado local ────────────────────────────────────────── */
  const [ordersDraft, setOrdersDraft] = useState<{ search: string; estado: string; fechaInicio: string; fechaFin: string }>({
    search: "",
    estado: "",
    fechaInicio: "",
    fechaFin: "",
  });
  const [ordersApplied, setOrdersApplied] = useState<typeof ordersDraft | null>(null);
  const [ordersDeliveryDetailOrderId, setOrdersDeliveryDetailOrderId] = useState<number | null>(null);

  /* ── Jump intent ─────────────────────────────────────────── */
  const [prevJump, setPrevJump] = useState<typeof jumpIntent>(null);
  if (jumpIntent && jumpIntent !== prevJump) {
    setPrevJump(jumpIntent);
    if (jumpIntent.type === "orders") {
      const search = jumpIntent.search ?? "";
      const deliveryDetailOrderId = jumpIntent.deliveryDetailOrderId ?? null;
      setOrdersDraft(prev => ({ ...prev, search }));
      setOrdersApplied(prev => ({ ...(prev || { search: "", estado: "", fechaInicio: "", fechaFin: "" }), search }));
      if (deliveryDetailOrderId) setOrdersDeliveryDetailOrderId(deliveryDetailOrderId);
    }
  }

  useEffect(() => {
    if (jumpIntent?.type === "orders") onConsumeJump();
  }, [jumpIntent, onConsumeJump]);

  /* ── Queries ─────────────────────────────────────────────── */
  const {
    data: adminOrders,
    isLoading: ordersLoading,
    error: ordersError,
  } = useQuery({
    queryKey: ["admin", "orders", ordersApplied],
    queryFn: () => {
      const f = ordersApplied || { search: "", estado: "", fechaInicio: "", fechaFin: "" };
      return fetchAdminOrders({
        search: f.search,
        estado: f.estado,
        fechaInicio: f.fechaInicio,
        fechaFin: f.fechaFin,
      });
    },
    enabled: !!ordersApplied,
  });

  const {
    data: ordersDeliveryDetail,
    isLoading: ordersDeliveryDetailLoading,
    error: ordersDeliveryDetailError,
  } = useQuery({
    queryKey: ["admin", "orders", "delivery-detail", ordersDeliveryDetailOrderId],
    queryFn: () => fetchDeliveryDetail(ordersDeliveryDetailOrderId!),
    enabled: Number.isInteger(ordersDeliveryDetailOrderId) && Number(ordersDeliveryDetailOrderId) > 0,
  });

  /* ── Mutación ────────────────────────────────────────────── */
  const refundOrder = useMutation({
    mutationFn: (id: number) => refundOrderApi(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">Historial de Pedidos</h4>
            <div className="text-muted small">Búsqueda y filtros básicos para administración.</div>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              disabled={exportingGeneric}
              onClick={() => {
                const f = ordersApplied || { search: "", estado: "", fechaInicio: "", fechaFin: "" };
                const q = new URLSearchParams();
                if (f.search.trim()) q.set("search", f.search.trim());
                if (f.estado.trim()) q.set("estado", f.estado.trim());
                if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
                if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
                const qs = q.toString();
                exportFile(`/orders/export${qs ? `?${qs}` : ""}`, "pedidos.csv");
              }}
            >
              {exportingGeneric ? "Exportando..." : "Exportar pedidos (CSV)"}
            </button>
          </div>
        </div>

        {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}
        {refundOrder.isError ? <div className="alert alert-danger">{getErrorMessage(refundOrder.error)}</div> : null}
        {ordersDeliveryDetailError ? <div className="alert alert-danger">{getErrorMessage(ordersDeliveryDetailError)}</div> : null}

        {/* ── Filtros ─────────────────────────────────────────── */}
        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            setOrdersApplied({ ...ordersDraft });
          }}
        >
          <div className="col-sm-6 col-md-3">
            <label className="form-label" htmlFor="orders-search">
              Buscar
            </label>
            <input
              id="orders-search"
              type="search"
              className="form-control form-control-sm"
              placeholder="Nombre, email o #pedido"
              value={ordersDraft.search}
              onChange={e => setOrdersDraft(s => ({ ...s, search: e.target.value }))}
            />
          </div>
          <div className="col-sm-6 col-md-2">
            <label className="form-label" htmlFor="orders-estado">
              Estado
            </label>
            <select
              id="orders-estado"
              className="form-select form-select-sm"
              value={ordersDraft.estado}
              onChange={e => setOrdersDraft(s => ({ ...s, estado: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="PENDIENTE_PAGO">PENDIENTE_PAGO</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="PREPARADO">PREPARADO</option>
              <option value="EN CAMINO">EN CAMINO</option>
              <option value="ENTREGADO">ENTREGADO</option>
              <option value="CANCELADO">CANCELADO</option>
              <option value="REEMBOLSADO">REEMBOLSADO</option>
              <option value="ANULADO">ANULADO</option>
              <option value="OBSERVADO">OBSERVADO</option>
            </select>
          </div>
          <div className="col-sm-6 col-md-2">
            <label className="form-label" htmlFor="orders-fi">
              Fecha inicio
            </label>
            <input
              id="orders-fi"
              type="date"
              className="form-control form-control-sm"
              value={ordersDraft.fechaInicio}
              onChange={e => setOrdersDraft(s => ({ ...s, fechaInicio: e.target.value }))}
            />
          </div>
          <div className="col-sm-6 col-md-2">
            <label className="form-label" htmlFor="orders-ff">
              Fecha fin
            </label>
            <input
              id="orders-ff"
              type="date"
              className="form-control form-control-sm"
              value={ordersDraft.fechaFin}
              onChange={e => setOrdersDraft(s => ({ ...s, fechaFin: e.target.value }))}
            />
          </div>
          <div className="col-sm-6 col-md-2">
            <button type="submit" className="btn btn-sm btn-primary w-100">
              Aplicar
            </button>
          </div>
        </form>

        {ordersError ? <div className="alert alert-danger">{getErrorMessage(ordersError)}</div> : null}
        {ordersLoading ? <div className="text-muted">Cargando...</div> : null}

        {/* ── Detalle de reparto ──────────────────────────────── */}
        {ordersDeliveryDetailOrderId ? (
          <div className="card border mb-3">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <h6 className="mb-0">Detalle de reparto pedido #{ordersDeliveryDetailOrderId}</h6>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setOrdersDeliveryDetailOrderId(null)}>
                  Cerrar
                </button>
              </div>

              {ordersDeliveryDetailLoading ? <div className="text-muted">Cargando detalle...</div> : null}

              {!ordersDeliveryDetailLoading && ordersDeliveryDetail ? (
                <div className="row g-2 small">
                  <div className="col-md-4">
                    <strong>Estado pedido:</strong> {formatStateLabel(ordersDeliveryDetail.estado_pedido)}
                  </div>
                  <div className="col-md-4">
                    <strong>Estado envío:</strong> {formatStateLabel(ordersDeliveryDetail.estado_envio)}
                  </div>
                  <div className="col-md-4">
                    <strong>Repartidor:</strong> {ordersDeliveryDetail.repartidor || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Email repartidor:</strong> {ordersDeliveryDetail.repartidor_email || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Nombre receptor:</strong> {ordersDeliveryDetail.nombre_receptor || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>DNI receptor:</strong> {ordersDeliveryDetail.dni_receptor || "—"}
                  </div>
                  <div className="col-md-12">
                    <strong>Observación:</strong> {ordersDeliveryDetail.observacion || "—"}
                  </div>
                  <div className="col-md-12">
                    <strong>Motivo no entrega:</strong> {ordersDeliveryDetail.motivo_no_entrega || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Asignado:</strong>{" "}
                    {(() => {
                      const dt = formatDateTime(ordersDeliveryDetail.fecha_asignacion, "datetime");
                      if (!dt) return "—";
                      return `${dt.date}${dt.time ? ` ${dt.time}` : ""}`;
                    })()}
                  </div>
                  <div className="col-md-4">
                    <strong>Inicio ruta:</strong>{" "}
                    {(() => {
                      const dt = formatDateTime(ordersDeliveryDetail.fecha_inicio_ruta, "datetime");
                      if (!dt) return "—";
                      return `${dt.date}${dt.time ? ` ${dt.time}` : ""}`;
                    })()}
                  </div>
                  <div className="col-md-4">
                    <strong>Entregado:</strong>{" "}
                    {(() => {
                      const dt = formatDateTime(ordersDeliveryDetail.fecha_entrega, "datetime");
                      if (!dt) return "—";
                      return `${dt.date}${dt.time ? ` ${dt.time}` : ""}`;
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ── Tabla ───────────────────────────────────────────── */}
        {!ordersLoading && adminOrders && adminOrders.length === 0 ? (
          <div className="alert alert-info mb-0">Sin pedidos para los filtros actuales.</div>
        ) : null}

        {!ordersLoading && adminOrders && adminOrders.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Comprobante</th>
                  <th className="text-end">Total (S/)</th>
                  <th>Productos</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {adminOrders.map((o, idx) => (
                  <tr key={o.id_pedido}>
                    <td>
                      <div className="fw-semibold">{adminOrders.length - idx}</div>
                    </td>
                    <td className="text-nowrap">
                      {(() => {
                        const dt = formatDateTime(o.fecha_creacion, "datetime");
                        if (!dt) return <span className="text-muted">—</span>;
                        return (
                          <div title={dt.raw}>
                            <div className="fw-semibold">{dt.date}</div>
                            <div className="text-muted small">{dt.time}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <div className="fw-semibold">{o.cliente}</div>
                      <div className="text-muted small">{o.email}</div>
                    </td>
                    <td>
                      <span className="badge bg-secondary">{getAdminOrderStateLabel(o)}</span>
                    </td>
                    <td>
                      {o.numero_comprobante ? (
                        <div>
                          <div className="fw-semibold">{o.numero_comprobante}</div>
                          <div className="text-muted small">{o.tipo_comprobante || "COMPROBANTE"}</div>
                        </div>
                      ) : (
                        <span className="text-muted">Pendiente</span>
                      )}
                    </td>
                    <td className="text-end fw-semibold">{money.format(Number(o.total_pedido ?? 0))}</td>
                    <td style={{ whiteSpace: "pre-line" }}>
                      {o.productos?.length ? o.productos.map(p => `${p.nombre} x${p.cantidad}`).join("\n") : "—"}
                    </td>
                    <td className="text-end">
                      <div className="d-flex justify-content-end gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setOrdersDeliveryDetailOrderId(o.id_pedido)}
                        >
                          Ver reparto
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={refundOrder.isPending || ["CANCELADO", "REEMBOLSADO", "PENDIENTE_PAGO"].includes(String(o.estado_pedido))}
                          onClick={() => {
                            const ok = window.confirm(`¿Reembolsar el pedido #${o.id_pedido}? Esto devolverá stock.`);
                            if (!ok) return;
                            refundOrder.mutate(o.id_pedido);
                          }}
                        >
                          {refundOrder.isPending ? "Procesando..." : "Reembolsar"}
                        </button>
                      </div>
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
