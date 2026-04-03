import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../../auth/useAuth";
import { formatDateTime } from "../../../../shared/datetime";
import { fetchMyShipments, startRoute, deliverOrder, failDelivery } from "../../shared/services/deliveryService";
import { getErrorMessage } from "../../shared/utils/errors";
import { formatShipmentStateLabel } from "../../shared/utils/format";

export function ShipmentsSection() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { logout } = useAuth();

  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [incidenceReasonByOrder, setIncidenceReasonByOrder] = useState<Record<number, string>>({});
  const [receiverByOrder, setReceiverByOrder] = useState<Record<number, string>>({});
  const [dniByOrder, setDniByOrder] = useState<Record<number, string>>({});
  const [observationByOrder, setObservationByOrder] = useState<Record<number, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["delivery", "my-shipments", estadoFilter],
    queryFn: () => fetchMyShipments(estadoFilter || undefined),
  });

  useEffect(() => {
    if (!error || typeof error !== "object") return;
    const status = (error as { status?: unknown }).status;
    if (status === 401 || status === 403) {
      logout();
      nav("/backoffice/login", { replace: true });
    }
  }, [error, logout, nav]);

  const startRouteMut = useMutation({
    mutationFn: startRoute,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["delivery", "my-shipments"] });
    },
  });

  const deliverMut = useMutation({
    mutationFn: deliverOrder,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["delivery", "my-shipments"] });
    },
  });

  const failMut = useMutation({
    mutationFn: failDelivery,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["delivery", "my-shipments"] });
    },
  });

  const shipments = useMemo(() => data || [], [data]);

  return (
    <>
      <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
        <div>
          <h4 className="mb-1">Mis entregas</h4>
          <div className="text-muted small">Gestión operativa de pedidos asignados al repartidor.</div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <label className="small text-muted" htmlFor="delivery-estado-filter">
            Estado:
          </label>
          <select
            id="delivery-estado-filter"
            className="form-select form-select-sm"
            value={estadoFilter}
            onChange={e => setEstadoFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="ASIGNADO">ASIGNADO</option>
            <option value="EN_RUTA">EN CAMINO</option>
            <option value="ENTREGADO">ENTREGADO</option>
            <option value="NO_ENTREGADO">NO ENTREGADO</option>
          </select>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{getErrorMessage(error)}</div> : null}
      {startRouteMut.isError ? <div className="alert alert-danger">{getErrorMessage(startRouteMut.error)}</div> : null}
      {deliverMut.isError ? <div className="alert alert-danger">{getErrorMessage(deliverMut.error)}</div> : null}
      {failMut.isError ? <div className="alert alert-danger">{getErrorMessage(failMut.error)}</div> : null}

      {isLoading ? <div className="text-muted">Cargando...</div> : null}

      {!isLoading && shipments.length === 0 ? <div className="alert alert-info mb-0">No tienes entregas asignadas.</div> : null}

      {!isLoading && shipments.length > 0 ? (
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>N° pedido</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th style={{ minWidth: 360 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(s => (
                <tr key={s.id_pedido}>
                  <td className="fw-semibold">{s.id_pedido}</td>
                  <td>
                    {(() => {
                      const dt = formatDateTime(s.fecha_creacion, "datetime");
                      if (!dt) return "—";
                      return `${dt.date} ${dt.time}`;
                    })()}
                  </td>
                  <td>
                    <div className="fw-semibold">{s.cliente}</div>
                    <div className="small text-muted">{s.telefono || "Sin teléfono"}</div>
                  </td>
                  <td className="text-truncate" style={{ maxWidth: 280 }} title={s.direccion_envio}>
                    {s.direccion_envio}
                  </td>
                  <td>
                    <span className="badge bg-secondary">{formatShipmentStateLabel(s.estado_envio || s.estado_pedido)}</span>
                  </td>
                  <td>
                    <div className="d-flex flex-column gap-2">
                      <div className="d-flex gap-2 flex-wrap">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          disabled={startRouteMut.isPending || s.estado_pedido !== "PREPARADO"}
                          onClick={() => startRouteMut.mutate(s.id_pedido)}
                        >
                          {startRouteMut.isPending ? "Procesando..." : "Iniciar ruta"}
                        </button>
                      </div>

                      <div className="row g-2">
                        <div className="col-12 col-md-5">
                          <input
                            className="form-control form-control-sm"
                            placeholder="Nombre receptor"
                            value={receiverByOrder[s.id_pedido] || ""}
                            onChange={e => setReceiverByOrder(prev => ({ ...prev, [s.id_pedido]: e.target.value }))}
                          />
                        </div>
                        <div className="col-12 col-md-3">
                          <input
                            className="form-control form-control-sm"
                            placeholder="DNI (opcional)"
                            value={dniByOrder[s.id_pedido] || ""}
                            onChange={e => setDniByOrder(prev => ({ ...prev, [s.id_pedido]: e.target.value }))}
                          />
                        </div>
                        <div className="col-12 col-md-4 d-grid">
                          <button
                            className="btn btn-sm btn-success"
                            disabled={deliverMut.isPending || s.estado_pedido !== "EN CAMINO" || !(receiverByOrder[s.id_pedido] || "").trim()}
                            onClick={() =>
                              deliverMut.mutate({
                                orderId: s.id_pedido,
                                nombreReceptor: (receiverByOrder[s.id_pedido] || "").trim(),
                                dniReceptor: (dniByOrder[s.id_pedido] || "").trim(),
                                observacion: (observationByOrder[s.id_pedido] || "").trim(),
                              })
                            }
                          >
                            {deliverMut.isPending ? "Guardando..." : "Marcar entregado"}
                          </button>
                        </div>
                      </div>

                      <div className="row g-2">
                        <div className="col-12">
                          <input
                            className="form-control form-control-sm"
                            placeholder="Observación de entrega (opcional)"
                            value={observationByOrder[s.id_pedido] || ""}
                            onChange={e => setObservationByOrder(prev => ({ ...prev, [s.id_pedido]: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="row g-2">
                        <div className="col-12 col-md-8">
                          <input
                            className="form-control form-control-sm"
                            placeholder="Motivo de incidencia (cliente ausente, dirección incorrecta, etc.)"
                            value={incidenceReasonByOrder[s.id_pedido] || ""}
                            onChange={e => setIncidenceReasonByOrder(prev => ({ ...prev, [s.id_pedido]: e.target.value }))}
                          />
                        </div>
                        <div className="col-12 col-md-4 d-grid">
                          <button
                            className="btn btn-sm btn-outline-danger"
                            disabled={
                              failMut.isPending ||
                              !["EN CAMINO", "PREPARADO"].includes(s.estado_pedido) ||
                              !(incidenceReasonByOrder[s.id_pedido] || "").trim()
                            }
                            onClick={() => failMut.mutate({ orderId: s.id_pedido, motivo: (incidenceReasonByOrder[s.id_pedido] || "").trim() })}
                          >
                            {failMut.isPending ? "Guardando..." : "Registrar incidencia"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
