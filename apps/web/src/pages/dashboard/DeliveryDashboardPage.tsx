import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/http";
import { useAuth } from "../../auth/useAuth";
import { formatDateTime } from "../../shared/datetime";

type Shipment = {
  id_pedido: number;
  fecha_creacion: string;
  estado_pedido: "PREPARADO" | "EN CAMINO" | "ENTREGADO" | string;
  direccion_envio: string;
  total_pedido: number;
  cliente: string;
  telefono: string | null;
  estado_envio: string;
  fecha_asignacion?: string | null;
  fecha_inicio_ruta?: string | null;
  fecha_entrega?: string | null;
  motivo_no_entrega?: string | null;
};

function getErrorMessage(e: unknown, fallback = "Ocurrió un error") {
  if (!e || typeof e !== "object") return fallback;
  const msg = (e as { message?: unknown }).message;
  return typeof msg === "string" && msg.trim() ? msg : fallback;
}

export function DeliveryDashboardPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { logout } = useAuth();

  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [incidenceReasonByOrder, setIncidenceReasonByOrder] = useState<Record<number, string>>({});
  const [receiverByOrder, setReceiverByOrder] = useState<Record<number, string>>({});
  const [dniByOrder, setDniByOrder] = useState<Record<number, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["delivery", "my-shipments", estadoFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      if (estadoFilter) q.set("estado", estadoFilter);
      const qs = q.toString();
      return api.get<Shipment[]>(`/delivery/my-shipments${qs ? `?${qs}` : ""}`);
    },
  });

  const startRoute = useMutation({
    mutationFn: (orderId: number) => api.patch(`/delivery/${orderId}/start-route`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["delivery", "my-shipments"] });
    },
  });

  const deliver = useMutation({
    mutationFn: (input: { orderId: number; nombreReceptor: string; dniReceptor?: string }) =>
      api.patch(`/delivery/${input.orderId}/deliver`, {
        nombre_receptor: input.nombreReceptor,
        dni_receptor: input.dniReceptor || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["delivery", "my-shipments"] });
    },
  });

  const fail = useMutation({
    mutationFn: (input: { orderId: number; motivo: string }) => api.patch(`/delivery/${input.orderId}/fail`, { motivo: input.motivo }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["delivery", "my-shipments"] });
    },
  });

  const shipments = useMemo(() => data || [], [data]);

  return (
    <div className="d-flex">
      <aside id="sidebar" className="d-flex flex-column flex-shrink-0 p-3">
        <div className="text-center mb-4">
          <img src="/assets/images/logo-bodega.png" alt="logo" className="rounded-circle mb-2" width={80} height={80} />
          <h5 className="m-0 fw-semibold">Repartidor</h5>
        </div>

        <div className="menu-title">Panel Delivery</div>

        <div className="mt-auto">
          <button
            id="logout-btn"
            className="btn logout-btn w-100 d-inline-flex align-items-center justify-content-center"
            onClick={() => {
              logout();
              nav("/", { replace: true });
            }}
          >
            <i className="bi bi-box-arrow-right me-2"></i>
            Salir
          </button>
        </div>
      </aside>

      <main className="flex-grow-1 p-4">
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
              <option value="EN_RUTA">EN_RUTA</option>
              <option value="ENTREGADO">ENTREGADO</option>
              <option value="NO_ENTREGADO">NO_ENTREGADO</option>
            </select>
          </div>
        </div>

        {error ? <div className="alert alert-danger">{getErrorMessage(error, "Error al cargar pedidos")}</div> : null}
        {startRoute.isError ? <div className="alert alert-danger">{getErrorMessage(startRoute.error, "Error al iniciar ruta")}</div> : null}
        {deliver.isError ? <div className="alert alert-danger">{getErrorMessage(deliver.error, "Error al marcar entrega")}</div> : null}
        {fail.isError ? <div className="alert alert-danger">{getErrorMessage(fail.error, "Error al registrar incidencia")}</div> : null}

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
                      <span className="badge bg-secondary">{s.estado_envio || s.estado_pedido}</span>
                    </td>
                    <td>
                      <div className="d-flex flex-column gap-2">
                        <div className="d-flex gap-2 flex-wrap">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            disabled={startRoute.isPending || s.estado_pedido !== "PREPARADO"}
                            onClick={() => startRoute.mutate(s.id_pedido)}
                          >
                            {startRoute.isPending ? "Procesando..." : "Iniciar ruta"}
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
                              disabled={deliver.isPending || s.estado_pedido !== "EN CAMINO" || !(receiverByOrder[s.id_pedido] || "").trim()}
                              onClick={() =>
                                deliver.mutate({
                                  orderId: s.id_pedido,
                                  nombreReceptor: (receiverByOrder[s.id_pedido] || "").trim(),
                                  dniReceptor: (dniByOrder[s.id_pedido] || "").trim(),
                                })
                              }
                            >
                              {deliver.isPending ? "Guardando..." : "Marcar entregado"}
                            </button>
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
                                fail.isPending ||
                                !["EN CAMINO", "PREPARADO"].includes(s.estado_pedido) ||
                                !(incidenceReasonByOrder[s.id_pedido] || "").trim()
                              }
                              onClick={() => fail.mutate({ orderId: s.id_pedido, motivo: (incidenceReasonByOrder[s.id_pedido] || "").trim() })}
                            >
                              {fail.isPending ? "Guardando..." : "Registrar incidencia"}
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
      </main>
    </div>
  );
}
