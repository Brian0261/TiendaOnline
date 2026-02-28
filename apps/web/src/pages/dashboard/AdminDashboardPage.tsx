import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/http";
import type { ApiError } from "../../api/http";
import { downloadApiFile } from "../../api/download";
import { useAuth } from "../../auth/useAuth";
import { formatDateTime } from "../../shared/datetime";

type Section = "dashboard" | "products" | "reports" | "orders" | "audit" | "inventory" | "dispatch" | "categories";

type DashboardOverview = {
  year: number;
  kpis: {
    salesYear: number;
    ordersYear: number;
    avgTicket: number;
    units: number;
    customers: number;
    deliveredRate: number;
  };
  monthly: {
    sales: Array<{ y: number; m: number; total: number }>;
    orders: Array<{ y: number; m: number; count: number }>;
  };
  topCategories: Array<{ name: string; total: number }>;
  recent: Array<{ id: number; fecha: string; cliente: string; estado: string; total: number }>;
};

type ProductRow = {
  id: number;
  nombre: string;
  descripcion?: string;
  precio: number;
  imagen: string;
  stock: number;
  activo: boolean;
  id_categoria?: number;
  categoryName?: string;
  id_marca?: number;
  brandName?: string;
};

type SalesReport = {
  totalVentas: number;
  pedidosCompletados: number;
  topProductos: Array<{ nombre: string; cantidad: number; total: number }>;
  topMetodosPago: Array<{ nombre: string; cantidad: number }>;
};

type AdminOrder = {
  id_pedido: number;
  fecha_creacion: string;
  estado_pedido: string;
  total_pedido: number;
  id_usuario: number;
  cliente: string;
  email: string;
  productos: Array<{ nombre: string; cantidad: number; precio_unitario_venta: number }>;
};

type AuditRow = {
  id_historial: number;
  accion: string;
  descripcion: string;
  fecha_accion: string;
  id_pedido: number | null;
  id_reclamo: number | null;
  id_usuario: number;
  usuario: string;
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
  motivo: string;
  almacen: string;
  responsable: string;
};

type CategoryRow = {
  id: number;
  nombre: string;
};

type ProductCatalogOption = {
  id: number;
  name: string;
};

function getErrorMessage(err: unknown): string {
  if (!err) return "Ocurrió un error";
  const e = err as Partial<ApiError>;
  if (typeof e.message === "string" && e.message.trim()) return e.message;
  return "Ocurrió un error";
}

function toDateInputValue(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

const money = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AdminDashboardPage() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const [section, setSection] = useState<Section>("dashboard");
  const qc = useQueryClient();

  const [exportingInventory, setExportingInventory] = useState(false);
  const [inventoryExportError, setInventoryExportError] = useState<string | null>(null);
  const [exportingGeneric, setExportingGeneric] = useState(false);
  const [genericExportError, setGenericExportError] = useState<string | null>(null);

  async function exportInventoryCsv(): Promise<void> {
    try {
      setInventoryExportError(null);
      setExportingInventory(true);
      await downloadApiFile("/inventory/export", "inventario.csv");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al exportar inventario";
      setInventoryExportError(msg);
    } finally {
      setExportingInventory(false);
    }
  }

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

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(() => now.getFullYear());

  const [productStatus, setProductStatus] = useState<"active" | "inactive">("active");
  const [productSearch, setProductSearch] = useState<string>("");

  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [createProductDraft, setCreateProductDraft] = useState<{
    name: string;
    description: string;
    price: string;
    stock: string;
    categoryId: string;
    brandId: string;
    image: File | null;
  }>({ name: "", description: "", price: "", stock: "0", categoryId: "", brandId: "", image: null });

  const [createImagePreviewUrl, setCreateImagePreviewUrl] = useState<string | null>(null);

  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editProductDraft, setEditProductDraft] = useState<{
    name: string;
    description: string;
    price: string;
    categoryId: string;
    brandId: string;
    image: File | null;
  }>({ name: "", description: "", price: "", categoryId: "", brandId: "", image: null });
  const [editOriginalImageUrl, setEditOriginalImageUrl] = useState<string | null>(null);
  const [editImagePreviewUrl, setEditImagePreviewUrl] = useState<string | null>(null);

  const [salesDraft, setSalesDraft] = useState<{ fechaInicio: string; fechaFin: string }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { fechaInicio: toDateInputValue(start), fechaFin: toDateInputValue(end) };
  });
  const [salesApplied, setSalesApplied] = useState<{ fechaInicio: string; fechaFin: string } | null>(null);

  const [ordersDraft, setOrdersDraft] = useState<{ search: string; estado: string; fechaInicio: string; fechaFin: string }>({
    search: "",
    estado: "",
    fechaInicio: "",
    fechaFin: "",
  });
  const [ordersApplied, setOrdersApplied] = useState<typeof ordersDraft | null>(null);

  const [inventoryDraft, setInventoryDraft] = useState<{ search: string; almacen: string }>({ search: "", almacen: "" });
  const [inventoryApplied, setInventoryApplied] = useState<{ search: string; almacen: string } | null>(null);

  const [dispatchDraft, setDispatchDraft] = useState<{ fechaInicio: string; fechaFin: string; search: string; almacen: string }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { fechaInicio: toDateInputValue(start), fechaFin: toDateInputValue(end), search: "", almacen: "" };
  });
  const [dispatchApplied, setDispatchApplied] = useState<typeof dispatchDraft | null>(null);
  const [dispatchCreateDraft, setDispatchCreateDraft] = useState<{
    id_pedido: string;
    observacion: string;
    items: Array<{ id_inventario: string; cantidad: string }>;
  }>({ id_pedido: "", observacion: "", items: [{ id_inventario: "", cantidad: "" }] });

  const [categoryNewName, setCategoryNewName] = useState<string>("");
  const [categoryEditingId, setCategoryEditingId] = useState<number | null>(null);
  const [categoryEditingName, setCategoryEditingName] = useState<string>("");

  useEffect(() => {
    document.body.classList.add("d-flex");
    return () => {
      document.body.classList.remove("d-flex");
    };
  }, []);

  useEffect(() => {
    if (!createProductDraft.image) {
      setCreateImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(createProductDraft.image);
    setCreateImagePreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [createProductDraft.image]);

  useEffect(() => {
    if (!editProductDraft.image) {
      setEditImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(editProductDraft.image);
    setEditImagePreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [editProductDraft.image]);

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useQuery({
    queryKey: ["admin", "overview", year],
    queryFn: () => api.get<DashboardOverview>(`/reports/dashboard?year=${encodeURIComponent(String(year))}`),
    enabled: section === "dashboard",
  });

  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
  } = useQuery({
    queryKey: ["admin", "products", productStatus, productSearch],
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("status", productStatus);
      if (productSearch.trim()) q.set("search", productSearch.trim());
      return api.get<ProductRow[]>(`/products?${q.toString()}`);
    },
    enabled: section === "products",
  });

  const {
    data: productCategories,
    isLoading: productCategoriesLoading,
    error: productCategoriesError,
  } = useQuery({
    queryKey: ["admin", "product-categories"],
    queryFn: () => api.get<ProductCatalogOption[]>("/products/categories"),
    enabled: section === "products",
  });

  const {
    data: productBrands,
    isLoading: productBrandsLoading,
    error: productBrandsError,
  } = useQuery({
    queryKey: ["admin", "product-brands"],
    queryFn: () => api.get<ProductCatalogOption[]>("/products/brands"),
    enabled: section === "products",
  });

  const createProduct = useMutation({
    mutationFn: (form: FormData) => api.post<ProductRow>("/products", form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      setCreateProductDraft({ name: "", description: "", price: "", stock: "0", categoryId: "", brandId: "", image: null });
      setShowCreateProduct(false);
      setProductStatus("active");
    },
  });

  const updateProduct = useMutation({
    mutationFn: (input: { id: number; form: FormData }) => api.put<ProductRow>(`/products/${input.id}`, input.form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      setEditingProductId(null);
      setEditProductDraft({ name: "", description: "", price: "", categoryId: "", brandId: "", image: null });
      setEditOriginalImageUrl(null);
    },
  });

  const deactivateProduct = useMutation({
    mutationFn: (id: number) => api.del<unknown>(`/products/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });

  const activateProduct = useMutation({
    mutationFn: (id: number) => api.put<unknown>(`/products/${id}/activate`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });

  const {
    data: salesReport,
    isLoading: salesLoading,
    error: salesError,
  } = useQuery({
    queryKey: ["admin", "sales", salesApplied?.fechaInicio, salesApplied?.fechaFin],
    queryFn: () => {
      const range = salesApplied;
      if (!range) throw new Error("Rango no aplicado");
      const q = new URLSearchParams({ fechaInicio: range.fechaInicio, fechaFin: range.fechaFin });
      return api.get<SalesReport>(`/reports/sales?${q.toString()}`);
    },
    enabled: section === "reports" && !!salesApplied,
  });

  const {
    data: adminOrders,
    isLoading: ordersLoading,
    error: ordersError,
  } = useQuery({
    queryKey: ["admin", "orders", ordersApplied],
    queryFn: () => {
      const f = ordersApplied || { search: "", estado: "", fechaInicio: "", fechaFin: "" };
      const q = new URLSearchParams();
      if (f.search.trim()) q.set("search", f.search.trim());
      if (f.estado.trim()) q.set("estado", f.estado.trim());
      if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
      if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
      const qs = q.toString();
      return api.get<AdminOrder[]>(`/orders${qs ? `?${qs}` : ""}`);
    },
    enabled: section === "orders",
  });

  const {
    data: auditRows,
    isLoading: auditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ["admin", "audit", "historial"],
    queryFn: () => api.get<AuditRow[]>(`/audit/historial?limit=80`),
    enabled: section === "audit",
  });

  const {
    data: inventoryRows,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery({
    queryKey: ["admin", "inventory", inventoryApplied],
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
    queryKey: ["admin", "dispatch", "outbound", dispatchApplied],
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
        qc.invalidateQueries({ queryKey: ["admin", "dispatch", "outbound"] }),
        qc.invalidateQueries({ queryKey: ["admin", "inventory"] }),
        qc.invalidateQueries({ queryKey: ["admin", "audit"] }),
      ]);
    },
  });

  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => api.get<CategoryRow[]>("/categories"),
    enabled: section === "categories",
  });

  const createCategory = useMutation({
    mutationFn: (nombre: string) => api.post<CategoryRow>("/categories", { nombre }),
    onSuccess: async () => {
      setCategoryNewName("");
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  const updateCategory = useMutation({
    mutationFn: (input: { id: number; nombre: string }) => api.put<CategoryRow>(`/categories/${input.id}`, { nombre: input.nombre }),
    onSuccess: async () => {
      setCategoryEditingId(null);
      setCategoryEditingName("");
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => api.del<unknown>(`/categories/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  const refundOrder = useMutation({
    mutationFn: (id: number) => api.patch<{ ok: true; restockedItems?: number }>(`/orders/${id}/refund`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  return (
    <div className="d-flex">
      <aside id="sidebar" className="d-flex flex-column flex-shrink-0 p-3">
        <div className="text-center mb-4">
          <img src="/assets/images/avatar-admin.png" alt="avatar" className="rounded-circle mb-2" width={80} height={80} />
          <h5 className="m-0 fw-semibold">Administrador</h5>
        </div>
        <div className="menu-title">Panel Administrador</div>
        <ul className="nav nav-pills flex-column mb-auto" id="sideNav">
          <li className="nav-item">
            <button className={`nav-link ${section === "dashboard" ? "active" : ""}`} onClick={() => setSection("dashboard")}>
              <i className="bi bi-speedometer2 me-2"></i>Dashboard
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "products" ? "active" : ""}`} onClick={() => setSection("products")}>
              <i className="bi bi-box-seam me-2"></i>Productos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "reports" ? "active" : ""}`} onClick={() => setSection("reports")}>
              <i className="bi bi-bar-chart me-2"></i>Reporte de Ventas
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "orders" ? "active" : ""}`} onClick={() => setSection("orders")}>
              <i className="bi bi-receipt me-2"></i>Historial de Pedidos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "audit" ? "active" : ""}`} onClick={() => setSection("audit")}>
              <i className="bi bi-journal-text me-2"></i>Auditoría
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "inventory" ? "active" : ""}`} onClick={() => setSection("inventory")}>
              <i className="bi bi-boxes me-2"></i>Inventario
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
              <i className="bi bi-truck me-2"></i>Despachos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "categories" ? "active" : ""}`} onClick={() => setSection("categories")}>
              <i className="bi bi-tags me-2"></i>Categorías
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
        {section === "dashboard" ? (
          <section id="section-dashboard">
            <div className="dash-header d-flex align-items-start align-items-md-center flex-column flex-md-row gap-2">
              <div>
                <h4 className="mb-1">Dashboard — Resumen anual</h4>
                <div className="text-muted small">Vistas listas para datos del año en curso y últimos 12 meses.</div>
              </div>

              <div className="ms-md-auto d-flex align-items-center gap-2">
                <label className="small text-muted" htmlFor="admin-year">
                  Año
                </label>
                <input
                  id="admin-year"
                  type="number"
                  className="form-control form-control-sm"
                  style={{ width: 110 }}
                  value={year}
                  min={2000}
                  max={2100}
                  onChange={e => setYear(Number(e.target.value) || now.getFullYear())}
                />
              </div>
            </div>

            {overviewError ? <div className="alert alert-danger mt-3">{getErrorMessage(overviewError)}</div> : null}

            <div className="kpi-grid my-3">
              <div className="kpi-card compact position-relative">
                <i className="bi bi-currency-dollar kpi-icon"></i>
                <div className="kpi-label">Ventas año (S/)</div>
                <div className="kpi-value">{overviewLoading ? "…" : money.format(overview?.kpis.salesYear ?? 0)}</div>
                <div className="kpi-delta">&nbsp;</div>
              </div>
              <div className="kpi-card compact position-relative">
                <i className="bi bi-receipt kpi-icon"></i>
                <div className="kpi-label">Pedidos año</div>
                <div className="kpi-value">{overviewLoading ? "…" : overview?.kpis.ordersYear ?? 0}</div>
                <div className="kpi-delta">&nbsp;</div>
              </div>
              <div className="kpi-card compact position-relative">
                <i className="bi bi-graph-up-arrow kpi-icon"></i>
                <div className="kpi-label">Ticket promedio</div>
                <div className="kpi-value">{overviewLoading ? "…" : money.format(overview?.kpis.avgTicket ?? 0)}</div>
                <div className="kpi-delta">&nbsp;</div>
              </div>
              <div className="kpi-card compact position-relative">
                <i className="bi bi-box-seam kpi-icon"></i>
                <div className="kpi-label">Unidades vendidas</div>
                <div className="kpi-value">{overviewLoading ? "…" : overview?.kpis.units ?? 0}</div>
                <div className="kpi-delta">&nbsp;</div>
              </div>
              <div className="kpi-card compact position-relative">
                <i className="bi bi-people kpi-icon"></i>
                <div className="kpi-label">Clientes únicos</div>
                <div className="kpi-value">{overviewLoading ? "…" : overview?.kpis.customers ?? 0}</div>
                <div className="kpi-delta">&nbsp;</div>
              </div>
              <div className="kpi-card compact position-relative">
                <i className="bi bi-check2-circle kpi-icon"></i>
                <div className="kpi-label">% entregados</div>
                <div className="kpi-value">{overviewLoading ? "…" : `${overview?.kpis.deliveredRate ?? 0}%`}</div>
                <div className="kpi-delta">&nbsp;</div>
              </div>
            </div>

            <div className="row g-4">
              <div className="col-lg-8">
                <div className="card shadow-sm h-100">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <h6 className="card-title m-0">
                        <i className="bi bi-graph-up me-2"></i>Ventas por mes (últimos 12 meses)
                      </h6>
                      <span className="badge bg-light text-dark">{overviewLoading ? "Cargando" : "OK"}</span>
                    </div>

                    {!overviewLoading && overview ? (
                      <div className="table-responsive">
                        <table className="table table-sm table-hover mb-0">
                          <thead>
                            <tr>
                              <th>Mes</th>
                              <th className="text-end">Ventas (S/)</th>
                              <th className="text-end">Pedidos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {overview.monthly.sales.map((s, idx) => (
                              <tr key={`${s.y}-${s.m}`}>
                                <td>
                                  {String(s.m).padStart(2, "0")}/{s.y}
                                </td>
                                <td className="text-end">{money.format(s.total)}</td>
                                <td className="text-end">{overview.monthly.orders[idx]?.count ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="chart-empty small text-muted">{overviewLoading ? "Cargando..." : "Sin datos"}</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card shadow-sm h-100">
                  <div className="card-body">
                    <h6 className="card-title">
                      <i className="bi bi-tags me-2"></i>Top categorías del año
                    </h6>
                    <table className="table table-sm table-hover table-dashboard-sm mb-0">
                      <thead>
                        <tr>
                          <th>Categoria</th>
                          <th className="text-end">Ventas (S/)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewLoading ? (
                          <tr>
                            <td className="text-muted">Cargando...</td>
                            <td className="text-end text-muted">…</td>
                          </tr>
                        ) : overview && overview.topCategories.length ? (
                          overview.topCategories.map(c => (
                            <tr key={c.name}>
                              <td>{c.name}</td>
                              <td className="text-end">{money.format(c.total)}</td>
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
          </section>
        ) : null}

        {section === "audit" ? (
          <section className="card">
            <div className="card-body">
              <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
                <div>
                  <h4 className="mb-1">Auditoría (HISTORIAL)</h4>
                  <div className="text-muted small">Últimas acciones registradas (productos, verificación, reset, inventario, etc.).</div>
                </div>

                <div className="d-flex gap-2">
                  <button className="btn btn-outline-primary btn-sm" onClick={() => exportInventoryCsv()} disabled={exportingInventory}>
                    {exportingInventory ? "Exportando..." : "Exportar inventario (CSV)"}
                  </button>
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => refetchAudit()} disabled={auditLoading}>
                    {auditLoading ? "Cargando..." : "Refrescar"}
                  </button>
                </div>
              </div>

              {inventoryExportError ? <div className="alert alert-danger">{inventoryExportError}</div> : null}
              {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}

              {auditError ? <div className="alert alert-danger">{getErrorMessage(auditError)}</div> : null}
              {auditLoading ? <div className="text-muted">Cargando...</div> : null}

              {!auditLoading && auditRows && auditRows.length === 0 ? <div className="alert alert-info mb-0">Sin registros.</div> : null}

              {!auditLoading && auditRows && auditRows.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th style={{ width: 180 }}>Fecha</th>
                        <th style={{ width: 220 }}>Acción</th>
                        <th>Descripción</th>
                        <th style={{ width: 240 }}>Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map(r => (
                        <tr key={r.id_historial}>
                          <td className="text-nowrap">
                            {(() => {
                              const dt = formatDateTime(r.fecha_accion, "datetime");
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
                            <span className="badge bg-light text-dark border" title={r.accion}>
                              {String(r.accion || "").replaceAll("_", " ")}
                            </span>
                          </td>
                          <td>{r.descripcion}</td>
                          <td>{r.usuario}</td>
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
              <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
                <div>
                  <h4 className="mb-1">Inventario</h4>
                  <div className="text-muted small">Listado operativo con filtros y exportación.</div>
                </div>

                <div className="d-flex gap-2 flex-wrap">
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
                </div>
              </div>

              {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}

              <form
                className="row g-2 align-items-end mb-3"
                onSubmit={e => {
                  e.preventDefault();
                  setInventoryApplied({ ...inventoryDraft });
                }}
              >
                <div className="col-sm-6 col-md-4">
                  <label className="form-label" htmlFor="inv-search">
                    Buscar producto
                  </label>
                  <input
                    id="inv-search"
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Nombre del producto"
                    value={inventoryDraft.search}
                    onChange={e => setInventoryDraft(s => ({ ...s, search: e.target.value }))}
                  />
                </div>
                <div className="col-sm-6 col-md-2">
                  <label className="form-label" htmlFor="inv-almacen">
                    ID almacén
                  </label>
                  <input
                    id="inv-almacen"
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
              <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
                <div>
                  <h4 className="mb-1">Despachos</h4>
                  <div className="text-muted small">Registro de salida y listado histórico con exportación.</div>
                </div>

                <div className="d-flex gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    disabled={exportingGeneric}
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
                  >
                    {exportingGeneric ? "Exportando..." : "Exportar despachos (CSV)"}
                  </button>
                </div>
              </div>

              {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}

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
                            .map(it => ({
                              id_inventario: Number(it.id_inventario),
                              cantidad: Number(it.cantidad),
                            }))
                            .filter(
                              it => Number.isFinite(it.id_inventario) && it.id_inventario > 0 && Number.isFinite(it.cantidad) && it.cantidad > 0
                            );

                          if (items.length === 0) {
                            window.alert("Agrega al menos 1 ítem válido (id_inventario y cantidad > 0)");
                            return;
                          }

                          createDispatch.mutate({
                            id_pedido: idPedido,
                            observacion: dispatchCreateDraft.observacion.trim(),
                            items,
                          });
                        }}
                      >
                        <div className="col-12 col-md-4">
                          <label className="form-label" htmlFor="dispatch-idpedido">
                            ID pedido (opcional)
                          </label>
                          <input
                            id="dispatch-idpedido"
                            className="form-control form-control-sm"
                            type="number"
                            value={dispatchCreateDraft.id_pedido}
                            onChange={e => setDispatchCreateDraft(s => ({ ...s, id_pedido: e.target.value }))}
                            placeholder="123"
                          />
                        </div>

                        <div className="col-12 col-md-8">
                          <label className="form-label" htmlFor="dispatch-observacion">
                            Observación
                          </label>
                          <input
                            id="dispatch-observacion"
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
                                  onClick={() =>
                                    setDispatchCreateDraft(s => ({
                                      ...s,
                                      items: s.items.filter((_, idx) => idx !== i),
                                    }))
                                  }
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
                            onClick={() =>
                              setDispatchCreateDraft(s => ({
                                ...s,
                                items: [...s.items, { id_inventario: "", cantidad: "" }],
                              }))
                            }
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
                          <label className="form-label" htmlFor="disp-almacen">
                            ID almacén
                          </label>
                          <input
                            id="disp-almacen"
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

        {section === "categories" ? (
          <section className="card">
            <div className="card-body">
              <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
                <div>
                  <h4 className="mb-1">Categorías</h4>
                  <div className="text-muted small">CRUD básico para mantener el catálogo.</div>
                </div>
              </div>

              {categoriesError ? <div className="alert alert-danger">{getErrorMessage(categoriesError)}</div> : null}
              {createCategory.isError ? <div className="alert alert-danger">{getErrorMessage(createCategory.error)}</div> : null}
              {updateCategory.isError ? <div className="alert alert-danger">{getErrorMessage(updateCategory.error)}</div> : null}
              {deleteCategory.isError ? <div className="alert alert-danger">{getErrorMessage(deleteCategory.error)}</div> : null}

              <form
                className="row g-2 align-items-end mb-3"
                onSubmit={e => {
                  e.preventDefault();
                  if (!categoryNewName.trim()) return;
                  createCategory.mutate(categoryNewName.trim());
                }}
              >
                <div className="col-12 col-md-6">
                  <label className="form-label" htmlFor="cat-new">
                    Nueva categoría
                  </label>
                  <input
                    id="cat-new"
                    type="text"
                    className="form-control form-control-sm"
                    value={categoryNewName}
                    onChange={e => setCategoryNewName(e.target.value)}
                    placeholder="Ej. Accesorios"
                  />
                </div>
                <div className="col-12 col-md-3">
                  <button type="submit" className="btn btn-sm btn-primary w-100" disabled={createCategory.isPending}>
                    {createCategory.isPending ? "Guardando..." : "Crear"}
                  </button>
                </div>
              </form>

              {categoriesLoading ? <div className="text-muted">Cargando...</div> : null}

              {!categoriesLoading && categories && categories.length === 0 ? <div className="alert alert-info mb-0">Sin categorías.</div> : null}

              {!categoriesLoading && categories && categories.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th className="text-end" style={{ width: 240 }}>
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map(c => {
                        const editing = categoryEditingId === c.id;
                        return (
                          <tr key={c.id}>
                            <td>
                              {editing ? (
                                <input
                                  className="form-control form-control-sm"
                                  value={categoryEditingName}
                                  onChange={e => setCategoryEditingName(e.target.value)}
                                />
                              ) : (
                                c.nombre
                              )}
                            </td>
                            <td className="text-end">
                              {!editing ? (
                                <div className="d-flex gap-2 justify-content-end flex-wrap">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => {
                                      setCategoryEditingId(c.id);
                                      setCategoryEditingName(c.nombre);
                                    }}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    disabled={deleteCategory.isPending}
                                    onClick={() => {
                                      const ok = window.confirm(`¿Eliminar la categoría "${c.nombre}"?`);
                                      if (!ok) return;
                                      deleteCategory.mutate(c.id);
                                    }}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              ) : (
                                <div className="d-flex gap-2 justify-content-end flex-wrap">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    disabled={updateCategory.isPending}
                                    onClick={() => {
                                      if (!categoryEditingName.trim()) return;
                                      updateCategory.mutate({ id: c.id, nombre: categoryEditingName.trim() });
                                    }}
                                  >
                                    {updateCategory.isPending ? "Guardando..." : "Guardar"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => {
                                      setCategoryEditingId(null);
                                      setCategoryEditingName("");
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {section === "products" ? (
          <section className="card">
            <div className="card-body">
              <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
                <div>
                  <h4 className="mb-1">Productos</h4>
                  <div className="text-muted small">Activar / desactivar productos del catálogo.</div>
                </div>

                <div className="d-flex gap-2 flex-wrap">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowCreateProduct(v => !v)}>
                    {showCreateProduct ? "Cerrar" : "Nuevo producto"}
                  </button>
                  <div className="btn-group btn-group-sm" role="group" aria-label="Estado">
                    <button
                      type="button"
                      className={`btn btn-outline-secondary ${productStatus === "active" ? "active" : ""}`}
                      onClick={() => setProductStatus("active")}
                    >
                      Activos
                    </button>
                    <button
                      type="button"
                      className={`btn btn-outline-secondary ${productStatus === "inactive" ? "active" : ""}`}
                      onClick={() => setProductStatus("inactive")}
                    >
                      Inactivos
                    </button>
                  </div>
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    style={{ width: 240 }}
                    placeholder="Buscar..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                  />
                </div>
              </div>

              {showCreateProduct ? (
                <div className="border rounded p-3 mb-3">
                  <div className="fw-semibold mb-2">Crear producto</div>

                  {productCategoriesError ? <div className="alert alert-danger">{getErrorMessage(productCategoriesError)}</div> : null}
                  {productBrandsError ? <div className="alert alert-danger">{getErrorMessage(productBrandsError)}</div> : null}
                  {createProduct.isError ? <div className="alert alert-danger">{getErrorMessage(createProduct.error)}</div> : null}

                  <form
                    className="row g-2"
                    onSubmit={e => {
                      e.preventDefault();

                      const name = createProductDraft.name.trim();
                      const description = createProductDraft.description.trim();
                      const price = createProductDraft.price.trim();
                      const stock = createProductDraft.stock.trim();
                      const categoryId = createProductDraft.categoryId.trim();
                      const brandId = createProductDraft.brandId.trim();

                      if (!name || !price || !categoryId || !brandId) return;

                      const form = new FormData();
                      form.append("name", name);
                      form.append("description", description);
                      form.append("price", price);
                      form.append("stock", stock || "0");
                      form.append("categoryId", categoryId);
                      form.append("brandId", brandId);
                      if (createProductDraft.image) form.append("image", createProductDraft.image);

                      createProduct.mutate(form);
                    }}
                  >
                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Nombre</label>
                      <input
                        className="form-control form-control-sm"
                        value={createProductDraft.name}
                        required
                        onChange={e => setCreateProductDraft(s => ({ ...s, name: e.target.value }))}
                      />
                    </div>

                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Precio</label>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        className="form-control form-control-sm"
                        value={createProductDraft.price}
                        required
                        onChange={e => setCreateProductDraft(s => ({ ...s, price: e.target.value }))}
                      />
                    </div>

                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Stock inicial</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="form-control form-control-sm"
                        value={createProductDraft.stock}
                        onChange={e => setCreateProductDraft(s => ({ ...s, stock: e.target.value }))}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label mb-1">Descripción</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={3}
                        value={createProductDraft.description}
                        onChange={e => setCreateProductDraft(s => ({ ...s, description: e.target.value }))}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Categoría</label>
                      <select
                        className="form-select form-select-sm"
                        value={createProductDraft.categoryId}
                        required
                        disabled={productCategoriesLoading || !productCategories?.length}
                        onChange={e => setCreateProductDraft(s => ({ ...s, categoryId: e.target.value }))}
                      >
                        <option value="">{productCategoriesLoading ? "Cargando..." : "Selecciona"}</option>
                        {productCategories?.map(c => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Marca</label>
                      <select
                        className="form-select form-select-sm"
                        value={createProductDraft.brandId}
                        required
                        disabled={productBrandsLoading || !productBrands?.length}
                        onChange={e => setCreateProductDraft(s => ({ ...s, brandId: e.target.value }))}
                      >
                        <option value="">{productBrandsLoading ? "Cargando..." : "Selecciona"}</option>
                        {productBrands?.map(b => (
                          <option key={b.id} value={String(b.id)}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Imagen (opcional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="form-control form-control-sm"
                        onChange={e => {
                          const f = e.target.files?.[0] || null;
                          setCreateProductDraft(s => ({ ...s, image: f }));
                        }}
                      />
                      <div className="text-muted small mt-1">Si no subes imagen, se usará un placeholder.</div>
                    </div>

                    {createImagePreviewUrl ? (
                      <div className="col-12 col-md-6">
                        <label className="form-label mb-1">Vista previa</label>
                        <div>
                          <img
                            src={createImagePreviewUrl}
                            alt="Vista previa"
                            className="img-thumbnail"
                            style={{ maxWidth: 220, maxHeight: 220, objectFit: "cover" }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="col-12 d-flex gap-2 justify-content-end">
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowCreateProduct(false)}>
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-sm btn-success" disabled={createProduct.isPending}>
                        {createProduct.isPending ? "Creando..." : "Crear"}
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              {editingProductId != null ? (
                <div className="border rounded p-3 mb-3">
                  <div className="fw-semibold mb-2">Editar producto</div>

                  {productCategoriesError ? <div className="alert alert-danger">{getErrorMessage(productCategoriesError)}</div> : null}
                  {productBrandsError ? <div className="alert alert-danger">{getErrorMessage(productBrandsError)}</div> : null}
                  {updateProduct.isError ? <div className="alert alert-danger">{getErrorMessage(updateProduct.error)}</div> : null}

                  <form
                    className="row g-2"
                    onSubmit={e => {
                      e.preventDefault();

                      const name = editProductDraft.name.trim();
                      const description = editProductDraft.description.trim();
                      const price = editProductDraft.price.trim();
                      const categoryId = editProductDraft.categoryId.trim();
                      const brandId = editProductDraft.brandId.trim();

                      if (!name || !price || !categoryId || !brandId) return;

                      const form = new FormData();
                      form.append("name", name);
                      form.append("description", description);
                      form.append("price", price);
                      form.append("categoryId", categoryId);
                      form.append("brandId", brandId);
                      if (editProductDraft.image) form.append("image", editProductDraft.image);

                      updateProduct.mutate({ id: editingProductId, form });
                    }}
                  >
                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Nombre</label>
                      <input
                        className="form-control form-control-sm"
                        value={editProductDraft.name}
                        required
                        onChange={e => setEditProductDraft(s => ({ ...s, name: e.target.value }))}
                      />
                    </div>

                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Precio</label>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        className="form-control form-control-sm"
                        value={editProductDraft.price}
                        required
                        onChange={e => setEditProductDraft(s => ({ ...s, price: e.target.value }))}
                      />
                    </div>

                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Stock</label>
                      <input type="text" className="form-control form-control-sm" value="Gestionar en Inventario" disabled />
                    </div>

                    <div className="col-12">
                      <label className="form-label mb-1">Descripción</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={3}
                        value={editProductDraft.description}
                        onChange={e => setEditProductDraft(s => ({ ...s, description: e.target.value }))}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Categoría</label>
                      <select
                        className="form-select form-select-sm"
                        value={editProductDraft.categoryId}
                        required
                        disabled={productCategoriesLoading || !productCategories?.length}
                        onChange={e => setEditProductDraft(s => ({ ...s, categoryId: e.target.value }))}
                      >
                        <option value="">{productCategoriesLoading ? "Cargando..." : "Selecciona"}</option>
                        {productCategories?.map(c => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Marca</label>
                      <select
                        className="form-select form-select-sm"
                        value={editProductDraft.brandId}
                        required
                        disabled={productBrandsLoading || !productBrands?.length}
                        onChange={e => setEditProductDraft(s => ({ ...s, brandId: e.target.value }))}
                      >
                        <option value="">{productBrandsLoading ? "Cargando..." : "Selecciona"}</option>
                        {productBrands?.map(b => (
                          <option key={b.id} value={String(b.id)}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Imagen (opcional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="form-control form-control-sm"
                        onChange={e => {
                          const f = e.target.files?.[0] || null;
                          setEditProductDraft(s => ({ ...s, image: f }));
                        }}
                      />
                      <div className="text-muted small mt-1">Si no subes imagen, se mantiene la actual.</div>
                    </div>

                    {editImagePreviewUrl || editOriginalImageUrl ? (
                      <div className="col-12 col-md-6">
                        <label className="form-label mb-1">Vista previa</label>
                        <div className="d-flex align-items-center gap-2">
                          <img
                            src={editImagePreviewUrl || editOriginalImageUrl || ""}
                            alt="Vista previa"
                            className="img-thumbnail"
                            style={{ maxWidth: 220, maxHeight: 220, objectFit: "cover" }}
                          />
                          {editImagePreviewUrl ? <div className="text-muted small">Nueva imagen seleccionada</div> : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="col-12 d-flex gap-2 justify-content-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={updateProduct.isPending}
                        onClick={() => {
                          setEditingProductId(null);
                          setEditProductDraft({ name: "", description: "", price: "", categoryId: "", brandId: "", image: null });
                          setEditOriginalImageUrl(null);
                        }}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-sm btn-success" disabled={updateProduct.isPending}>
                        {updateProduct.isPending ? "Guardando..." : "Guardar"}
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              {productsError ? <div className="alert alert-danger">{getErrorMessage(productsError)}</div> : null}
              {deactivateProduct.isError ? <div className="alert alert-danger">{getErrorMessage(deactivateProduct.error)}</div> : null}
              {activateProduct.isError ? <div className="alert alert-danger">{getErrorMessage(activateProduct.error)}</div> : null}

              {productsLoading ? <div className="text-muted">Cargando...</div> : null}

              {!productsLoading && products && products.length === 0 ? <div className="alert alert-info mb-0">Sin productos.</div> : null}

              {!productsLoading && products && products.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Producto</th>
                        <th>Marca</th>
                        <th>Categoría</th>
                        <th className="text-end">Precio</th>
                        <th className="text-end">Stock</th>
                        <th className="text-end">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map(p => (
                        <tr key={p.id}>
                          <td className="fw-semibold">{p.id}</td>
                          <td>{p.nombre}</td>
                          <td>{p.brandName || "—"}</td>
                          <td>{p.categoryName || "—"}</td>
                          <td className="text-end">{money.format(Number(p.precio ?? 0))}</td>
                          <td className="text-end">{p.stock ?? 0}</td>
                          <td className="text-end">
                            <div className="d-flex gap-2 justify-content-end flex-wrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                  setShowCreateProduct(false);
                                  setEditingProductId(p.id);
                                  setEditOriginalImageUrl(p.imagen || null);
                                  setEditProductDraft({
                                    name: String(p.nombre || ""),
                                    description: String(p.descripcion || ""),
                                    price: String(p.precio ?? ""),
                                    categoryId: String(p.id_categoria ?? ""),
                                    brandId: String(p.id_marca ?? ""),
                                    image: null,
                                  });
                                }}
                              >
                                Editar
                              </button>
                              {productStatus === "active" ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  disabled={deactivateProduct.isPending}
                                  onClick={() => deactivateProduct.mutate(p.id)}
                                >
                                  {deactivateProduct.isPending ? "Procesando..." : "Desactivar"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-success"
                                  disabled={activateProduct.isPending}
                                  onClick={() => activateProduct.mutate(p.id)}
                                >
                                  {activateProduct.isPending ? "Procesando..." : "Activar"}
                                </button>
                              )}
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
        ) : null}

        {section === "reports" ? (
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
                    className="btn btn-outline-success btn-sm"
                    disabled={!salesApplied || exportingGeneric}
                    onClick={() => {
                      if (!salesApplied) return;
                      const q = new URLSearchParams({ fechaInicio: salesApplied.fechaInicio, fechaFin: salesApplied.fechaFin });
                      exportFile(`/reports/sales/export/excel?${q.toString()}`, "reporte-ventas.xlsx");
                    }}
                  >
                    {exportingGeneric ? "Exportando..." : "Exportar Excel"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    disabled={!salesApplied || exportingGeneric}
                    onClick={() => {
                      if (!salesApplied) return;
                      const q = new URLSearchParams({ fechaInicio: salesApplied.fechaInicio, fechaFin: salesApplied.fechaFin });
                      exportFile(`/reports/sales/export/pdf?${q.toString()}`, "reporte-ventas.pdf");
                    }}
                  >
                    {exportingGeneric ? "Exportando..." : "Exportar PDF"}
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
        ) : null}

        {section === "orders" ? (
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
                            <span className="badge bg-secondary">{o.estado_pedido}</span>
                          </td>
                          <td className="text-end fw-semibold">{money.format(Number(o.total_pedido ?? 0))}</td>
                          <td style={{ whiteSpace: "pre-line" }}>
                            {o.productos?.length ? o.productos.map(p => `${p.nombre} x${p.cantidad}`).join("\n") : "—"}
                          </td>
                          <td className="text-end">
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
      </main>
    </div>
  );
}
