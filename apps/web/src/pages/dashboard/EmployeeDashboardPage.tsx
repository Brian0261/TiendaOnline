import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import type { ApiError } from "../../api/http";
import { api } from "../../api/http";
import { downloadApiFile } from "../../api/download";
import { formatDateTime } from "../../shared/datetime";

type Section = "pending" | "transitionable" | "status-log" | "inventory" | "dispatch";

type EmployeeKpis = {
  pendientes: number;
  encamino: number;
  entregadosHoy: number;
};

type PendingOrder = {
  id_pedido: number;
  fecha_creacion: string; // YYYY-MM-DD
  cliente: string;
  direccion_envio: string | null;
  estado: string;
  productos: Array<{ cantidad: number; nombre: string }>;
};

type TransitionableOrder = {
  id_pedido: number;
  fecha_creacion: string;
  estado_actual: "PREPARADO" | "EN CAMINO";
  siguiente_estado: "EN CAMINO" | "ENTREGADO" | null;
  cliente: string;
  direccion_envio: string | null;
};

type StatusLogRow = {
  fecha_accion_utc: string;
  id_pedido: number;
  responsable: string;
  anterior: string | null;
  nuevo: string | null;
};

type InventoryRow = {
  id_inventario: number;
  id_producto: number;
  id_almacen: number;
  nombre_almacen: string;
  nombre_producto: string;
  stock: number;
};

type OutboundRow = {
  id_salida_inventario: number;
  fecha_salida_utc: string;
  producto: string;
  cantidad: number;
  motivo: string | null;
  almacen: string | null;
  responsable: string | null;
};

function getErrorMessage(err: unknown): string {
  if (!err) return "Ocurrió un error";
  const e = err as Partial<ApiError>;
  if (typeof e.message === "string" && e.message.trim()) return e.message;
  return "Ocurrió un error";
}

export function EmployeeDashboardPage() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const [section, setSection] = useState<Section>("pending");
  const qc = useQueryClient();

  const [exportingGeneric, setExportingGeneric] = useState(false);
  const [genericExportError, setGenericExportError] = useState<string | null>(null);

  async function exportFile(path: string, fallbackFilename: string): Promise<void> {
    try {
      setGenericExportError(null);
      setExportingGeneric(true);
      await downloadApiFile(path, fallbackFilename);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al exportar";
      setGenericExportError(msg);
    } finally {
      setExportingGeneric(false);
    }
  }

  const [inventoryDraft, setInventoryDraft] = useState<{ search: string; almacen: string }>({ search: "", almacen: "" });
  const [inventoryApplied, setInventoryApplied] = useState<{ search: string; almacen: string } | null>(null);

  const [dispatchDraft, setDispatchDraft] = useState<{ fechaInicio: string; fechaFin: string; search: string; almacen: string }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const toDateInputValue = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };
    return { fechaInicio: toDateInputValue(start), fechaFin: toDateInputValue(end), search: "", almacen: "" };
  });
  const [dispatchApplied, setDispatchApplied] = useState<typeof dispatchDraft | null>(null);
  const [dispatchCreateDraft, setDispatchCreateDraft] = useState<{
    id_pedido: string;
    observacion: string;
    items: Array<{ id_inventario: string; cantidad: string }>;
  }>({ id_pedido: "", observacion: "", items: [{ id_inventario: "", cantidad: "" }] });

  useEffect(() => {
    document.body.classList.add("d-flex");
    return () => {
      document.body.classList.remove("d-flex");
    };
  }, []);

  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
  } = useQuery({
    queryKey: ["employee", "kpis"],
    queryFn: () => api.get<EmployeeKpis>("/orders/kpis"),
  });

  const {
    data: pendingOrders,
    isLoading: pendingLoading,
    error: pendingError,
  } = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: () => api.get<PendingOrder[]>("/orders/pending"),
    enabled: section === "pending",
  });

  const {
    data: transitionable,
    isLoading: transitionableLoading,
    error: transitionableError,
  } = useQuery({
    queryKey: ["orders", "transitionable"],
    queryFn: () => api.get<TransitionableOrder[]>("/orders/transitionable"),
    enabled: section === "transitionable",
  });

  const {
    data: statusLog,
    isLoading: statusLogLoading,
    error: statusLogError,
  } = useQuery({
    queryKey: ["orders", "status-log"],
    queryFn: () => api.get<StatusLogRow[]>("/orders/status-log?limit=50"),
    enabled: section === "status-log",
  });

  const {
    data: inventoryRows,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery({
    queryKey: ["employee", "inventory", inventoryApplied],
    queryFn: () => {
      const f = inventoryApplied || { search: "", almacen: "" };
      const q = new URLSearchParams();
      if (f.search.trim()) q.set("search", f.search.trim());
      if (f.almacen.trim()) q.set("almacen", f.almacen.trim());
      const qs = q.toString();
      return api.get<InventoryRow[]>(`/inventory${qs ? `?${qs}` : ""}`);
    },
    enabled: section === "inventory",
  });

  const {
    data: outboundRows,
    isLoading: outboundLoading,
    error: outboundError,
  } = useQuery({
    queryKey: ["employee", "dispatch", "outbound", dispatchApplied],
    queryFn: () => {
      const f = dispatchApplied || { fechaInicio: "", fechaFin: "", search: "", almacen: "" };
      const q = new URLSearchParams();
      if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
      if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
      if (f.search.trim()) q.set("search", f.search.trim());
      if (f.almacen.trim()) q.set("almacen", f.almacen.trim());
      const qs = q.toString();
      return api.get<OutboundRow[]>(`/dispatch/outbound${qs ? `?${qs}` : ""}`);
    },
    enabled: section === "dispatch" && !!dispatchApplied,
  });

  const createDispatch = useMutation({
    mutationFn: (payload: { id_pedido: number | null; observacion: string; items: Array<{ id_inventario: number; cantidad: number }> }) =>
      api.post<{
        ok: boolean;
        message?: string;
        items?: Array<{ id_inventario: number; cantidad: number; nuevo_stock: number | null; nombre: string }>;
      }>("/dispatch", payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employee", "dispatch", "outbound"] }),
        qc.invalidateQueries({ queryKey: ["employee", "inventory"] }),
      ]);
    },
  });

  const markPrepared = useMutation({
    mutationFn: (id: number) => api.patch<{ ok: true; message?: string }>(`/orders/${id}/prepare`),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders", "pending"] }),
        qc.invalidateQueries({ queryKey: ["orders", "transitionable"] }),
        qc.invalidateQueries({ queryKey: ["orders", "status-log"] }),
        qc.invalidateQueries({ queryKey: ["employee", "kpis"] }),
      ]);
    },
  });

  const transition = useMutation({
    mutationFn: (input: { id: number; from: string; to: string }) =>
      api.patch<{ ok: true; id_pedido: number; from: string; to: string }>(`/orders/${input.id}/transition`, {
        from: input.from,
        to: input.to,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders", "transitionable"] }),
        qc.invalidateQueries({ queryKey: ["orders", "status-log"] }),
        qc.invalidateQueries({ queryKey: ["employee", "kpis"] }),
      ]);
    },
  });

  const headerTitle = useMemo(() => {
    return section === "pending"
      ? "Pedidos pendientes"
      : section === "transitionable"
      ? "Transiciones"
      : section === "status-log"
      ? "Historial de estados"
      : section === "inventory"
      ? "Inventario"
      : "Despachos";
  }, [section]);

  return (
    <div className="d-flex">
      <aside id="sidebar" className="d-flex flex-column flex-shrink-0 p-3">
        <div className="text-center mb-4">
          <img src="/assets/images/logo-bodega.png" alt="logo" className="rounded-circle mb-2" width={80} height={80} />
          <h5 className="m-0 fw-semibold">Empleado</h5>
        </div>

        <div className="menu-title">Panel Empleado</div>
        <ul className="nav nav-pills flex-column mb-auto">
          <li className="nav-item">
            <button className={`nav-link ${section === "pending" ? "active" : ""}`} onClick={() => setSection("pending")}>
              <i className="fa-solid fa-clipboard-list"></i> Pedidos pendientes
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "transitionable" ? "active" : ""}`} onClick={() => setSection("transitionable")}>
              <i className="fa-solid fa-truck-fast"></i> Transiciones
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "status-log" ? "active" : ""}`} onClick={() => setSection("status-log")}>
              <i className="fa-solid fa-list"></i> Historial de estados
            </button>
          </li>
          <li>
            <button
              className={`nav-link ${section === "inventory" ? "active" : ""}`}
              onClick={() => {
                setSection("inventory");
                setInventoryApplied(s => s ?? { ...inventoryDraft });
              }}
            >
              <i className="fa-solid fa-boxes-stacked"></i> Inventario
            </button>
          </li>
          <li>
            <button
              className={`nav-link ${section === "dispatch" ? "active" : ""}`}
              onClick={() => {
                setSection("dispatch");
                setDispatchApplied(s => s ?? { ...dispatchDraft });
              }}
            >
              <i className="fa-solid fa-truck"></i> Despachos
            </button>
          </li>
          <li className="mt-auto">
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
          </li>
        </ul>
      </aside>

      <main className="flex-grow-1 p-4">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">{headerTitle}</h4>
            <div className="text-muted small">Gestión operativa de pedidos y su trazabilidad.</div>
          </div>

          <div className="d-flex align-items-center justify-content-end gap-2 flex-wrap">
            {section === "pending" ? (
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => exportFile("/orders/pending/export", "pedidos-pendientes.csv")}
                disabled={exportingGeneric}
              >
                {exportingGeneric ? "Exportando..." : "Exportar pendientes (CSV)"}
              </button>
            ) : null}

            {section === "status-log" ? (
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => exportFile("/orders/status-log/export", "historial-estados.csv")}
                disabled={exportingGeneric}
              >
                {exportingGeneric ? "Exportando..." : "Exportar historial (CSV)"}
              </button>
            ) : null}

            {section === "inventory" ? (
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => {
                  const f = inventoryApplied || { search: "", almacen: "" };
                  const q = new URLSearchParams();
                  if (f.search.trim()) q.set("search", f.search.trim());
                  if (f.almacen.trim()) q.set("almacen", f.almacen.trim());
                  const qs = q.toString();
                  exportFile(`/inventory/export${qs ? `?${qs}` : ""}`, "inventario.csv");
                }}
                disabled={exportingGeneric}
              >
                {exportingGeneric ? "Exportando..." : "Exportar inventario (CSV)"}
              </button>
            ) : null}

            {section === "dispatch" ? (
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => {
                  const f = dispatchApplied || { fechaInicio: "", fechaFin: "", search: "", almacen: "" };
                  const q = new URLSearchParams();
                  if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
                  if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
                  if (f.search.trim()) q.set("search", f.search.trim());
                  if (f.almacen.trim()) q.set("almacen", f.almacen.trim());
                  const qs = q.toString();
                  exportFile(`/dispatch/outbound/export${qs ? `?${qs}` : ""}`, "despachos.csv");
                }}
                disabled={exportingGeneric}
              >
                {exportingGeneric ? "Exportando..." : "Exportar despachos (CSV)"}
              </button>
            ) : null}

            <span className="badge bg-light text-dark">Pendientes: {kpisLoading ? "…" : kpis?.pendientes ?? "—"}</span>
            <span className="badge bg-light text-dark">En camino: {kpisLoading ? "…" : kpis?.encamino ?? "—"}</span>
            <span className="badge bg-light text-dark">Entregados hoy: {kpisLoading ? "…" : kpis?.entregadosHoy ?? "—"}</span>
          </div>
        </div>

        {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}

        {kpisError ? <div className="alert alert-warning">{getErrorMessage(kpisError)}</div> : null}

        {section === "pending" ? (
          <section className="card">
            <div className="card-body">
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
                              disabled={markPrepared.isPending}
                              onClick={() => markPrepared.mutate(p.id_pedido)}
                            >
                              {markPrepared.isPending ? "Procesando..." : "Marcar preparado"}
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
        ) : null}

        {section === "transitionable" ? (
          <section className="card">
            <div className="card-body">
              {transitionableError ? <div className="alert alert-danger">{getErrorMessage(transitionableError)}</div> : null}
              {transition.isError ? <div className="alert alert-danger">{getErrorMessage(transition.error)}</div> : null}

              {transitionableLoading ? <div className="text-muted">Cargando...</div> : null}

              {!transitionableLoading && transitionable && transitionable.length === 0 ? (
                <div className="alert alert-info mb-0">No hay pedidos en transición.</div>
              ) : null}

              {!transitionableLoading && transitionable && transitionable.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th title="ID del pedido">N° pedido</th>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Estado actual</th>
                        <th>Siguiente</th>
                        <th className="text-end">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transitionable.map(o => (
                        <tr key={o.id_pedido}>
                          <td className="fw-semibold">{o.id_pedido}</td>
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
                          <td>{o.cliente}</td>
                          <td>
                            <span className="badge bg-secondary">{o.estado_actual}</span>
                          </td>
                          <td>{o.siguiente_estado || "—"}</td>
                          <td className="text-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={!o.siguiente_estado || transition.isPending}
                              onClick={() =>
                                o.siguiente_estado ? transition.mutate({ id: o.id_pedido, from: o.estado_actual, to: o.siguiente_estado }) : undefined
                              }
                            >
                              {transition.isPending ? "Procesando..." : "Aplicar"}
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
        ) : null}

        {section === "status-log" ? (
          <section className="card">
            <div className="card-body">
              {statusLogError ? <div className="alert alert-danger">{getErrorMessage(statusLogError)}</div> : null}

              {statusLogLoading ? <div className="text-muted">Cargando...</div> : null}

              {!statusLogLoading && statusLog && statusLog.length === 0 ? <div className="alert alert-info mb-0">No hay registros.</div> : null}

              {!statusLogLoading && statusLog && statusLog.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Fecha (UTC)</th>
                        <th>Pedido</th>
                        <th>Anterior</th>
                        <th>Nuevo</th>
                        <th>Responsable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusLog.map(r => (
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
                          <td>{r.anterior || "—"}</td>
                          <td>{r.nuevo || "—"}</td>
                          <td>{r.responsable}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {section === "inventory" ? (
          <section className="card">
            <div className="card-body">
              <form
                className="row g-2 align-items-end mb-3"
                onSubmit={e => {
                  e.preventDefault();
                  setInventoryApplied({ ...inventoryDraft });
                }}
              >
                <div className="col-sm-6 col-md-4">
                  <label className="form-label" htmlFor="emp-inv-search">
                    Buscar producto
                  </label>
                  <input
                    id="emp-inv-search"
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Nombre del producto"
                    value={inventoryDraft.search}
                    onChange={e => setInventoryDraft(s => ({ ...s, search: e.target.value }))}
                  />
                </div>
                <div className="col-sm-6 col-md-2">
                  <label className="form-label" htmlFor="emp-inv-almacen">
                    ID almacén
                  </label>
                  <input
                    id="emp-inv-almacen"
                    type="number"
                    className="form-control form-control-sm"
                    placeholder="(opcional)"
                    value={inventoryDraft.almacen}
                    onChange={e => setInventoryDraft(s => ({ ...s, almacen: e.target.value }))}
                  />
                </div>
                <div className="col-sm-6 col-md-2">
                  <button type="submit" className="btn btn-sm btn-primary w-100">
                    Aplicar
                  </button>
                </div>
              </form>

              {inventoryError ? <div className="alert alert-danger">{getErrorMessage(inventoryError)}</div> : null}
              {inventoryLoading ? <div className="text-muted">Cargando...</div> : null}

              {!inventoryLoading && inventoryRows && inventoryRows.length === 0 ? (
                <div className="alert alert-info mb-0">Sin resultados para los filtros actuales.</div>
              ) : null}

              {!inventoryLoading && inventoryRows && inventoryRows.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Almacén</th>
                        <th className="text-end">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryRows.map(r => (
                        <tr key={r.id_inventario}>
                          <td>{r.nombre_producto}</td>
                          <td>
                            <div className="fw-semibold">{r.nombre_almacen}</div>
                            <div className="text-muted small">ID: {r.id_almacen}</div>
                          </td>
                          <td className="text-end fw-semibold">{r.stock ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {section === "dispatch" ? (
          <section className="card">
            <div className="card-body">
              <div className="row g-3">
                <div className="col-12 col-lg-6">
                  <div className="card border">
                    <div className="card-body">
                      <h6 className="mb-3">Registrar salida</h6>

                      {createDispatch.isError ? <div className="alert alert-danger">{getErrorMessage(createDispatch.error)}</div> : null}
                      {createDispatch.isSuccess ? <div className="alert alert-success">Despacho registrado.</div> : null}

                      <form
                        className="row g-2"
                        onSubmit={e => {
                          e.preventDefault();

                          const idPedido = dispatchCreateDraft.id_pedido.trim() ? Number(dispatchCreateDraft.id_pedido) : null;
                          if (dispatchCreateDraft.id_pedido.trim() && (!Number.isFinite(idPedido) || Number(idPedido) <= 0)) {
                            window.alert("ID de pedido inválido");
                            return;
                          }

                          const items = dispatchCreateDraft.items
                            .map(it => ({ id_inventario: Number(it.id_inventario), cantidad: Number(it.cantidad) }))
                            .filter(
                              it => Number.isFinite(it.id_inventario) && it.id_inventario > 0 && Number.isFinite(it.cantidad) && it.cantidad > 0
                            );

                          if (items.length === 0) {
                            window.alert("Agrega al menos 1 ítem válido (id_inventario y cantidad > 0)");
                            return;
                          }

                          createDispatch.mutate({ id_pedido: idPedido, observacion: dispatchCreateDraft.observacion.trim(), items });
                        }}
                      >
                        <div className="col-12 col-md-4">
                          <label className="form-label" htmlFor="emp-dispatch-idpedido">
                            ID pedido (opcional)
                          </label>
                          <input
                            id="emp-dispatch-idpedido"
                            className="form-control form-control-sm"
                            type="number"
                            value={dispatchCreateDraft.id_pedido}
                            onChange={e => setDispatchCreateDraft(s => ({ ...s, id_pedido: e.target.value }))}
                            placeholder="123"
                          />
                        </div>

                        <div className="col-12 col-md-8">
                          <label className="form-label" htmlFor="emp-dispatch-observacion">
                            Observación
                          </label>
                          <input
                            id="emp-dispatch-observacion"
                            className="form-control form-control-sm"
                            type="text"
                            value={dispatchCreateDraft.observacion}
                            onChange={e => setDispatchCreateDraft(s => ({ ...s, observacion: e.target.value }))}
                            placeholder="Motivo / referencia"
                          />
                        </div>

                        <div className="col-12">
                          <label className="form-label">Ítems</label>
                          <div className="d-flex flex-column gap-2">
                            {dispatchCreateDraft.items.map((it, i) => (
                              <div key={i} className="d-flex gap-2">
                                <input
                                  className="form-control form-control-sm"
                                  style={{ maxWidth: 160 }}
                                  type="number"
                                  placeholder="ID inventario"
                                  value={it.id_inventario}
                                  onChange={e =>
                                    setDispatchCreateDraft(s => ({
                                      ...s,
                                      items: s.items.map((x, idx) => (idx === i ? { ...x, id_inventario: e.target.value } : x)),
                                    }))
                                  }
                                />
                                <input
                                  className="form-control form-control-sm"
                                  style={{ maxWidth: 160 }}
                                  type="number"
                                  placeholder="Cantidad"
                                  value={it.cantidad}
                                  onChange={e =>
                                    setDispatchCreateDraft(s => ({
                                      ...s,
                                      items: s.items.map((x, idx) => (idx === i ? { ...x, cantidad: e.target.value } : x)),
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  disabled={dispatchCreateDraft.items.length <= 1}
                                  onClick={() => setDispatchCreateDraft(s => ({ ...s, items: s.items.filter((_, idx) => idx !== i) }))}
                                >
                                  Quitar
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="col-12 d-flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setDispatchCreateDraft(s => ({ ...s, items: [...s.items, { id_inventario: "", cantidad: "" }] }))}
                          >
                            + Agregar ítem
                          </button>
                          <button type="submit" className="btn btn-sm btn-primary" disabled={createDispatch.isPending}>
                            {createDispatch.isPending ? "Registrando..." : "Registrar despacho"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-lg-6">
                  <div className="card border">
                    <div className="card-body">
                      <h6 className="mb-3">Filtros</h6>
                      <form
                        className="row g-2 align-items-end"
                        onSubmit={e => {
                          e.preventDefault();
                          setDispatchApplied({ ...dispatchDraft });
                        }}
                      >
                        <div className="col-12 col-md-6">
                          <label className="form-label" htmlFor="emp-disp-fechaInicio">
                            Fecha inicio
                          </label>
                          <input
                            id="emp-disp-fechaInicio"
                            type="date"
                            className="form-control form-control-sm"
                            value={dispatchDraft.fechaInicio}
                            onChange={e => setDispatchDraft(s => ({ ...s, fechaInicio: e.target.value }))}
                          />
                        </div>
                        <div className="col-12 col-md-6">
                          <label className="form-label" htmlFor="emp-disp-fechaFin">
                            Fecha fin
                          </label>
                          <input
                            id="emp-disp-fechaFin"
                            type="date"
                            className="form-control form-control-sm"
                            value={dispatchDraft.fechaFin}
                            onChange={e => setDispatchDraft(s => ({ ...s, fechaFin: e.target.value }))}
                          />
                        </div>
                        <div className="col-12 col-md-6">
                          <label className="form-label" htmlFor="emp-disp-search">
                            Buscar
                          </label>
                          <input
                            id="emp-disp-search"
                            type="search"
                            className="form-control form-control-sm"
                            placeholder="Producto / motivo / responsable"
                            value={dispatchDraft.search}
                            onChange={e => setDispatchDraft(s => ({ ...s, search: e.target.value }))}
                          />
                        </div>
                        <div className="col-12 col-md-3">
                          <label className="form-label" htmlFor="emp-disp-almacen">
                            ID almacén
                          </label>
                          <input
                            id="emp-disp-almacen"
                            type="number"
                            className="form-control form-control-sm"
                            placeholder="(opcional)"
                            value={dispatchDraft.almacen}
                            onChange={e => setDispatchDraft(s => ({ ...s, almacen: e.target.value }))}
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

              {dispatchApplied && !outboundLoading && outboundRows && outboundRows.length === 0 ? (
                <div className="alert alert-info mb-0">Sin registros para los filtros actuales.</div>
              ) : null}

              {dispatchApplied && !outboundLoading && outboundRows && outboundRows.length > 0 ? (
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
                        <th>Almacén</th>
                        <th>Responsable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outboundRows.map(r => (
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
                          <td>{r.almacen || "—"}</td>
                          <td>{r.responsable || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
