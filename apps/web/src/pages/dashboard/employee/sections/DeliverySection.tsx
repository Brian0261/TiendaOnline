import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { fetchDeliveryQueue, fetchDeliveryRiders, fetchDeliveryDetail, assignDelivery, pickupHandover } from "../../shared/services/deliveryService";
import { getErrorMessage } from "../../shared/utils/errors";
import type { DeliveryQueueRow, DeliveryRider, DeliveryDetail } from "../../shared/types/delivery.types";

export function DeliverySection() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [assignedRiderByOrder, setAssignedRiderByOrder] = useState<Record<number, string>>({});
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /* ── queries ── */
  const {
    data: queue,
    isLoading: queueLoading,
    error: queueError,
  } = useQuery<DeliveryQueueRow[]>({
    queryKey: ["employee", "delivery", "queue", search],
    queryFn: () => fetchDeliveryQueue({ search: search.trim() }),
  });

  const {
    data: riders,
    isLoading: ridersLoading,
    error: ridersError,
  } = useQuery<DeliveryRider[]>({
    queryKey: ["employee", "delivery", "riders"],
    queryFn: fetchDeliveryRiders,
  });

  const {
    data: detail,
    isLoading: detailLoading,
    error: detailError,
  } = useQuery<DeliveryDetail>({
    queryKey: ["employee", "delivery", "detail", detailOrderId],
    queryFn: () => fetchDeliveryDetail(detailOrderId!),
    enabled: Number.isInteger(detailOrderId) && Number(detailOrderId) > 0,
  });

  const assignMut = useMutation({
    mutationFn: assignDelivery,
    onSuccess: async (_data, variables) => {
      setSuccessMessage(`Pedido #${variables.orderId} asignado correctamente.`);
      await qc.invalidateQueries({ queryKey: ["employee", "delivery", "queue"] });
    },
  });

  const pickupMut = useMutation({
    mutationFn: pickupHandover,
    onSuccess: async () => {
      setSuccessMessage(`Pedido entregado en tienda correctamente.`);
      await qc.invalidateQueries({ queryKey: ["employee", "delivery", "queue"] });
    },
  });

  return (
    <section className="card">
      <div className="card-body">
        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            qc.invalidateQueries({ queryKey: ["employee", "delivery", "queue"] });
          }}
        >
          <div className="col-sm-8 col-md-4">
            <label className="form-label" htmlFor="emp-delivery-search">
              Buscar pedido
            </label>
            <input
              id="emp-delivery-search"
              type="search"
              className="form-control form-control-sm"
              placeholder="ID, cliente o dirección"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="col-sm-4 col-md-2">
            <button type="submit" className="btn btn-sm btn-primary w-100">
              Buscar
            </button>
          </div>
        </form>

        {queueError ? <div className="alert alert-danger">{getErrorMessage(queueError)}</div> : null}
        {ridersError ? <div className="alert alert-danger">{getErrorMessage(ridersError)}</div> : null}
        {detailError ? <div className="alert alert-danger">{getErrorMessage(detailError)}</div> : null}
        {assignMut.isError ? <div className="alert alert-danger">{getErrorMessage(assignMut.error)}</div> : null}
        {pickupMut.isError ? <div className="alert alert-danger">{getErrorMessage(pickupMut.error)}</div> : null}
        {successMessage ? <div className="alert alert-success">{successMessage}</div> : null}

        {queueLoading || ridersLoading ? <div className="text-muted">Cargando...</div> : null}

        {!queueLoading && queue && queue.length === 0 ? <div className="alert alert-info mb-0">No hay pedidos listos para asignar.</div> : null}

        {!queueLoading && queue && queue.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Dirección</th>
                  <th>Estado pedido</th>
                  <th>Estado envío</th>
                  <th style={{ minWidth: 420 }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(row => {
                  const isPickup = row.tipo_entrega === "RECOJO";
                  return (
                    <tr key={row.id_pedido}>
                      <td>
                        <div className="fw-semibold">#{row.id_pedido}</div>
                        <div className="small text-muted">
                          {(() => {
                            const dt = formatDateTime(row.fecha_creacion, "datetime");
                            return dt ? `${dt.date} ${dt.time}` : "—";
                          })()}
                        </div>
                      </td>
                      <td>
                        <div className="fw-semibold">{row.cliente}</div>
                        <div className="small text-muted">{row.telefono || "Sin teléfono"}</div>
                      </td>
                      <td>
                        <span className={`badge ${isPickup ? "bg-info text-dark" : "bg-primary"}`}>{isPickup ? "Recojo" : "Domicilio"}</span>
                      </td>
                      <td className="text-truncate" style={{ maxWidth: 260 }} title={row.direccion_envio}>
                        {row.direccion_envio}
                      </td>
                      <td>
                        <span className="badge bg-secondary">{row.estado_pedido}</span>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark">{isPickup ? "—" : row.estado_envio || "PENDIENTE"}</span>
                      </td>
                      <td>
                        <div className="d-flex gap-2 flex-wrap">
                          {isPickup ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              disabled={pickupMut.isPending}
                              onClick={() => {
                                const ok = window.confirm(`¿Confirmar entrega en tienda del pedido #${row.id_pedido}?`);
                                if (!ok) return;
                                setSuccessMessage(null);
                                pickupMut.mutate(row.id_pedido);
                              }}
                            >
                              {pickupMut.isPending ? "Entregando..." : "Entregar en tienda"}
                            </button>
                          ) : (
                            <>
                              <select
                                className="form-select form-select-sm"
                                value={assignedRiderByOrder[row.id_pedido] || ""}
                                onChange={e => setAssignedRiderByOrder(prev => ({ ...prev, [row.id_pedido]: e.target.value }))}
                              >
                                <option value="">Selecciona repartidor</option>
                                {(riders || []).map(r => (
                                  <option key={r.id_motorizado} value={String(r.id_motorizado)}>
                                    #{r.id_motorizado} · {r.nombre} {r.apellido}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                disabled={assignMut.isPending || !assignedRiderByOrder[row.id_pedido]}
                                onClick={() => {
                                  const ok = window.confirm(`¿Asignar repartidor al pedido #${row.id_pedido}?`);
                                  if (!ok) return;
                                  setSuccessMessage(null);
                                  assignMut.mutate({ orderId: row.id_pedido, motorizadoId: Number(assignedRiderByOrder[row.id_pedido]) });
                                }}
                              >
                                {assignMut.isPending ? "Asignando..." : "Asignar"}
                              </button>
                            </>
                          )}
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setDetailOrderId(row.id_pedido)}>
                            Ver detalle
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {detailOrderId ? (
          <div className="card border mt-3">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-2 gap-2">
                <h6 className="mb-0">Detalle de reparto pedido #{detailOrderId}</h6>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setDetailOrderId(null)}>
                  Cerrar
                </button>
              </div>

              {detailLoading ? <div className="text-muted">Cargando detalle...</div> : null}

              {!detailLoading && detail ? (
                <div className="row g-2 small">
                  <div className="col-md-4">
                    <strong>Estado pedido:</strong> {detail.estado_pedido || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Estado envío:</strong> {detail.estado_envio || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Repartidor:</strong> {detail.repartidor || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Email repartidor:</strong> {detail.repartidor_email || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Cliente:</strong> {detail.cliente || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Teléfono cliente:</strong> {detail.cliente_telefono || "—"}
                  </div>
                  <div className="col-md-6">
                    <strong>Nombre receptor:</strong> {detail.nombre_receptor || "—"}
                  </div>
                  <div className="col-md-6">
                    <strong>DNI receptor:</strong> {detail.dni_receptor || "—"}
                  </div>
                  <div className="col-md-12">
                    <strong>Observación:</strong> {detail.observacion || "—"}
                  </div>
                  <div className="col-md-12">
                    <strong>Motivo no entrega:</strong> {detail.motivo_no_entrega || "—"}
                  </div>
                  <div className="col-md-4">
                    <strong>Asignado:</strong>{" "}
                    {(() => {
                      const dt = formatDateTime(detail.fecha_asignacion, "datetime");
                      if (!dt) return "—";
                      return `${dt.date}${dt.time ? ` ${dt.time}` : ""}`;
                    })()}
                  </div>
                  <div className="col-md-4">
                    <strong>Inicio ruta:</strong>{" "}
                    {(() => {
                      const dt = formatDateTime(detail.fecha_inicio_ruta, "datetime");
                      if (!dt) return "—";
                      return `${dt.date}${dt.time ? ` ${dt.time}` : ""}`;
                    })()}
                  </div>
                  <div className="col-md-4">
                    <strong>Entregado:</strong>{" "}
                    {(() => {
                      const dt = formatDateTime(detail.fecha_entrega, "datetime");
                      if (!dt) return "—";
                      return `${dt.date}${dt.time ? ` ${dt.time}` : ""}`;
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
