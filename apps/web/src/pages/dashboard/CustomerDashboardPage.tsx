import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/http";
import { useAuth } from "../../auth/useAuth";
import { formatDateTime } from "../../shared/datetime";

type Profile = {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  direccion_principal?: string | null;
  rol?: string;
};

type Order = {
  id_pedido: number;
  fecha_creacion: string;
  estado_pedido: string;
  total_pedido: number;
  productos: Array<{ nombre: string; cantidad: number; precio_unitario_venta: number }>;
};

type ProfileFormValues = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion_principal: string;
};

function ProfileForm({
  initial,
  onSubmit,
  isPending,
}: {
  initial: ProfileFormValues;
  onSubmit: (values: ProfileFormValues) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<ProfileFormValues>(initial);

  return (
    <form
      id="profile-form"
      className="row gy-3"
      onSubmit={e => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="col-md-6">
        <label htmlFor="pf-nombre" className="form-label">
          Nombre
        </label>
        <input
          type="text"
          className="form-control"
          id="pf-nombre"
          name="nombre"
          required
          value={form.nombre}
          onChange={e => setForm(s => ({ ...s, nombre: e.target.value }))}
        />
      </div>
      <div className="col-md-6">
        <label htmlFor="pf-apellido" className="form-label">
          Apellido
        </label>
        <input
          type="text"
          className="form-control"
          id="pf-apellido"
          name="apellido"
          required
          value={form.apellido}
          onChange={e => setForm(s => ({ ...s, apellido: e.target.value }))}
        />
      </div>
      <div className="col-md-6">
        <label htmlFor="pf-email" className="form-label">
          Correo electrónico
        </label>
        <input type="email" className="form-control" id="pf-email" name="email" readOnly value={form.email} />
      </div>
      <div className="col-md-6">
        <label htmlFor="pf-telefono" className="form-label">
          Teléfono
        </label>
        <input
          type="text"
          className="form-control"
          id="pf-telefono"
          name="telefono"
          value={form.telefono}
          onChange={e => setForm(s => ({ ...s, telefono: e.target.value }))}
        />
      </div>
      <div className="col-12">
        <label htmlFor="pf-direccion" className="form-label">
          Dirección principal
        </label>
        <input
          type="text"
          className="form-control"
          id="pf-direccion"
          name="direccion_principal"
          value={form.direccion_principal}
          onChange={e => setForm(s => ({ ...s, direccion_principal: e.target.value }))}
        />
      </div>
      <div className="col-12 text-end">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? "Actualizando..." : "Actualizar datos"}
        </button>
      </div>
    </form>
  );
}

function getToken(): string | null {
  return localStorage.getItem("auth_token") || localStorage.getItem("token") || null;
}

export function CustomerDashboardPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { logout } = useAuth();
  const [params, setParams] = useSearchParams();

  const tabParam = params.get("tab") || "profile";
  const tab: "profile" | "orders" = tabParam === "orders" ? "orders" : "profile";

  const { data: profileData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<{ user: Profile }>("/auth/me"),
  });

  const profile = profileData?.user;
  const firstName = useMemo(() => {
    const n = (profile?.nombre || "Cliente").trim();
    return n.split(" ")[0] || "Cliente";
  }, [profile?.nombre]);

  const initialForm = useMemo<ProfileFormValues>(() => {
    return {
      nombre: profile?.nombre || "",
      apellido: profile?.apellido || "",
      email: profile?.email || "",
      telefono: profile?.telefono || "",
      direccion_principal: profile?.direccion_principal || "",
    };
  }, [profile?.nombre, profile?.apellido, profile?.email, profile?.telefono, profile?.direccion_principal]);

  const updateProfile = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const payload = {
        nombre: values.nombre,
        apellido: values.apellido,
        telefono: values.telefono,
        direccion_principal: values.direccion_principal,
      };
      return api.put<{ user: Profile }>("/auth/me", payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["orders", "my"],
    queryFn: () => api.get<Order[]>("/orders/my"),
    enabled: tab === "orders",
  });

  // SSE: refresca pedidos en tiempo real
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let closed = false;
    let es: EventSource | null = null;

    const connect = () => {
      if (closed) return;
      try {
        es = new EventSource(`/api/orders/stream?token=${encodeURIComponent(token)}`);
        es.addEventListener("order-update", () => {
          void qc.invalidateQueries({ queryKey: ["orders", "my"] });
        });
        es.onerror = () => {
          try {
            es?.close();
          } catch {
            // ignore
          }
          es = null;
          setTimeout(connect, 3000);
        };
      } catch {
        // ignore
      }
    };

    connect();
    return () => {
      closed = true;
      try {
        es?.close();
      } catch {
        // ignore
      }
    };
  }, [qc]);

  const statusMap: Record<string, string> = {
    PENDIENTE: "warning",
    "EN CAMINO": "info",
    PREPARADO: "primary",
    ENTREGADO: "success",
    CANCELADO: "secondary",
    ANULADO: "secondary",
    OBSERVADO: "danger",
  };

  return (
    <main className="container py-4 dashboard-container">
      <header className="dash-header mb-3">
        <h1 className="mb-1">
          Hola, <span id="cliente-nombre">{firstName}</span>
        </h1>
        <div className="dash-subtitle">Gestiona tus datos y revisa tus compras</div>
      </header>

      <nav className="nav-dashboard mb-4">
        <a
          href="#"
          className={`nav-link ${tab === "profile" ? "active" : ""}`}
          id="tab-profile"
          onClick={e => {
            e.preventDefault();
            setParams({ tab: "profile" }, { replace: true });
          }}
        >
          <i className="fa fa-user-circle"></i> Datos personales
        </a>
        <a
          href="#"
          className={`nav-link ${tab === "orders" ? "active" : ""}`}
          id="tab-orders"
          onClick={e => {
            e.preventDefault();
            setParams({ tab: "orders" }, { replace: true });
          }}
        >
          <i className="fa fa-shopping-bag"></i> Mis compras
        </a>
        <a
          href="#"
          className="nav-link text-danger ms-auto"
          id="logout-btn"
          onClick={e => {
            e.preventDefault();
            logout();
            nav("/", { replace: true });
          }}
        >
          <i className="fa fa-sign-out-alt"></i> Cerrar sesión
        </a>
      </nav>

      {/* DATOS PERSONALES */}
      <section id="section-profile" style={{ display: tab === "profile" ? "block" : "none" }}>
        <div className="card card-soft mb-4">
          <div className="card-body">
            <h5 className="card-title">Datos personales</h5>
            <ProfileForm
              key={`${profile?.id_usuario || "u"}:${profile?.nombre || ""}:${profile?.apellido || ""}:${profile?.telefono || ""}:${
                profile?.direccion_principal || ""
              }`}
              initial={initialForm}
              isPending={updateProfile.isPending}
              onSubmit={values => updateProfile.mutate(values)}
            />
          </div>
        </div>
      </section>

      {/* MIS COMPRAS */}
      <section id="section-orders" style={{ display: tab === "orders" ? "block" : "none" }}>
        <div className="card card-soft">
          <div className="card-body">
            <h5 className="card-title">Mis Compras Online</h5>
            <div id="orders-list" className="orders-table">
              {ordersLoading ? <div className="text-center my-3">Cargando...</div> : null}

              {!ordersLoading && (!orders || orders.length === 0) ? (
                <div className="alert alert-warning text-center mb-0">
                  <b>¡Oh! Aún no tienes compras online.</b>
                  <br />
                  <Link to="/products" className="btn btn-primary mt-2">
                    Comprar
                  </Link>
                </div>
              ) : null}

              {!ordersLoading && orders && orders.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-striped table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th># Pedido</th>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th>Total (S/)</th>
                        <th>Productos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => {
                        const cls = (statusMap[o.estado_pedido] || "secondary").toLowerCase();
                        const dt = formatDateTime(o.fecha_creacion, "datetime");
                        return (
                          <tr key={o.id_pedido}>
                            <td className="fw-semibold">{o.id_pedido}</td>
                            <td className="text-nowrap">
                              {!dt ? (
                                <span className="text-muted">—</span>
                              ) : (
                                <div title={dt.raw}>
                                  <div className="fw-semibold">{dt.date}</div>
                                  <div className="text-muted small">{dt.time}</div>
                                </div>
                              )}
                            </td>
                            <td>
                              <span className={`badge status-badge status-${cls}`}>{o.estado_pedido}</span>
                            </td>
                            <td className="fw-semibold">{Number(o.total_pedido ?? 0).toFixed(2)}</td>
                            <td className="products-col">{o.productos.map(p => `${p.nombre} x${p.cantidad}`).join("\n")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
