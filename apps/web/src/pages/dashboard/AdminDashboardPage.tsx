import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/http";
import type { ApiError } from "../../api/http";
import { downloadApiFile } from "../../api/download";
import { useAuth } from "../../auth/useAuth";
import { formatDateTime } from "../../shared/datetime";

type Section = "dashboard" | "products" | "reports" | "orders" | "audit" | "inventory" | "dispatch" | "categories" | "users";

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
  estado_envio?: string | null;
  tipo_comprobante?: string | null;
  numero_comprobante?: string | null;
  estado_comprobante?: string | null;
  total_pedido: number;
  id_usuario: number;
  cliente: string;
  email: string;
  productos: Array<{ nombre: string; cantidad: number; precio_unitario_venta: number }>;
};

type DeliveryDetail = {
  id_pedido: number;
  estado_pedido: string;
  direccion_envio: string | null;
  estado_envio: string | null;
  fecha_asignacion?: string | null;
  fecha_inicio_ruta?: string | null;
  fecha_entrega?: string | null;
  motivo_no_entrega?: string | null;
  cliente: string | null;
  cliente_telefono: string | null;
  id_motorizado: number | null;
  repartidor: string | null;
  repartidor_email: string | null;
  nombre_receptor?: string | null;
  dni_receptor?: string | null;
  observacion?: string | null;
  evidencia_fecha?: string | null;
};

type AuditRow = {
  id_historial: number;
  accion: string;
  resumen_label?: string | null;
  modulo?: string | null;
  descripcion: string;
  fecha_accion: string;
  id_pedido: number | null;
  entidad_tipo?: string | null;
  entidad_id?: number | null;
  referencia_tipo?: string | null;
  referencia_valor?: string | null;
  referencia_label?: string | null;
  id_usuario: number;
  usuario: string;
};

type AuditModule = "" | "INVENTARIO" | "DESPACHO" | "PRODUCTO" | "CATEGORIA" | "PEDIDO" | "DELIVERY" | "REPORTE" | "SEGURIDAD" | "SISTEMA";

const AUDIT_MODULE_OPTIONS: Array<{ value: AuditModule; label: string }> = [
  { value: "", label: "Todos" },
  { value: "INVENTARIO", label: "Inventario" },
  { value: "DESPACHO", label: "Despachos" },
  { value: "PRODUCTO", label: "Productos" },
  { value: "CATEGORIA", label: "Categorías" },
  { value: "PEDIDO", label: "Pedidos" },
  { value: "DELIVERY", label: "Reparto" },
  { value: "REPORTE", label: "Reportes" },
  { value: "SEGURIDAD", label: "Seguridad" },
  { value: "SISTEMA", label: "Sistema" },
];

const AUDIT_QUICK_FILTERS: Array<{ label: string; modulo: AuditModule }> = [
  { label: "Todos", modulo: "" },
  { label: "Inventario", modulo: "INVENTARIO" },
  { label: "Despachos", modulo: "DESPACHO" },
  { label: "Productos", modulo: "PRODUCTO" },
  { label: "Pedidos", modulo: "PEDIDO" },
  { label: "Reparto", modulo: "DELIVERY" },
];

type AuditPaginatedResponse = {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type InventoryRowEnriched = {
  id_inventario: number;
  nombre_producto: string;
  precio: number;
  nombre_categoria: string;
  nombre_almacen: string;
  stock: number;
};

type InventoryKpis = {
  totalProductos: number;
  agotados: number;
  stockBajo: number;
};

type InventoryPaginatedResponse = {
  rows: InventoryRowEnriched[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

type OutboundResponse = {
  rows: OutboundRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type InboundRow = {
  id_entrada_inventario: number;
  fecha_entrada_utc: string;
  producto: string;
  cantidad: number;
  motivo: string;
  almacen: string;
  id_usuario: number | null;
  responsable: string | null;
};

type InboundResponse = {
  rows: InboundRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type CategoryRow = {
  id: number;
  nombre: string;
  total_productos?: number;
};

type ProductCatalogOption = {
  id: number;
  name: string;
};

type ManagedUserRole = "" | "CLIENTE" | "EMPLEADO" | "REPARTIDOR";
type ManagedUserState = "" | "ACTIVO" | "INACTIVO";

type ManagedUserRow = {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  direccion_principal?: string | null;
  rol: ManagedUserRole;
  estado: ManagedUserState;
  email_verificado: boolean;
  fecha_registro: string;
  id_motorizado?: number | null;
  licencia?: string | null;
};

type ManagedUsersPaginatedResponse = {
  rows: ManagedUserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function getInventorySelectionLabel(row: { id_inventario: number; nombre_producto: string; nombre_almacen: string }): string {
  return `${row.nombre_producto} · ID ${row.id_inventario}`;
}

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

function formatStateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value).trim().replace(/_/g, " ");
}

function normalizeManagedUserRole(value: unknown): ManagedUserRole {
  const raw = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  if (raw === "CLIENTE" || raw === "EMPLEADO" || raw === "REPARTIDOR") return raw;
  return "";
}

function normalizeManagedUserState(value: unknown): ManagedUserState {
  const raw = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  if (raw === "ACTIVO" || raw === "INACTIVO") return raw;
  return "";
}

function getManagedUserRoleLabel(role: ManagedUserRole): string {
  if (role === "CLIENTE") return "Cliente";
  if (role === "EMPLEADO") return "Empleado";
  if (role === "REPARTIDOR") return "Repartidor";
  return "—";
}

function getAdminOrderStateLabel(order: AdminOrder): string {
  const envio = String(order.estado_envio || "").toUpperCase();
  if (envio === "NO_ENTREGADO") return "NO ENTREGADO";
  if (envio === "EN_RUTA") return "EN CAMINO";
  return formatStateLabel(order.estado_pedido);
}

function normalizeAuditModule(value: string | null | undefined): AuditModule {
  const v = String(value || "")
    .trim()
    .toUpperCase();
  if (
    v === "INVENTARIO" ||
    v === "DESPACHO" ||
    v === "PRODUCTO" ||
    v === "CATEGORIA" ||
    v === "PEDIDO" ||
    v === "DELIVERY" ||
    v === "REPORTE" ||
    v === "SEGURIDAD" ||
    v === "SISTEMA"
  ) {
    return v;
  }
  return "";
}

function inferAuditModuleFromAction(action: string): AuditModule {
  const key = String(action || "")
    .trim()
    .toUpperCase();
  if (key.startsWith("INVENTARIO") || key.startsWith("STOCK")) return "INVENTARIO";
  if (key.startsWith("SALIDA_DESPACHO") || key.startsWith("DESPACHO")) return "DESPACHO";
  if (key.startsWith("PRODUCTO")) return "PRODUCTO";
  if (key.startsWith("CATEGORIA")) return "CATEGORIA";
  if (key.startsWith("DELIVERY")) return "DELIVERY";
  if (key.startsWith("PEDIDO") || key.startsWith("TRANSICION_ESTADO") || key.startsWith("PREPARAR_PEDIDO") || key.startsWith("REEMBOLSO")) {
    return "PEDIDO";
  }
  if (key.startsWith("REPORTE") || key.startsWith("VENTAS")) return "REPORTE";
  if (key.startsWith("LOGIN") || key.startsWith("AUTH") || key.startsWith("TOKEN") || key.startsWith("PASSWORD")) return "SEGURIDAD";
  return "SISTEMA";
}

function getAuditModuleLabel(moduleValue: AuditModule): string {
  const found = AUDIT_MODULE_OPTIONS.find(opt => opt.value === moduleValue);
  return found?.label || "Sistema";
}

function getAuditActionLabel(action: string): string {
  const key = String(action || "")
    .trim()
    .toUpperCase();
  if (!key) return "—";

  const labels: Record<string, string> = {
    INVENTARIO_EXPORTADO: "Inventario exportado",
    INVENTARIO_ADMIN_EXPORTADO: "Inventario admin exportado",
    INVENTARIO_ENTRADA_REGISTRADA: "Entrada de inventario registrada",
    SALIDA_DESPACHO: "Salida de despacho",
    PRODUCTO_ACTIVADO: "Producto activado",
    PRODUCTO_DESACTIVADO: "Producto desactivado",
    PRODUCTO_ACTUALIZADO: "Producto actualizado",
    DELIVERY_ASIGNADO: "Repartidor asignado",
    DELIVERY_EN_RUTA: "Reparto en ruta",
    DELIVERY_ENTREGADO: "Entrega confirmada",
    DELIVERY_NO_ENTREGADO: "Entrega no completada",
    TRANSICION_ESTADO: "Cambio de estado",
    PREPARAR_PEDIDO: "Pedido preparado",
    USUARIO_REACTIVADO: "Usuario reactivado",
  };

  if (labels[key]) return labels[key];
  return key.replaceAll("_", " ");
}

function getAuditRowModule(row: AuditRow): AuditModule {
  const fromApi = normalizeAuditModule(row.modulo);
  if (fromApi) return fromApi;
  return inferAuditModuleFromAction(row.accion);
}

function getAuditEntityLabel(row: AuditRow): string {
  const entityType = String(row.entidad_tipo || "")
    .trim()
    .toUpperCase();
  const entityId = Number(row.entidad_id || 0);

  if (entityType === "PEDIDO" && entityId > 0) return `Pedido #${entityId}`;
  if (Number(row.id_pedido || 0) > 0) return `Pedido #${row.id_pedido}`;
  return "—";
}

function getAuditReferenceLabel(row: AuditRow): string {
  const referenceLabel = String(row.referencia_label || "").trim();
  if (referenceLabel) return referenceLabel;

  const legacyEntity = getAuditEntityLabel(row);
  if (legacyEntity !== "—") return legacyEntity;

  const rowModule = getAuditRowModule(row);
  if (rowModule === "PRODUCTO") return "Producto";
  if (rowModule === "INVENTARIO") return "Inventario";
  if (rowModule === "DESPACHO") return "Despacho";
  if (rowModule === "REPORTE") return "Reporte";
  if (rowModule === "SEGURIDAD") return "Seguridad";
  return "General";
}

export function AdminDashboardPage() {
  const nav = useNavigate();
  const { logout, user } = useAuth();
  const [section, setSection] = useState<Section>("dashboard");
  const qc = useQueryClient();
  const adminDisplayName = `${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim() || "Usuario";

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
  const [ordersDeliveryDetailOrderId, setOrdersDeliveryDetailOrderId] = useState<number | null>(null);

  const [auditDraft, setAuditDraft] = useState<{
    modulo: AuditModule;
    accion: string;
    usuario: string;
    fechaInicio: string;
    fechaFin: string;
    pageSize: string;
  }>({
    modulo: "",
    accion: "",
    usuario: "",
    fechaInicio: "",
    fechaFin: "",
    pageSize: "20",
  });
  const [auditApplied, setAuditApplied] = useState<typeof auditDraft | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditFilterError, setAuditFilterError] = useState<string | null>(null);
  const [auditExpandedRowId, setAuditExpandedRowId] = useState<number | null>(null);

  const [invDraft, setInvDraft] = useState<{ search: string; categoriaId: string; pageSize: string }>({
    search: "",
    categoriaId: "",
    pageSize: "20",
  });
  const [invApplied, setInvApplied] = useState<typeof invDraft | null>(null);
  const [invPage, setInvPage] = useState(1);
  const [invInboundPage, setInvInboundPage] = useState(1);
  const [invInboundFormDraft, setInvInboundFormDraft] = useState<{ id_inventario: string; cantidad: string; motivo: string }>({
    id_inventario: "",
    cantidad: "",
    motivo: "",
  });
  const [invInboundSearchDraft, setInvInboundSearchDraft] = useState("");
  const [invInboundSearchOpen, setInvInboundSearchOpen] = useState(false);
  const [invInboundSearchActiveIndex, setInvInboundSearchActiveIndex] = useState<number>(-1);
  const [invInboundFormError, setInvInboundFormError] = useState<string | null>(null);
  const [invInboundSuccess, setInvInboundSuccess] = useState<string | null>(null);
  const invInboundSearchWrapRef = useRef<HTMLDivElement | null>(null);

  const [dispatchDraft, setDispatchDraft] = useState<{ fechaInicio: string; fechaFin: string; search: string }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { fechaInicio: toDateInputValue(start), fechaFin: toDateInputValue(end), search: "" };
  });
  const [dispatchApplied, setDispatchApplied] = useState<typeof dispatchDraft | null>(null);
  const [dispatchPage, setDispatchPage] = useState(1);

  const [categoryNewName, setCategoryNewName] = useState<string>("");
  const [categoryEditingId, setCategoryEditingId] = useState<number | null>(null);
  const [categoryEditingName, setCategoryEditingName] = useState<string>("");
  const [categoryConfirmDeleteId, setCategoryConfirmDeleteId] = useState<number | null>(null);

  const [usersDraft, setUsersDraft] = useState<{ search: string; rol: ManagedUserRole; estado: ManagedUserState; pageSize: string }>({
    search: "",
    rol: "",
    estado: "ACTIVO",
    pageSize: "20",
  });
  const [usersApplied, setUsersApplied] = useState<typeof usersDraft | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [showCreateManagedUser, setShowCreateManagedUser] = useState(false);
  const [createManagedUserDraft, setCreateManagedUserDraft] = useState<{
    rol: "EMPLEADO" | "REPARTIDOR";
    nombre: string;
    apellido: string;
    email: string;
    telefono: string;
    direccion_principal: string;
    contrasena: string;
    licencia: string;
  }>({
    rol: "EMPLEADO",
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    direccion_principal: "",
    contrasena: "",
    licencia: "",
  });
  const [editingManagedUserId, setEditingManagedUserId] = useState<number | null>(null);
  const [editManagedUserDraft, setEditManagedUserDraft] = useState<{
    nombre: string;
    apellido: string;
    email: string;
    telefono: string;
    direccion_principal: string;
    licencia: string;
    rol: ManagedUserRole;
  }>({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    direccion_principal: "",
    licencia: "",
    rol: "",
  });
  const [confirmDeactivateManagedUserId, setConfirmDeactivateManagedUserId] = useState<number | null>(null);
  const [confirmReactivateManagedUserId, setConfirmReactivateManagedUserId] = useState<number | null>(null);

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

  useEffect(() => {
    if (section !== "audit") return;
    if (auditApplied) return;
    setAuditApplied({ ...auditDraft });
    setAuditPage(1);
  }, [section, auditApplied, auditDraft]);

  useEffect(() => {
    if (section !== "users") return;
    if (usersApplied) return;
    setUsersApplied({ ...usersDraft });
    setUsersPage(1);
  }, [section, usersApplied, usersDraft]);

  useEffect(() => {
    if (!invInboundSearchOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (invInboundSearchWrapRef.current?.contains(target)) return;
      setInvInboundSearchOpen(false);
      setInvInboundSearchActiveIndex(-1);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [invInboundSearchOpen]);

  const auditAppliedSummary = useMemo(() => {
    const f = auditApplied;
    if (!f) return "Ninguno";

    const parts: string[] = [];
    if (f.modulo.trim()) parts.push(`Módulo ${getAuditModuleLabel(normalizeAuditModule(f.modulo))}`);
    if (f.accion.trim()) parts.push(`Acción ${f.accion.trim()}`);
    if (f.usuario.trim()) parts.push(`Usuario ${f.usuario.trim()}`);
    if (f.fechaInicio.trim() && f.fechaFin.trim()) {
      parts.push(`Rango ${f.fechaInicio.trim()} a ${f.fechaFin.trim()}`);
    } else if (f.fechaInicio.trim()) {
      parts.push(`Desde ${f.fechaInicio.trim()}`);
    } else if (f.fechaFin.trim()) {
      parts.push(`Hasta ${f.fechaFin.trim()}`);
    }
    return parts.length ? parts.join(" · ") : "Ninguno";
  }, [auditApplied]);

  const auditActiveFilterCount = useMemo(() => {
    const f = auditApplied;
    if (!f) return 0;
    let count = 0;
    if (f.modulo.trim()) count += 1;
    if (f.accion.trim()) count += 1;
    if (f.usuario.trim()) count += 1;
    if (f.fechaInicio.trim()) count += 1;
    if (f.fechaFin.trim()) count += 1;
    return count;
  }, [auditApplied]);

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
    data: ordersDeliveryDetail,
    isLoading: ordersDeliveryDetailLoading,
    error: ordersDeliveryDetailError,
  } = useQuery({
    queryKey: ["admin", "orders", "delivery-detail", ordersDeliveryDetailOrderId],
    queryFn: () => api.get<DeliveryDetail>(`/delivery/${ordersDeliveryDetailOrderId}/detail`),
    enabled: section === "orders" && Number.isInteger(ordersDeliveryDetailOrderId) && Number(ordersDeliveryDetailOrderId) > 0,
  });

  const {
    data: auditPaginated,
    isLoading: auditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: [
      "admin",
      "audit",
      "historial",
      auditPage,
      auditApplied?.modulo || "",
      auditApplied?.accion || "",
      auditApplied?.usuario || "",
      auditApplied?.fechaInicio || "",
      auditApplied?.fechaFin || "",
      auditApplied?.pageSize || "20",
    ],
    queryFn: () => {
      const f = auditApplied;
      if (!f) throw new Error("Filtros no aplicados");

      const q = new URLSearchParams();
      q.set("page", String(auditPage));
      q.set("pageSize", f.pageSize);
      if (f.modulo.trim()) q.set("modulo", f.modulo.trim());
      if (f.accion.trim()) q.set("accion", f.accion.trim());
      if (f.usuario.trim()) q.set("usuario", f.usuario.trim());
      if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
      if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());

      return api.get<AuditPaginatedResponse>(`/audit/historial?${q.toString()}`);
    },
    enabled: section === "audit" && !!auditApplied,
  });

  const {
    data: invKpis,
    isLoading: invKpisLoading,
    error: invKpisError,
  } = useQuery({
    queryKey: ["admin", "inventory", "kpis"],
    queryFn: () => api.get<InventoryKpis>("/inventory/kpis"),
    enabled: section === "inventory",
    staleTime: 30 * 1000,
  });

  const {
    data: invCategoryOptions,
    isLoading: invCategoryOptionsLoading,
    error: invCategoryOptionsError,
  } = useQuery({
    queryKey: ["admin", "inventory", "categories"],
    queryFn: () => api.get<ProductCatalogOption[]>("/products/categories"),
    enabled: section === "inventory",
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: invPaginated,
    isLoading: invPaginatedLoading,
    error: invPaginatedError,
  } = useQuery({
    queryKey: ["admin", "inventory", "paginated", invPage, invApplied?.search || "", invApplied?.categoriaId || "", invApplied?.pageSize || "20"],
    queryFn: () => {
      const f = invApplied;
      if (!f) throw new Error("Filtros no aplicados");

      const q = new URLSearchParams();
      q.set("page", String(invPage));
      q.set("pageSize", f.pageSize);
      if (f.search.trim()) q.set("search", f.search.trim());
      if (f.categoriaId.trim()) q.set("categoriaId", f.categoriaId.trim());

      return api.get<InventoryPaginatedResponse>(`/inventory/paginated?${q.toString()}`);
    },
    enabled: section === "inventory" && !!invApplied,
  });

  const {
    data: outboundRows,
    isLoading: outboundLoading,
    error: outboundError,
  } = useQuery({
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
      const q = new URLSearchParams();
      q.set("page", String(dispatchPage));
      q.set("pageSize", "20");
      if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
      if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
      if (f.search.trim()) q.set("search", f.search.trim());
      const qs = q.toString();
      return api.get<OutboundResponse>(`/dispatch/outbound${qs ? `?${qs}` : ""}`);
    },
    enabled: section === "dispatch" && !!dispatchApplied,
  });

  const {
    data: inboundRows,
    isLoading: inboundLoading,
    error: inboundError,
  } = useQuery({
    queryKey: [
      "admin",
      "inventory",
      "inbound",
      invInboundPage,
      invApplied?.search || "",
      invApplied?.categoriaId || "",
      invApplied?.pageSize || "20",
    ],
    queryFn: () => {
      const f = invApplied;
      if (!f) throw new Error("Filtros no aplicados");

      const q = new URLSearchParams();
      q.set("page", String(invInboundPage));
      q.set("pageSize", f.pageSize);
      if (f.search.trim()) q.set("search", f.search.trim());
      if (f.categoriaId.trim()) q.set("categoriaId", f.categoriaId.trim());

      return api.get<InboundResponse>(`/inventory/inbound?${q.toString()}`);
    },
    enabled: section === "inventory" && !!invApplied,
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

  const createInboundInventory = useMutation({
    mutationFn: (payload: { id_inventario: number; cantidad: number; motivo: string }) =>
      api.post<{
        ok: boolean;
        message?: string;
        entry?: { producto: string };
        stock?: { anterior: number; nuevo: number };
      }>("/inventory/inbound", payload),
    onSuccess: async data => {
      setInvInboundFormError(null);
      setInvInboundFormDraft({ id_inventario: "", cantidad: "", motivo: "" });
      setInvInboundSearchDraft("");
      setInvInboundSearchOpen(false);
      setInvInboundSearchActiveIndex(-1);
      setInvInboundPage(1);

      const producto = String(data?.entry?.producto || "producto");
      const stockNuevo = Number(data?.stock?.nuevo || 0);
      setInvInboundSuccess(`Entrada registrada para ${producto}. Stock actualizado: ${stockNuevo}.`);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "inventory", "paginated"] }),
        qc.invalidateQueries({ queryKey: ["admin", "inventory", "inbound"] }),
        qc.invalidateQueries({ queryKey: ["admin", "audit"] }),
      ]);
    },
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
      setCategoryConfirmDeleteId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => api.del<unknown>(`/categories/${id}`),
    onSuccess: async () => {
      setCategoryConfirmDeleteId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  const {
    data: managedUsersPaginated,
    isLoading: managedUsersLoading,
    error: managedUsersError,
  } = useQuery({
    queryKey: [
      "admin",
      "users",
      usersPage,
      usersApplied?.search || "",
      usersApplied?.rol || "",
      usersApplied?.estado || "",
      usersApplied?.pageSize || "20",
    ],
    queryFn: () => {
      const f = usersApplied;
      if (!f) throw new Error("Filtros no aplicados");

      const q = new URLSearchParams();
      q.set("page", String(usersPage));
      q.set("pageSize", f.pageSize || "20");
      if (f.search.trim()) q.set("search", f.search.trim());
      if (normalizeManagedUserRole(f.rol)) q.set("rol", f.rol);
      if (normalizeManagedUserState(f.estado)) q.set("estado", f.estado);

      return api.get<ManagedUsersPaginatedResponse>(`/users?${q.toString()}`);
    },
    enabled: section === "users" && !!usersApplied,
  });

  const invInboundSelectedId = useMemo(() => {
    const parsed = Number(invInboundFormDraft.id_inventario);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [invInboundFormDraft.id_inventario]);

  const invInboundSelectedRow = useMemo(() => {
    if (!invInboundSelectedId) return null;
    return (invPaginated?.rows || []).find(r => Number(r.id_inventario) === invInboundSelectedId) || null;
  }, [invInboundSelectedId, invPaginated?.rows]);

  const invInboundSearchCandidates = useMemo(() => {
    const source = invPaginated?.rows || [];
    const term = invInboundSearchDraft.trim().toLowerCase();
    if (!term) return [];
    return source
      .filter(r => {
        const haystack = `${r.id_inventario} ${r.nombre_producto}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 50);
  }, [invInboundSearchDraft, invPaginated?.rows]);

  const invInboundListboxId = "admin-inbound-search-listbox";
  const invInboundSearchTerm = invInboundSearchDraft.trim();
  const invInboundDropdownVisible = invInboundSearchOpen && invInboundSearchTerm.length > 0;

  const createEmployee = useMutation({
    mutationFn: (payload: { nombre: string; apellido: string; email: string; telefono: string; direccion_principal: string; contrasena: string }) =>
      api.post<ManagedUserRow>("/users/employees", payload),
    onSuccess: async () => {
      setShowCreateManagedUser(false);
      setCreateManagedUserDraft({
        rol: "EMPLEADO",
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        direccion_principal: "",
        contrasena: "",
        licencia: "",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const createRider = useMutation({
    mutationFn: (payload: {
      nombre: string;
      apellido: string;
      email: string;
      telefono: string;
      direccion_principal: string;
      contrasena: string;
      licencia: string;
    }) => api.post<ManagedUserRow>("/users/riders", payload),
    onSuccess: async () => {
      setShowCreateManagedUser(false);
      setCreateManagedUserDraft({
        rol: "EMPLEADO",
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        direccion_principal: "",
        contrasena: "",
        licencia: "",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const updateManagedUser = useMutation({
    mutationFn: (payload: {
      id_usuario: number;
      nombre: string;
      apellido: string;
      email: string;
      telefono: string;
      direccion_principal: string;
      licencia: string;
    }) =>
      api.put<ManagedUserRow>(`/users/${payload.id_usuario}`, {
        nombre: payload.nombre,
        apellido: payload.apellido,
        email: payload.email,
        telefono: payload.telefono,
        direccion_principal: payload.direccion_principal,
        licencia: payload.licencia,
      }),
    onSuccess: async () => {
      setEditingManagedUserId(null);
      setEditManagedUserDraft({
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        direccion_principal: "",
        licencia: "",
        rol: "",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const deactivateManagedUser = useMutation({
    mutationFn: (id_usuario: number) => api.patch<{ ok: true; id_usuario: number; estado: string }>(`/users/${id_usuario}/deactivate`),
    onSuccess: async () => {
      setConfirmDeactivateManagedUserId(null);
      setConfirmReactivateManagedUserId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const reactivateManagedUser = useMutation({
    mutationFn: (id_usuario: number) => api.patch<{ ok: true; id_usuario: number; estado: string }>(`/users/${id_usuario}/reactivate`),
    onSuccess: async () => {
      setConfirmReactivateManagedUserId(null);
      setConfirmDeactivateManagedUserId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const refundOrder = useMutation({
    mutationFn: (id: number) => api.patch<{ ok: true; restockedItems?: number }>(`/orders/${id}/refund`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const auditPageVisibleRows = auditPaginated?.rows?.length ?? 0;
  const auditTotalRows = auditPaginated?.total ?? 0;
  const auditCurrentPage = auditPaginated?.page ?? auditPage;
  const auditTotalPages = auditPaginated?.totalPages ?? 1;

  function jumpFromAudit(row: AuditRow) {
    const moduleValue = getAuditRowModule(row);

    if (moduleValue === "PEDIDO" || moduleValue === "DELIVERY") {
      const orderId = Number(row.id_pedido || row.entidad_id || row.referencia_valor || 0);
      const search = orderId > 0 ? String(orderId) : "";
      setOrdersDraft(s => ({ ...s, search }));
      setOrdersApplied(s => ({ ...(s || { search: "", estado: "", fechaInicio: "", fechaFin: "" }), search }));
      if (orderId > 0) setOrdersDeliveryDetailOrderId(orderId);
      setSection("orders");
      return;
    }

    if (moduleValue === "INVENTARIO") {
      setSection("inventory");
      setInvPage(1);
      setInvInboundPage(1);
      setInvApplied(s => s ?? { ...invDraft });
      return;
    }

    if (moduleValue === "DESPACHO") {
      setSection("dispatch");
      setDispatchPage(1);
      setDispatchApplied(s => s ?? { ...dispatchDraft });
      return;
    }

    if (moduleValue === "PRODUCTO") {
      setSection("products");
      setProductStatus("active");
      return;
    }

    if (moduleValue === "CATEGORIA") {
      setSection("categories");
      return;
    }

    if (moduleValue === "REPORTE") {
      setSection("reports");
      return;
    }

    setSection("dashboard");
  }

  return (
    <div className="d-flex">
      <aside id="sidebar" className="d-flex flex-column flex-shrink-0 p-3">
        <div className="text-center mb-4">
          <img src="/assets/images/avatar-admin.png" alt="avatar" className="rounded-circle mb-2" width={80} height={80} />
          <h5 className="m-0 fw-semibold text-truncate" title={adminDisplayName}>
            {adminDisplayName}
          </h5>
          <div className="small text-muted">Administrador</div>
        </div>
        <div className="menu-title">Panel Administrador</div>
        <ul className="nav nav-pills flex-column mb-auto" id="sideNav">
          <li className="nav-item">
            <button className={`nav-link ${section === "dashboard" ? "active" : ""}`} onClick={() => setSection("dashboard")}>
              <i className="bi bi-speedometer2 me-2"></i>Dashboard
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "orders" ? "active" : ""}`} onClick={() => setSection("orders")}>
              <i className="bi bi-receipt me-2"></i>Historial de Pedidos
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
                setDispatchPage(1);
                setDispatchApplied(s => s ?? { ...dispatchDraft });
              }}
            >
              <i className="bi bi-truck me-2"></i>Despachos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "products" ? "active" : ""}`} onClick={() => setSection("products")}>
              <i className="bi bi-box-seam me-2"></i>Productos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "categories" ? "active" : ""}`} onClick={() => setSection("categories")}>
              <i className="bi bi-tags me-2"></i>Categorías
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "users" ? "active" : ""}`} onClick={() => setSection("users")}>
              <i className="bi bi-people me-2"></i>Usuarios
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "reports" ? "active" : ""}`} onClick={() => setSection("reports")}>
              <i className="bi bi-bar-chart me-2"></i>Reporte de Ventas
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "audit" ? "active" : ""}`} onClick={() => setSection("audit")}>
              <i className="bi bi-journal-text me-2"></i>Auditoría
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
                <div className="kpi-value">{overviewLoading ? "…" : (overview?.kpis.ordersYear ?? 0)}</div>
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
                <div className="kpi-value">{overviewLoading ? "…" : (overview?.kpis.units ?? 0)}</div>
                <div className="kpi-delta">&nbsp;</div>
              </div>
              <div className="kpi-card compact position-relative">
                <i className="bi bi-people kpi-icon"></i>
                <div className="kpi-label">Clientes únicos</div>
                <div className="kpi-value">{overviewLoading ? "…" : (overview?.kpis.customers ?? 0)}</div>
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
                  <div className="text-muted small">
                    Monitoreo administrativo con filtros rápidos, vista contextual y navegación a módulos relacionados.
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => refetchAudit()} disabled={auditLoading}>
                    {auditLoading ? "Cargando..." : "Refrescar"}
                  </button>
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-12 col-md-3">
                  <div className="border rounded p-3 h-100 bg-light">
                    <div className="small text-muted">Total encontrados</div>
                    <div className="fs-4 fw-semibold">{auditLoading ? "…" : auditTotalRows}</div>
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="border rounded p-3 h-100 bg-light">
                    <div className="small text-muted">Mostrando en esta página</div>
                    <div className="fs-4 fw-semibold">{auditLoading ? "…" : auditPageVisibleRows}</div>
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="border rounded p-3 h-100 bg-light">
                    <div className="small text-muted">Página actual</div>
                    <div className="fs-4 fw-semibold">{auditLoading ? "…" : `${auditCurrentPage}/${auditTotalPages}`}</div>
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="border rounded p-3 h-100 bg-light">
                    <div className="small text-muted">Filtros activos</div>
                    <div className="fs-4 fw-semibold">{auditActiveFilterCount}</div>
                  </div>
                </div>
              </div>

              <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Filtros rápidos de auditoría">
                {AUDIT_QUICK_FILTERS.map(filter => {
                  const active = (auditDraft.modulo || "") === filter.modulo;
                  return (
                    <button
                      key={filter.label}
                      type="button"
                      className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
                      onClick={() => {
                        setAuditDraft(s => ({ ...s, modulo: filter.modulo }));
                        setAuditApplied(s => ({ ...(s || auditDraft), modulo: filter.modulo }));
                        setAuditPage(1);
                        setAuditExpandedRowId(null);
                      }}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>

              <form
                className="row g-2 align-items-end mb-3"
                onSubmit={e => {
                  e.preventDefault();
                  if (auditDraft.fechaInicio.trim() && auditDraft.fechaFin.trim() && auditDraft.fechaInicio > auditDraft.fechaFin) {
                    setAuditFilterError("El rango de fechas es inválido: la fecha de inicio no puede ser mayor que la fecha fin.");
                    return;
                  }
                  setAuditFilterError(null);
                  setAuditPage(1);
                  setAuditApplied({ ...auditDraft });
                  setAuditExpandedRowId(null);
                }}
              >
                <div className="col-12 col-md-3">
                  <label className="form-label" htmlFor="audit-modulo">
                    Módulo
                  </label>
                  <select
                    id="audit-modulo"
                    className="form-select form-select-sm"
                    value={auditDraft.modulo}
                    onChange={e => setAuditDraft(s => ({ ...s, modulo: normalizeAuditModule(e.target.value) }))}
                  >
                    {AUDIT_MODULE_OPTIONS.map(opt => (
                      <option key={opt.value || "all"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label" htmlFor="audit-accion">
                    Acción
                  </label>
                  <input
                    id="audit-accion"
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Ej: INVENTARIO_EXPORTADO"
                    value={auditDraft.accion}
                    onChange={e => setAuditDraft(s => ({ ...s, accion: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-2">
                  <label className="form-label" htmlFor="audit-usuario">
                    Usuario
                  </label>
                  <input
                    id="audit-usuario"
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Nombre, email o ID"
                    value={auditDraft.usuario}
                    onChange={e => setAuditDraft(s => ({ ...s, usuario: e.target.value }))}
                  />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label" htmlFor="audit-fecha-inicio">
                    Fecha inicio
                  </label>
                  <input
                    id="audit-fecha-inicio"
                    type="date"
                    className="form-control form-control-sm"
                    value={auditDraft.fechaInicio}
                    onChange={e => setAuditDraft(s => ({ ...s, fechaInicio: e.target.value }))}
                  />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label" htmlFor="audit-fecha-fin">
                    Fecha fin
                  </label>
                  <input
                    id="audit-fecha-fin"
                    type="date"
                    className="form-control form-control-sm"
                    value={auditDraft.fechaFin}
                    onChange={e => setAuditDraft(s => ({ ...s, fechaFin: e.target.value }))}
                  />
                </div>
                <div className="col-6 col-md-1">
                  <label className="form-label" htmlFor="audit-page-size">
                    Tamaño
                  </label>
                  <select
                    id="audit-page-size"
                    className="form-select form-select-sm"
                    value={auditDraft.pageSize}
                    onChange={e => setAuditDraft(s => ({ ...s, pageSize: e.target.value }))}
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
                      const clean = { modulo: "" as AuditModule, accion: "", usuario: "", fechaInicio: "", fechaFin: "", pageSize: "20" };
                      setAuditDraft(clean);
                      setAuditApplied(clean);
                      setAuditPage(1);
                      setAuditFilterError(null);
                      setAuditExpandedRowId(null);
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </form>

              {auditFilterError ? <div className="alert alert-warning py-2">{auditFilterError}</div> : null}
              <div className="small text-muted mb-3">Filtros activos: {auditAppliedSummary}</div>

              {auditError ? <div className="alert alert-danger">{getErrorMessage(auditError)}</div> : null}
              {auditLoading ? <div className="text-muted">Cargando...</div> : null}

              {!auditLoading && auditPaginated && auditPaginated.rows.length === 0 ? (
                <div className="alert alert-info mb-0">Sin registros para los filtros actuales.</div>
              ) : null}

              {!auditLoading && auditPaginated && auditPaginated.rows.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th style={{ width: 180 }}>Fecha</th>
                        <th style={{ width: 190 }}>Evento</th>
                        <th style={{ width: 130 }}>Módulo</th>
                        <th>Resumen</th>
                        <th style={{ width: 160 }}>Referencia</th>
                        <th style={{ width: 190 }}>Usuario</th>
                        <th className="text-end" style={{ width: 180 }}>
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditPaginated.rows.map(r => {
                        const rowModule = getAuditRowModule(r);
                        const description = String(r.descripcion || "").trim();
                        const semanticSummary = String(r.resumen_label || "").trim();
                        const rowSummary = semanticSummary || description;
                        const expanded = auditExpandedRowId === r.id_historial;
                        const contextLabel =
                          rowModule === "PEDIDO" || rowModule === "DELIVERY"
                            ? "Ir a pedidos"
                            : rowModule === "INVENTARIO"
                              ? "Ir a inventario"
                              : rowModule === "DESPACHO"
                                ? "Ir a despachos"
                                : rowModule === "PRODUCTO"
                                  ? "Ir a productos"
                                  : rowModule === "CATEGORIA"
                                    ? "Ir a categorías"
                                    : rowModule === "REPORTE"
                                      ? "Ir a reportes"
                                      : "Ver panel";

                        return [
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
                                {getAuditActionLabel(r.accion)}
                              </span>
                            </td>
                            <td>
                              <span className="badge text-bg-secondary">{getAuditModuleLabel(rowModule)}</span>
                            </td>
                            <td>{rowSummary.length > 120 ? `${rowSummary.slice(0, 120)}...` : rowSummary || "—"}</td>
                            <td>{getAuditReferenceLabel(r)}</td>
                            <td>{r.usuario || "—"}</td>
                            <td className="text-end">
                              <div className="d-inline-flex gap-2">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => setAuditExpandedRowId(prev => (prev === r.id_historial ? null : r.id_historial))}
                                >
                                  {expanded ? "Ocultar" : "Detalle"}
                                </button>
                                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => jumpFromAudit(r)}>
                                  {contextLabel}
                                </button>
                              </div>
                            </td>
                          </tr>,
                          expanded ? (
                            <tr key={`${r.id_historial}-detail`} className="table-light">
                              <td colSpan={7}>
                                <div className="small">
                                  <div className="mb-1">
                                    <span className="text-muted">Acción técnica:</span> <span className="fw-semibold">{r.accion || "—"}</span>
                                  </div>
                                  <div className="mb-1">
                                    <span className="text-muted">Resumen completo:</span> {description || "—"}
                                  </div>
                                  <div>
                                    <span className="text-muted">Referencia técnica:</span> tipo={r.referencia_tipo || "—"} · valor=
                                    {r.referencia_valor || "—"}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null,
                        ];
                      })}
                    </tbody>
                  </table>

                  <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
                    <div className="small text-muted">
                      Página {auditPaginated.page} de {auditPaginated.totalPages} · {auditPaginated.total} registros · {auditPaginated.pageSize} por
                      página
                    </div>
                    <div className="btn-group btn-group-sm" role="group" aria-label="Paginación auditoría">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={auditLoading || auditPaginated.page <= 1}
                        onClick={() => setAuditPage(p => Math.max(p - 1, 1))}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={auditLoading || auditPaginated.page >= auditPaginated.totalPages}
                        onClick={() => setAuditPage(p => Math.min(p + 1, auditPaginated.totalPages))}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
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
                  <div className="text-muted small">Vista operativa con KPIs, filtros avanzados y stock semaforizado.</div>
                </div>

                <div className="d-flex gap-2 flex-wrap">
                  <button
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => {
                      const f = invApplied;
                      if (!f) return;

                      const q = new URLSearchParams();
                      if (f.search.trim()) q.set("search", f.search.trim());
                      if (f.categoriaId.trim()) q.set("categoriaId", f.categoriaId.trim());
                      const qs = q.toString();
                      exportFile(`/inventory/export/admin${qs ? `?${qs}` : ""}`, "inventario-admin.csv");
                    }}
                    disabled={exportingGeneric || !invApplied || (invPaginated?.rows?.length ?? 0) <= 0}
                  >
                    {exportingGeneric ? "Exportando..." : "Exportar inventario (CSV)"}
                  </button>
                </div>
              </div>

              {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}

              {invKpisError ? <div className="alert alert-danger">{getErrorMessage(invKpisError)}</div> : null}

              <div className="row g-2 mb-3">
                <div className="col-12 col-md-4">
                  <div className="border rounded p-3 h-100 bg-light">
                    <div className="small text-muted">Productos con stock</div>
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="fs-4 fw-semibold">{invKpisLoading ? "…" : (invKpis?.totalProductos ?? "—")}</div>
                      <span className="badge text-bg-success">OK</span>
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="border rounded p-3 h-100 bg-light">
                    <div className="small text-muted">Agotados</div>
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="fs-4 fw-semibold">{invKpisLoading ? "…" : (invKpis?.agotados ?? "—")}</div>
                      <span className="badge text-bg-danger">Alerta</span>
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="border rounded p-3 h-100 bg-light">
                    <div className="small text-muted">Stock bajo (≤ 10)</div>
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="fs-4 fw-semibold">{invKpisLoading ? "…" : (invKpis?.stockBajo ?? "—")}</div>
                      <span className="badge text-bg-warning">Revisar</span>
                    </div>
                  </div>
                </div>
              </div>

              <form
                className="row g-2 align-items-end mb-3"
                onSubmit={e => {
                  e.preventDefault();
                  setInvPage(1);
                  setInvInboundPage(1);
                  setInvApplied({ ...invDraft });
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
                    value={invDraft.search}
                    onChange={e => setInvDraft(s => ({ ...s, search: e.target.value }))}
                  />
                </div>
                <div className="col-sm-6 col-md-4">
                  <label className="form-label" htmlFor="inv-categoria">
                    Categoría
                  </label>
                  <select
                    id="inv-categoria"
                    className="form-select form-select-sm"
                    value={invDraft.categoriaId}
                    onChange={e => setInvDraft(s => ({ ...s, categoriaId: e.target.value }))}
                    disabled={invCategoryOptionsLoading}
                  >
                    <option value="">Todas las categorías</option>
                    {(invCategoryOptions || []).map(c => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-sm-4 col-md-1">
                  <label className="form-label" htmlFor="inv-page-size">
                    Tamaño
                  </label>
                  <select
                    id="inv-page-size"
                    className="form-select form-select-sm"
                    value={invDraft.pageSize}
                    onChange={e => setInvDraft(s => ({ ...s, pageSize: e.target.value }))}
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>
                <div className="col-sm-4 col-md-1">
                  <button type="submit" className="btn btn-sm btn-primary w-100">
                    Aplicar
                  </button>
                </div>
                <div className="col-sm-4 col-md-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary w-100"
                    onClick={() => {
                      const clean = { search: "", categoriaId: "", pageSize: "20" };
                      setInvDraft(clean);
                      setInvApplied(null);
                      setInvPage(1);
                      setInvInboundPage(1);
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </form>

              {invCategoryOptionsError ? <div className="alert alert-warning">{getErrorMessage(invCategoryOptionsError)}</div> : null}
              {invPaginatedError ? <div className="alert alert-danger">{getErrorMessage(invPaginatedError)}</div> : null}
              {inboundError ? <div className="alert alert-danger">{getErrorMessage(inboundError)}</div> : null}

              {!invApplied ? <div className="alert alert-info">Aplica filtros para cargar el inventario.</div> : null}

              {invApplied && invPaginatedLoading ? <div className="text-muted">Cargando...</div> : null}

              {invApplied && !invPaginatedLoading && invPaginated && invPaginated.rows.length === 0 ? (
                <div className="alert alert-info mb-0">Sin resultados para los filtros actuales.</div>
              ) : null}

              {invApplied && !invPaginatedLoading && invPaginated && invPaginated.rows.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th className="text-end">Precio</th>
                        <th className="text-end">Stock</th>
                        <th className="text-end" style={{ width: 150 }}>
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invPaginated.rows.map(r => (
                        <tr key={r.id_inventario}>
                          <td>{r.nombre_producto}</td>
                          <td>{r.nombre_categoria || "Sin categoría"}</td>
                          <td className="text-end">S/ {money.format(Number(r.precio || 0))}</td>
                          <td>
                            <div className="d-flex justify-content-end">
                              {Number(r.stock || 0) === 0 ? <span className="badge text-bg-danger">Agotado</span> : null}
                              {Number(r.stock || 0) > 0 && Number(r.stock || 0) <= 10 ? (
                                <span className="badge text-bg-warning">{r.stock}</span>
                              ) : null}
                              {Number(r.stock || 0) > 10 ? <span className="badge text-bg-success">{r.stock}</span> : null}
                            </div>
                          </td>
                          <td className="text-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => {
                                setInvInboundFormDraft(s => ({ ...s, id_inventario: String(r.id_inventario) }));
                                setInvInboundSearchDraft(getInventorySelectionLabel(r));
                                setInvInboundFormError(null);
                                setInvInboundSearchOpen(false);
                                setInvInboundSearchActiveIndex(-1);
                              }}
                            >
                              Usar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
                    <div className="small text-muted">
                      Página {invPaginated.page} de {invPaginated.totalPages} · {invPaginated.total} registros
                    </div>
                    <div className="btn-group btn-group-sm" role="group" aria-label="Paginación inventario">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={invPaginated.page <= 1 || invPaginatedLoading}
                        onClick={() => setInvPage(p => Math.max(p - 1, 1))}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={invPaginated.page >= invPaginated.totalPages || invPaginatedLoading}
                        onClick={() => setInvPage(p => Math.min(p + 1, invPaginated.totalPages))}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <hr className="my-4" />
              <div className="d-flex align-items-start justify-content-between flex-column flex-md-row gap-2 mb-2">
                <div>
                  <h6 className="mb-1">Registrar entrada (modo administrativo)</h6>
                  <div className="small text-muted">
                    Esta acción se usa para contingencias o control. El registro operativo principal se mantiene en el dashboard de empleado.
                  </div>
                </div>
              </div>

              {invInboundSuccess ? <div className="alert alert-success py-2">{invInboundSuccess}</div> : null}
              {createInboundInventory.isError ? <div className="alert alert-danger py-2">{getErrorMessage(createInboundInventory.error)}</div> : null}
              {invInboundFormError ? <div className="alert alert-warning py-2">{invInboundFormError}</div> : null}

              <form
                className="row g-2 align-items-end"
                onSubmit={e => {
                  e.preventDefault();
                  setInvInboundFormError(null);
                  setInvInboundSuccess(null);

                  const idInventario = Number(invInboundFormDraft.id_inventario);
                  const cantidad = Number(invInboundFormDraft.cantidad);
                  const motivo = invInboundFormDraft.motivo.trim();

                  if (!Number.isInteger(idInventario) || idInventario <= 0) {
                    setInvInboundFormError("Selecciona un producto válido desde el buscador.");
                    return;
                  }

                  if (!Number.isInteger(cantidad) || cantidad <= 0) {
                    setInvInboundFormError("Ingresa una cantidad válida mayor que 0.");
                    return;
                  }

                  if (!motivo) {
                    setInvInboundFormError("Ingresa el motivo de la entrada.");
                    return;
                  }

                  createInboundInventory.mutate({
                    id_inventario: idInventario,
                    cantidad,
                    motivo,
                  });
                }}
              >
                <div className="col-12 col-lg-6">
                  <label className="form-label" htmlFor="admin-inbound-search">
                    Buscar producto para entrada
                  </label>
                  <div className="position-relative" ref={invInboundSearchWrapRef}>
                    <input
                      id="admin-inbound-search"
                      type="search"
                      className="form-control form-control-sm"
                      placeholder="Nombre de producto o ID inventario"
                      value={invInboundSearchDraft}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={invInboundDropdownVisible}
                      aria-controls={invInboundListboxId}
                      aria-activedescendant={
                        invInboundDropdownVisible &&
                        invInboundSearchActiveIndex >= 0 &&
                        invInboundSearchActiveIndex < invInboundSearchCandidates.length
                          ? `admin-inbound-option-${invInboundSearchCandidates[invInboundSearchActiveIndex].id_inventario}`
                          : undefined
                      }
                      onFocus={() => {
                        if (invInboundSearchDraft.trim().length > 0) {
                          setInvInboundSearchOpen(true);
                        }
                      }}
                      onBlur={() => {
                        window.setTimeout(() => {
                          setInvInboundSearchOpen(false);
                          setInvInboundSearchActiveIndex(-1);
                        }, 120);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Escape") {
                          setInvInboundSearchOpen(false);
                          setInvInboundSearchActiveIndex(-1);
                          return;
                        }

                        if (e.key === "ArrowDown") {
                          if (!invInboundSearchDraft.trim()) return;
                          e.preventDefault();
                          setInvInboundSearchOpen(true);
                          if (invInboundSearchCandidates.length > 0) {
                            setInvInboundSearchActiveIndex(prev => {
                              const next = prev + 1;
                              return next >= invInboundSearchCandidates.length ? 0 : next;
                            });
                          }
                          return;
                        }

                        if (e.key === "ArrowUp") {
                          if (!invInboundSearchDraft.trim() || invInboundSearchCandidates.length === 0) return;
                          e.preventDefault();
                          setInvInboundSearchOpen(true);
                          setInvInboundSearchActiveIndex(prev => {
                            if (prev < 0) return invInboundSearchCandidates.length - 1;
                            const next = prev - 1;
                            return next < 0 ? invInboundSearchCandidates.length - 1 : next;
                          });
                          return;
                        }

                        if (e.key === "Enter") {
                          if (!invInboundSearchDraft.trim()) return;
                          e.preventDefault();
                          const targetIndex =
                            invInboundSearchActiveIndex >= 0 ? invInboundSearchActiveIndex : invInboundSearchCandidates.length > 0 ? 0 : -1;
                          if (targetIndex < 0) return;
                          const row = invInboundSearchCandidates[targetIndex];
                          if (!row) return;
                          setInvInboundFormDraft(s => ({ ...s, id_inventario: String(row.id_inventario) }));
                          setInvInboundSearchDraft(getInventorySelectionLabel(row));
                          setInvInboundFormError(null);
                          setInvInboundSearchOpen(false);
                          setInvInboundSearchActiveIndex(-1);
                          return;
                        }
                      }}
                      onChange={e => {
                        const nextValue = e.target.value;
                        setInvInboundSearchDraft(nextValue);
                        setInvInboundSearchOpen(nextValue.trim().length > 0);
                        setInvInboundSearchActiveIndex(-1);
                        setInvInboundFormError(null);
                        setInvInboundFormDraft(s => ({ ...s, id_inventario: "" }));
                      }}
                    />

                    {invInboundDropdownVisible ? (
                      <div
                        id={invInboundListboxId}
                        className="position-absolute start-0 top-100 mt-1 bg-white border rounded shadow-sm"
                        style={{ width: "100%", zIndex: 1070, maxHeight: 240, overflowY: "auto" }}
                        role="listbox"
                        aria-label="Resultados de búsqueda para entrada"
                      >
                        {invPaginatedError ? <div className="px-2 py-2 small text-danger">No se pudo cargar inventario para sugerencias.</div> : null}
                        {!invPaginatedError && invInboundSearchCandidates.length === 0 ? (
                          <div className="px-2 py-2 small text-muted">Sin coincidencias en la página actual de inventario.</div>
                        ) : null}

                        {!invPaginatedError
                          ? invInboundSearchCandidates.map((r, index) => {
                              const isSelected = Number(invInboundFormDraft.id_inventario) === Number(r.id_inventario);
                              const isActive = invInboundSearchActiveIndex === index;
                              return (
                                <button
                                  id={`admin-inbound-option-${r.id_inventario}`}
                                  key={`admin-inbound-sel-${r.id_inventario}`}
                                  type="button"
                                  role="option"
                                  aria-selected={isActive}
                                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0 border-bottom rounded-0 ${isSelected || isActive ? "active" : ""}`}
                                  onMouseDown={event => event.preventDefault()}
                                  onMouseEnter={() => setInvInboundSearchActiveIndex(index)}
                                  onClick={() => {
                                    setInvInboundFormDraft(s => ({ ...s, id_inventario: String(r.id_inventario) }));
                                    setInvInboundSearchDraft(getInventorySelectionLabel(r));
                                    setInvInboundFormError(null);
                                    setInvInboundSearchOpen(false);
                                    setInvInboundSearchActiveIndex(-1);
                                  }}
                                >
                                  <span className="small">{getInventorySelectionLabel(r)}</span>
                                  <span className={`badge ${isSelected || isActive ? "text-bg-light text-dark" : "text-bg-secondary"}`}>
                                    Stock {r.stock || 0}
                                  </span>
                                </button>
                              );
                            })
                          : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="col-12 col-md-3 col-lg-2">
                  <label className="form-label" htmlFor="admin-inbound-quantity">
                    Cantidad
                  </label>
                  <input
                    id="admin-inbound-quantity"
                    type="number"
                    min="1"
                    className="form-control form-control-sm"
                    placeholder="Cantidad"
                    value={invInboundFormDraft.cantidad}
                    onChange={e => setInvInboundFormDraft(s => ({ ...s, cantidad: e.target.value }))}
                  />
                </div>

                <div className="col-12 col-md-9 col-lg-4">
                  <label className="form-label" htmlFor="admin-inbound-reason">
                    Motivo
                  </label>
                  <input
                    id="admin-inbound-reason"
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Ej: Compra mayorista, ajuste positivo, devolución cliente"
                    value={invInboundFormDraft.motivo}
                    onChange={e => setInvInboundFormDraft(s => ({ ...s, motivo: e.target.value }))}
                  />
                </div>

                <div className="col-12 d-flex flex-wrap gap-2 mt-2">
                  <button type="submit" className="btn btn-sm btn-primary" disabled={createInboundInventory.isPending}>
                    {createInboundInventory.isPending ? "Registrando..." : "Registrar entrada"}
                  </button>
                  {invInboundSelectedId ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => {
                        setInvInboundFormDraft(s => ({ ...s, id_inventario: "" }));
                        setInvInboundSearchDraft("");
                        setInvInboundSearchOpen(false);
                        setInvInboundSearchActiveIndex(-1);
                      }}
                    >
                      Limpiar selección
                    </button>
                  ) : null}
                </div>
              </form>

              {invInboundSelectedRow ? (
                <div className="alert alert-light border mt-3 mb-0">
                  <div className="small text-muted">Producto seleccionado</div>
                  <div className="fw-semibold">{invInboundSelectedRow.nombre_producto}</div>
                  <div className="small text-muted">
                    ID inventario: {invInboundSelectedRow.id_inventario} · Stock actual: {invInboundSelectedRow.stock}
                  </div>
                </div>
              ) : null}

              <hr className="my-4" />
              <div className="d-flex align-items-start justify-content-between flex-column flex-md-row gap-2 mb-2">
                <div>
                  <h6 className="mb-1">Entradas de inventario</h6>
                  <div className="small text-muted">Trazabilidad de ingresos registrados para los filtros aplicados.</div>
                </div>
              </div>

              {invApplied && inboundLoading ? <div className="text-muted">Cargando entradas...</div> : null}

              {invApplied && !inboundLoading && inboundRows && inboundRows.rows.length === 0 ? (
                <div className="alert alert-info mb-0">Sin entradas de inventario para los filtros actuales.</div>
              ) : null}

              {invApplied && !inboundLoading && inboundRows && inboundRows.rows.length > 0 ? (
                <div className="table-responsive mt-3">
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
                      {inboundRows.rows.map(r => (
                        <tr key={r.id_entrada_inventario}>
                          <td className="text-nowrap">
                            {(() => {
                              const dt = formatDateTime(r.fecha_entrada_utc, "datetime");
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
                      Página {inboundRows.page} de {inboundRows.totalPages} · {inboundRows.total} registros
                    </div>
                    <div className="btn-group btn-group-sm" role="group" aria-label="Paginación entradas inventario">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={inboundRows.page <= 1 || inboundLoading}
                        onClick={() => setInvInboundPage(p => Math.max(p - 1, 1))}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={inboundRows.page >= inboundRows.totalPages || inboundLoading}
                        onClick={() => setInvInboundPage(p => Math.min(p + 1, inboundRows.totalPages))}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
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
        ) : null}

        {section === "categories" ? (
          <section className="card">
            <div className="card-body">
              <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
                <div>
                  <h4 className="mb-1">Categorías</h4>
                  <div className="text-muted small">Administra la clasificación del catálogo y su uso en productos.</div>
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
                <div className="col-12 col-md-8">
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
                <div className="col-12 col-md-4">
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
                        <th style={{ width: 170 }}>Productos</th>
                        <th className="text-end" style={{ width: 240 }}>
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map(c => {
                        const editing = categoryEditingId === c.id;
                        const confirmingDelete = categoryConfirmDeleteId === c.id;
                        const totalProductos = Number(c.total_productos || 0);
                        const canDelete = totalProductos === 0;
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
                            <td>
                              <span className={`badge ${totalProductos > 0 ? "text-bg-secondary" : "text-bg-light"}`}>
                                {totalProductos} {totalProductos === 1 ? "producto" : "productos"}
                              </span>
                            </td>
                            <td className="text-end">
                              {!editing && !confirmingDelete ? (
                                <div className="d-flex gap-2 justify-content-end flex-wrap">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => {
                                      setCategoryEditingId(c.id);
                                      setCategoryEditingName(c.nombre);
                                      setCategoryConfirmDeleteId(null);
                                    }}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    disabled={deleteCategory.isPending || !canDelete}
                                    title={canDelete ? "Eliminar categoría" : "No se puede eliminar: tiene productos asociados"}
                                    onClick={() => {
                                      if (!canDelete) return;
                                      setCategoryConfirmDeleteId(c.id);
                                    }}
                                  >
                                    Eliminar
                                  </button>
                                  {!canDelete ? <div className="w-100 small text-muted">Tiene productos asociados.</div> : null}
                                </div>
                              ) : null}

                              {editing ? (
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
                              ) : null}

                              {confirmingDelete ? (
                                <div className="d-flex flex-column align-items-end gap-2">
                                  <div className="small text-muted">¿Eliminar categoría "{c.nombre}"?</div>
                                  <div className="d-flex gap-2 justify-content-end flex-wrap">
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-danger"
                                      disabled={deleteCategory.isPending}
                                      onClick={() => {
                                        deleteCategory.mutate(c.id);
                                      }}
                                    >
                                      {deleteCategory.isPending ? "Eliminando..." : "Confirmar"}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary"
                                      disabled={deleteCategory.isPending}
                                      onClick={() => {
                                        setCategoryConfirmDeleteId(null);
                                      }}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : null}
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

        {section === "users" ? (
          <section className="card">
            <div className="card-body">
              <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
                <div>
                  <h4 className="mb-1">Usuarios</h4>
                  <div className="text-muted small">
                    Gestión operativa de clientes, empleados y repartidores. La creación de administradores está deshabilitada en este módulo.
                  </div>
                </div>

                <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowCreateManagedUser(v => !v)}>
                  {showCreateManagedUser ? "Cerrar" : "Nuevo usuario"}
                </button>
              </div>

              {managedUsersError ? <div className="alert alert-danger">{getErrorMessage(managedUsersError)}</div> : null}
              {createEmployee.isError ? <div className="alert alert-danger">{getErrorMessage(createEmployee.error)}</div> : null}
              {createRider.isError ? <div className="alert alert-danger">{getErrorMessage(createRider.error)}</div> : null}
              {updateManagedUser.isError ? <div className="alert alert-danger">{getErrorMessage(updateManagedUser.error)}</div> : null}
              {deactivateManagedUser.isError ? <div className="alert alert-danger">{getErrorMessage(deactivateManagedUser.error)}</div> : null}
              {reactivateManagedUser.isError ? <div className="alert alert-danger">{getErrorMessage(reactivateManagedUser.error)}</div> : null}

              <form
                className="row g-2 align-items-end mb-3"
                onSubmit={e => {
                  e.preventDefault();
                  setUsersApplied({ ...usersDraft });
                  setUsersPage(1);
                }}
              >
                <div className="col-sm-6 col-md-4">
                  <label className="form-label" htmlFor="users-search">
                    Buscar
                  </label>
                  <input
                    id="users-search"
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Nombre, email, teléfono o ID"
                    value={usersDraft.search}
                    onChange={e => setUsersDraft(s => ({ ...s, search: e.target.value }))}
                  />
                </div>
                <div className="col-sm-6 col-md-2">
                  <label className="form-label" htmlFor="users-role">
                    Rol
                  </label>
                  <select
                    id="users-role"
                    className="form-select form-select-sm"
                    value={usersDraft.rol}
                    onChange={e => setUsersDraft(s => ({ ...s, rol: normalizeManagedUserRole(e.target.value) }))}
                  >
                    <option value="">Todos</option>
                    <option value="CLIENTE">Cliente</option>
                    <option value="EMPLEADO">Empleado</option>
                    <option value="REPARTIDOR">Repartidor</option>
                  </select>
                </div>
                <div className="col-sm-6 col-md-2">
                  <label className="form-label" htmlFor="users-state">
                    Estado
                  </label>
                  <select
                    id="users-state"
                    className="form-select form-select-sm"
                    value={usersDraft.estado}
                    onChange={e => setUsersDraft(s => ({ ...s, estado: normalizeManagedUserState(e.target.value) }))}
                  >
                    <option value="">Todos</option>
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                  </select>
                </div>
                <div className="col-sm-6 col-md-2">
                  <label className="form-label" htmlFor="users-page-size">
                    Filas
                  </label>
                  <select
                    id="users-page-size"
                    className="form-select form-select-sm"
                    value={usersDraft.pageSize}
                    onChange={e => setUsersDraft(s => ({ ...s, pageSize: e.target.value }))}
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>
                <div className="col-sm-6 col-md-2 d-flex gap-2">
                  <button type="submit" className="btn btn-sm btn-primary w-100">
                    Aplicar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary w-100"
                    onClick={() => {
                      const reset = { search: "", rol: "" as ManagedUserRole, estado: "ACTIVO" as ManagedUserState, pageSize: "20" };
                      setUsersDraft(reset);
                      setUsersApplied(reset);
                      setUsersPage(1);
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </form>

              {showCreateManagedUser ? (
                <div className="border rounded p-3 mb-3">
                  <div className="fw-semibold mb-2">Crear usuario interno</div>
                  <form
                    className="row g-2"
                    onSubmit={e => {
                      e.preventDefault();
                      const payload = {
                        nombre: createManagedUserDraft.nombre.trim(),
                        apellido: createManagedUserDraft.apellido.trim(),
                        email: createManagedUserDraft.email.trim(),
                        telefono: createManagedUserDraft.telefono.trim(),
                        direccion_principal: createManagedUserDraft.direccion_principal.trim(),
                        contrasena: createManagedUserDraft.contrasena,
                        licencia: createManagedUserDraft.licencia.trim(),
                      };

                      if (!payload.nombre || !payload.apellido || !payload.email || !payload.contrasena) return;

                      if (createManagedUserDraft.rol === "EMPLEADO") {
                        createEmployee.mutate({
                          nombre: payload.nombre,
                          apellido: payload.apellido,
                          email: payload.email,
                          telefono: payload.telefono,
                          direccion_principal: payload.direccion_principal,
                          contrasena: payload.contrasena,
                        });
                        return;
                      }

                      if (!payload.licencia) return;
                      createRider.mutate(payload);
                    }}
                  >
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Tipo</label>
                      <select
                        className="form-select form-select-sm"
                        value={createManagedUserDraft.rol}
                        onChange={e => {
                          const nextRole = e.target.value === "REPARTIDOR" ? "REPARTIDOR" : "EMPLEADO";
                          setCreateManagedUserDraft(s => ({ ...s, rol: nextRole }));
                        }}
                      >
                        <option value="EMPLEADO">Empleado</option>
                        <option value="REPARTIDOR">Repartidor</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Nombre</label>
                      <input
                        className="form-control form-control-sm"
                        value={createManagedUserDraft.nombre}
                        required
                        onChange={e => setCreateManagedUserDraft(s => ({ ...s, nombre: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Apellido</label>
                      <input
                        className="form-control form-control-sm"
                        value={createManagedUserDraft.apellido}
                        required
                        onChange={e => setCreateManagedUserDraft(s => ({ ...s, apellido: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Email</label>
                      <input
                        type="email"
                        className="form-control form-control-sm"
                        value={createManagedUserDraft.email}
                        required
                        onChange={e => setCreateManagedUserDraft(s => ({ ...s, email: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Teléfono</label>
                      <input
                        className="form-control form-control-sm"
                        value={createManagedUserDraft.telefono}
                        onChange={e => setCreateManagedUserDraft(s => ({ ...s, telefono: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-5">
                      <label className="form-label mb-1">Dirección</label>
                      <input
                        className="form-control form-control-sm"
                        value={createManagedUserDraft.direccion_principal}
                        onChange={e => setCreateManagedUserDraft(s => ({ ...s, direccion_principal: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label mb-1">Contraseña temporal</label>
                      <input
                        type="password"
                        className="form-control form-control-sm"
                        value={createManagedUserDraft.contrasena}
                        required
                        onChange={e => setCreateManagedUserDraft(s => ({ ...s, contrasena: e.target.value }))}
                      />
                    </div>

                    {createManagedUserDraft.rol === "REPARTIDOR" ? (
                      <>
                        <div className="col-12 col-md-4">
                          <label className="form-label mb-1">Licencia</label>
                          <input
                            className="form-control form-control-sm"
                            value={createManagedUserDraft.licencia}
                            required
                            onChange={e => setCreateManagedUserDraft(s => ({ ...s, licencia: e.target.value }))}
                          />
                        </div>
                      </>
                    ) : null}

                    <div className="col-12 d-flex gap-2 justify-content-end">
                      <button type="submit" className="btn btn-sm btn-primary" disabled={createEmployee.isPending || createRider.isPending}>
                        {createEmployee.isPending || createRider.isPending ? "Guardando..." : "Crear"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={createEmployee.isPending || createRider.isPending}
                        onClick={() => {
                          setShowCreateManagedUser(false);
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              {editingManagedUserId ? (
                <div className="border rounded p-3 mb-3">
                  <div className="fw-semibold mb-2">Editar usuario #{editingManagedUserId}</div>
                  <form
                    className="row g-2"
                    onSubmit={e => {
                      e.preventDefault();
                      if (!editingManagedUserId) return;
                      updateManagedUser.mutate({
                        id_usuario: editingManagedUserId,
                        nombre: editManagedUserDraft.nombre.trim(),
                        apellido: editManagedUserDraft.apellido.trim(),
                        email: editManagedUserDraft.email.trim(),
                        telefono: editManagedUserDraft.telefono.trim(),
                        direccion_principal: editManagedUserDraft.direccion_principal.trim(),
                        licencia: editManagedUserDraft.licencia.trim(),
                      });
                    }}
                  >
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Nombre</label>
                      <input
                        className="form-control form-control-sm"
                        value={editManagedUserDraft.nombre}
                        required
                        onChange={e => setEditManagedUserDraft(s => ({ ...s, nombre: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Apellido</label>
                      <input
                        className="form-control form-control-sm"
                        value={editManagedUserDraft.apellido}
                        required
                        onChange={e => setEditManagedUserDraft(s => ({ ...s, apellido: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Email</label>
                      <input
                        type="email"
                        className="form-control form-control-sm"
                        value={editManagedUserDraft.email}
                        required
                        onChange={e => setEditManagedUserDraft(s => ({ ...s, email: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label mb-1">Teléfono</label>
                      <input
                        className="form-control form-control-sm"
                        value={editManagedUserDraft.telefono}
                        onChange={e => setEditManagedUserDraft(s => ({ ...s, telefono: e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label mb-1">Dirección</label>
                      <input
                        className="form-control form-control-sm"
                        value={editManagedUserDraft.direccion_principal}
                        onChange={e => setEditManagedUserDraft(s => ({ ...s, direccion_principal: e.target.value }))}
                      />
                    </div>

                    {editManagedUserDraft.rol === "REPARTIDOR" ? (
                      <>
                        <div className="col-12 col-md-3">
                          <label className="form-label mb-1">Licencia</label>
                          <input
                            className="form-control form-control-sm"
                            value={editManagedUserDraft.licencia}
                            onChange={e => setEditManagedUserDraft(s => ({ ...s, licencia: e.target.value }))}
                          />
                        </div>
                      </>
                    ) : null}

                    <div className="col-12 d-flex gap-2 justify-content-end">
                      <button type="submit" className="btn btn-sm btn-primary" disabled={updateManagedUser.isPending}>
                        {updateManagedUser.isPending ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={updateManagedUser.isPending}
                        onClick={() => {
                          setEditingManagedUserId(null);
                          setEditManagedUserDraft({
                            nombre: "",
                            apellido: "",
                            email: "",
                            telefono: "",
                            direccion_principal: "",
                            licencia: "",
                            rol: "",
                          });
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              {managedUsersLoading ? <div className="text-muted">Cargando...</div> : null}

              {!managedUsersLoading && managedUsersPaginated && managedUsersPaginated.rows.length === 0 ? (
                <div className="alert alert-info mb-0">Sin usuarios para los filtros actuales.</div>
              ) : null}

              {!managedUsersLoading && managedUsersPaginated && managedUsersPaginated.rows.length > 0 ? (
                <>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Usuario</th>
                          <th>Rol</th>
                          <th>Estado</th>
                          <th>Teléfono</th>
                          <th>Datos de reparto</th>
                          <th>Registro</th>
                          <th className="text-end">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {managedUsersPaginated.rows.map(r => {
                          const canMutate = r.rol === "EMPLEADO" || r.rol === "REPARTIDOR";
                          const isConfirmingDeactivate = confirmDeactivateManagedUserId === r.id_usuario;
                          const isConfirmingReactivate = confirmReactivateManagedUserId === r.id_usuario;
                          const isInactive = r.estado === "INACTIVO";
                          return (
                            <tr key={r.id_usuario}>
                              <td className="fw-semibold">#{r.id_usuario}</td>
                              <td>
                                <div className="fw-semibold">{`${r.nombre} ${r.apellido}`.trim()}</div>
                                <div className="text-muted small">{r.email}</div>
                              </td>
                              <td>
                                <span
                                  className={`badge ${r.rol === "CLIENTE" ? "text-bg-light" : r.rol === "EMPLEADO" ? "text-bg-primary" : "text-bg-info"}`}
                                >
                                  {getManagedUserRoleLabel(r.rol)}
                                </span>
                              </td>
                              <td>
                                <span className={`badge ${r.estado === "ACTIVO" ? "text-bg-success" : "text-bg-secondary"}`}>
                                  {formatStateLabel(r.estado)}
                                </span>
                              </td>
                              <td>{r.telefono || "—"}</td>
                              <td>
                                {r.rol === "REPARTIDOR" ? r.licencia || (r.id_motorizado ? `Motorizado #${r.id_motorizado}` : "Sin vínculo") : "—"}
                              </td>
                              <td className="text-nowrap">
                                {(() => {
                                  const dt = formatDateTime(r.fecha_registro, "datetime");
                                  if (!dt) return "—";
                                  return (
                                    <div title={dt.raw}>
                                      <div className="fw-semibold">{dt.date}</div>
                                      <div className="text-muted small">{dt.time}</div>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="text-end">
                                {!canMutate ? <span className="text-muted small">Solo lectura</span> : null}
                                {canMutate && !isConfirmingDeactivate && !isConfirmingReactivate ? (
                                  <div className="d-flex gap-2 justify-content-end flex-wrap">
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary"
                                      onClick={() => {
                                        setEditingManagedUserId(r.id_usuario);
                                        setEditManagedUserDraft({
                                          nombre: r.nombre || "",
                                          apellido: r.apellido || "",
                                          email: r.email || "",
                                          telefono: r.telefono || "",
                                          direccion_principal: r.direccion_principal || "",
                                          licencia: r.licencia || "",
                                          rol: r.rol,
                                        });
                                        setConfirmDeactivateManagedUserId(null);
                                        setConfirmReactivateManagedUserId(null);
                                      }}
                                    >
                                      Editar
                                    </button>
                                    {isInactive ? (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-success"
                                        disabled={reactivateManagedUser.isPending}
                                        onClick={() => {
                                          setConfirmDeactivateManagedUserId(null);
                                          setConfirmReactivateManagedUserId(r.id_usuario);
                                        }}
                                      >
                                        Reactivar
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-danger"
                                        disabled={deactivateManagedUser.isPending}
                                        onClick={() => {
                                          setConfirmReactivateManagedUserId(null);
                                          setConfirmDeactivateManagedUserId(r.id_usuario);
                                        }}
                                      >
                                        Desactivar
                                      </button>
                                    )}
                                  </div>
                                ) : null}

                                {isConfirmingDeactivate ? (
                                  <div className="d-flex flex-column align-items-end gap-2">
                                    <div className="small text-muted">¿Desactivar usuario #{r.id_usuario}?</div>
                                    <div className="d-flex gap-2 justify-content-end flex-wrap">
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-danger"
                                        disabled={deactivateManagedUser.isPending}
                                        onClick={() => deactivateManagedUser.mutate(r.id_usuario)}
                                      >
                                        {deactivateManagedUser.isPending ? "Procesando..." : "Confirmar"}
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={deactivateManagedUser.isPending}
                                        onClick={() => setConfirmDeactivateManagedUserId(null)}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : null}

                                {isConfirmingReactivate ? (
                                  <div className="d-flex flex-column align-items-end gap-2">
                                    <div className="small text-muted">¿Reactivar usuario #{r.id_usuario}?</div>
                                    {r.rol === "REPARTIDOR" ? (
                                      <div className="small text-muted text-end" style={{ maxWidth: 280 }}>
                                        Si el repartidor no quedó vinculado a un motorizado operativo, revísalo desde Editar antes de asignarle
                                        pedidos.
                                      </div>
                                    ) : null}
                                    <div className="d-flex gap-2 justify-content-end flex-wrap">
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-success"
                                        disabled={reactivateManagedUser.isPending}
                                        onClick={() => reactivateManagedUser.mutate(r.id_usuario)}
                                      >
                                        {reactivateManagedUser.isPending ? "Procesando..." : "Confirmar"}
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={reactivateManagedUser.isPending}
                                        onClick={() => setConfirmReactivateManagedUserId(null)}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
                    <div className="small text-muted">
                      Página {managedUsersPaginated.page} de {managedUsersPaginated.totalPages} · {managedUsersPaginated.total} registros
                    </div>
                    <div className="btn-group btn-group-sm" role="group" aria-label="Paginación usuarios admin">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={managedUsersPaginated.page <= 1 || managedUsersLoading}
                        onClick={() => setUsersPage(p => Math.max(p - 1, 1))}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={managedUsersPaginated.page >= managedUsersPaginated.totalPages || managedUsersLoading}
                        onClick={() => setUsersPage(p => Math.min(p + 1, managedUsersPaginated.totalPages))}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                </>
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
                    className="btn btn-outline-primary btn-sm"
                    disabled={!salesApplied || exportingGeneric}
                    onClick={() => {
                      if (!salesApplied) return;
                      const q = new URLSearchParams({ fechaInicio: salesApplied.fechaInicio, fechaFin: salesApplied.fechaFin });
                      exportFile(`/reports/sales/export/csv?${q.toString()}`, "reporte-ventas.csv");
                    }}
                  >
                    {exportingGeneric ? "Exportando..." : "Exportar CSV"}
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
              {ordersDeliveryDetailError ? <div className="alert alert-danger">{getErrorMessage(ordersDeliveryDetailError)}</div> : null}

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
        ) : null}
      </main>
    </div>
  );
}
