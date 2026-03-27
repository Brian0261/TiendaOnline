import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import type { ApiError } from "../../api/http";
import { api } from "../../api/http";
import { downloadApiFile } from "../../api/download";
import { formatDateTime } from "../../shared/datetime";

type Section = "pending" | "status-log" | "inventory" | "dispatch" | "delivery";
type InventoryTab = "stock" | "inbound-form" | "inbound-history";

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

type StatusLogRow = {
  fecha_accion_utc: string;
  id_pedido: number;
  responsable: string;
  evento: string;
  accion: string;
  detalle: string;
  anterior: string | null;
  nuevo: string | null;
};

type StatusLogResponse = {
  rows: StatusLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  motivo: string | null;
  almacen: string | null;
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

type DispatchInventorySearchResponse = {
  rows: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type DispatchDraftItem = {
  id_inventario: string;
  cantidad: string;
  searchDraft: string;
  selectedLabel: string;
};

type DispatchListFilters = {
  fechaInicio: string;
  fechaFin: string;
  search: string;
  pageSize: string;
};

function getInventorySelectionLabel(row: InventoryRow): string {
  return `${row.nombre_producto} · ID ${row.id_inventario}`;
}

function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getTodayDateInputInLima(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function ensureDispatchFiltersIncludeDate(filters: DispatchListFilters, targetDate: string): { next: DispatchListFilters; adjusted: boolean } {
  const next = { ...filters };
  let adjusted = false;

  if (next.fechaInicio && next.fechaInicio > targetDate) {
    next.fechaInicio = targetDate;
    adjusted = true;
  }

  if (next.fechaFin && next.fechaFin < targetDate) {
    next.fechaFin = targetDate;
    adjusted = true;
  }

  if (next.fechaInicio && next.fechaFin && next.fechaInicio > next.fechaFin) {
    next.fechaInicio = targetDate;
    next.fechaFin = targetDate;
    adjusted = true;
  }

  return { next, adjusted };
}

function createDefaultDispatchFilters(): DispatchListFilters {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    fechaInicio: toDateInputValue(start),
    fechaFin: toDateInputValue(end),
    search: "",
    pageSize: "20",
  };
}

function createEmptyDispatchItem(): DispatchDraftItem {
  return { id_inventario: "", cantidad: "", searchDraft: "", selectedLabel: "" };
}

function getDispatchDuplicateInventoryIds(items: DispatchDraftItem[]): Set<number> {
  const duplicates = new Set<number>();
  const seen = new Set<number>();
  for (const item of items) {
    const inventoryId = Number(item.id_inventario);
    if (!Number.isFinite(inventoryId) || inventoryId <= 0) continue;
    if (seen.has(inventoryId)) duplicates.add(inventoryId);
    seen.add(inventoryId);
  }
  return duplicates;
}

function getDispatchItemErrorMessage({
  item,
  inventoryById,
  duplicateIds,
  strict = false,
}: {
  item: DispatchDraftItem;
  inventoryById: Map<number, InventoryRow>;
  duplicateIds: Set<number>;
  strict?: boolean;
}): string | null {
  const hasSelection = item.id_inventario.trim().length > 0;
  const hasSearch = item.searchDraft.trim().length > 0;
  const hasQuantity = item.cantidad.trim().length > 0;
  const touched = hasSelection || hasSearch || hasQuantity;

  if (!strict && !touched) return null;

  const parts: string[] = [];
  const inventoryId = Number(item.id_inventario);
  const quantity = Number(item.cantidad);

  if (!hasSelection) {
    parts.push("Selecciona un inventario válido");
  } else if (!Number.isFinite(inventoryId) || inventoryId <= 0) {
    parts.push("Inventario inválido");
  }

  if (!hasQuantity) {
    parts.push("Ingresa una cantidad");
  } else if (!Number.isFinite(quantity) || quantity <= 0) {
    parts.push("Cantidad inválida");
  }

  if (Number.isFinite(inventoryId) && inventoryId > 0 && duplicateIds.has(inventoryId)) {
    parts.push("Inventario duplicado");
  }

  const found = inventoryById.get(inventoryId);
  if (found && Number.isFinite(quantity) && quantity > Number(found.stock || 0)) {
    parts.push(`Supera stock disponible (${found.stock})`);
  }

  return parts.length ? parts.join(" · ") : null;
}

type DeliveryQueueRow = {
  id_pedido: number;
  fecha_creacion: string;
  estado_pedido: string;
  direccion_envio: string;
  total_pedido: number;
  cliente: string;
  telefono: string | null;
  id_envio: number;
  estado_envio: string | null;
  id_motorizado: number | null;
};

type DeliveryRider = {
  id_motorizado: number;
  nombre: string;
  apellido: string;
  telefono: string;
  licencia: string;
  id_usuario: number | null;
  email_usuario: string;
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

function getErrorMessage(err: unknown): string {
  if (!err) return "Ocurrió un error";
  const e = err as Partial<ApiError>;
  if (typeof e.message === "string" && e.message.trim()) return e.message;
  return "Ocurrió un error";
}

export function EmployeeDashboardPage() {
  const nav = useNavigate();
  const { logout, user } = useAuth();
  const [section, setSection] = useState<Section>("pending");
  const qc = useQueryClient();
  const employeeDisplayName = `${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim() || "Usuario";

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

  const [inventoryDraft, setInventoryDraft] = useState<{ search: string }>({ search: "" });
  const [inventoryApplied, setInventoryApplied] = useState<{ search: string } | null>(null);
  const [inventoryActiveTab, setInventoryActiveTab] = useState<InventoryTab>(() => {
    if (typeof window === "undefined") return "stock";
    const saved = window.sessionStorage.getItem("employee.inventory.activeTab");
    return saved === "stock" || saved === "inbound-form" || saved === "inbound-history" ? saved : "stock";
  });
  const [inventorySearchDebounced, setInventorySearchDebounced] = useState("");
  const [inventoryInboundPage, setInventoryInboundPage] = useState(1);
  const [inventoryInboundDraft, setInventoryInboundDraft] = useState<{ id_inventario: string; cantidad: string; motivo: string }>({
    id_inventario: "",
    cantidad: "",
    motivo: "",
  });
  const [inventoryInboundSearchDraft, setInventoryInboundSearchDraft] = useState("");
  const [inventoryInboundSearchOpen, setInventoryInboundSearchOpen] = useState(false);
  const [inventoryInboundSearchActiveIndex, setInventoryInboundSearchActiveIndex] = useState<number>(-1);
  const [inventoryInboundFormError, setInventoryInboundFormError] = useState<string | null>(null);
  const [inventoryInboundSuccess, setInventoryInboundSuccess] = useState<string | null>(null);
  const inventoryInboundSearchWrapRef = useRef<HTMLDivElement | null>(null);

  const [pendingDraft, setPendingDraft] = useState<{ fechaInicio: string; fechaFin: string; search: string }>({
    fechaInicio: "",
    fechaFin: "",
    search: "",
  });
  const [pendingApplied, setPendingApplied] = useState<{ fechaInicio: string; fechaFin: string; search: string } | null>(null);

  const [statusLogFiltersDraft, setStatusLogFiltersDraft] = useState<{
    idPedido: string;
    evento: string;
    fechaInicio: string;
    fechaFin: string;
    pageSize: string;
  }>({
    idPedido: "",
    evento: "",
    fechaInicio: "",
    fechaFin: "",
    pageSize: "20",
  });
  const [statusLogFiltersApplied, setStatusLogFiltersApplied] = useState<{
    idPedido: string;
    evento: string;
    fechaInicio: string;
    fechaFin: string;
    pageSize: string;
  } | null>(null);
  const [statusLogPage, setStatusLogPage] = useState(1);

  const [dispatchDraft, setDispatchDraft] = useState<DispatchListFilters>(() => createDefaultDispatchFilters());
  const [dispatchApplied, setDispatchApplied] = useState<typeof dispatchDraft | null>(null);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [dispatchCreateDraft, setDispatchCreateDraft] = useState<{
    observacion: string;
    items: DispatchDraftItem[];
  }>({ observacion: "", items: [createEmptyDispatchItem()] });
  const [statusLogFilterError, setStatusLogFilterError] = useState<string | null>(null);
  const [dispatchFilterError, setDispatchFilterError] = useState<string | null>(null);
  const [dispatchFormError, setDispatchFormError] = useState<string | null>(null);
  const [, setDispatchSubmitAttempted] = useState(false);
  const [dispatchInventorySearchActiveIndex, setDispatchInventorySearchActiveIndex] = useState<number | null>(null);
  const [dispatchInventorySearchTerm, setDispatchInventorySearchTerm] = useState("");
  const [dispatchInventorySearchDebounced, setDispatchInventorySearchDebounced] = useState("");
  const [dispatchInventoryCacheById, setDispatchInventoryCacheById] = useState<Record<number, InventoryRow>>({});
  const [dispatchListNotice, setDispatchListNotice] = useState<string | null>(null);
  const [dispatchCreateSuccessDismissed, setDispatchCreateSuccessDismissed] = useState(false);
  const [dispatchListNoticeDismissed, setDispatchListNoticeDismissed] = useState(false);
  const [dispatchCreateToastClosing, setDispatchCreateToastClosing] = useState(false);
  const [dispatchListToastClosing, setDispatchListToastClosing] = useState(false);
  const dispatchCreateToastCloseTimerRef = useRef<number | null>(null);
  const dispatchListToastCloseTimerRef = useRef<number | null>(null);

  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliveryAssignedRiderByOrder, setDeliveryAssignedRiderByOrder] = useState<Record<number, string>>({});
  const [deliveryDetailOrderId, setDeliveryDetailOrderId] = useState<number | null>(null);
  const [deliverySuccessMessage, setDeliverySuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("d-flex");
    return () => {
      document.body.classList.remove("d-flex");
    };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setInventorySearchDebounced(inventoryDraft.search.trim());
    }, 350);
    return () => window.clearTimeout(handle);
  }, [inventoryDraft.search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("employee.inventory.activeTab", inventoryActiveTab);
  }, [inventoryActiveTab]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDispatchInventorySearchDebounced(dispatchInventorySearchTerm.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [dispatchInventorySearchTerm]);

  useEffect(() => {
    if (!inventoryInboundSearchOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (inventoryInboundSearchWrapRef.current?.contains(target)) return;
      setInventoryInboundSearchOpen(false);
      setInventoryInboundSearchActiveIndex(-1);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [inventoryInboundSearchOpen]);

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
    queryKey: ["orders", "pending", pendingApplied],
    queryFn: () => {
      const f = pendingApplied || { fechaInicio: "", fechaFin: "", search: "" };
      const q = new URLSearchParams();
      if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
      if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
      if (f.search.trim()) q.set("search", f.search.trim());
      const qs = q.toString();
      return api.get<PendingOrder[]>(`/orders/pending${qs ? `?${qs}` : ""}`);
    },
    enabled: section === "pending",
  });

  const {
    data: statusLog,
    isLoading: statusLogLoading,
    error: statusLogError,
  } = useQuery({
    queryKey: ["orders", "status-log", statusLogFiltersApplied, statusLogPage],
    queryFn: () => {
      const f = statusLogFiltersApplied || { idPedido: "", evento: "", fechaInicio: "", fechaFin: "", pageSize: "20" };
      const q = new URLSearchParams();
      q.set("page", String(statusLogPage));
      q.set("pageSize", f.pageSize || "20");
      if (f.idPedido.trim()) q.set("idPedido", f.idPedido.trim());
      if (f.evento.trim()) q.set("evento", f.evento.trim());
      if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
      if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
      return api.get<StatusLogResponse>(`/orders/status-log?${q.toString()}`);
    },
    enabled: section === "status-log",
  });

  const {
    data: inventoryRows,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery({
    queryKey: ["employee", "inventory", inventoryApplied, inventorySearchDebounced],
    queryFn: () => {
      const q = new URLSearchParams();
      if (inventorySearchDebounced) q.set("search", inventorySearchDebounced);
      const qs = q.toString();
      return api.get<InventoryRow[]>(`/inventory${qs ? `?${qs}` : ""}`);
    },
    enabled: section === "inventory" && (inventoryActiveTab === "stock" || inventoryActiveTab === "inbound-form"),
  });

  const {
    data: inboundRows,
    isLoading: inboundLoading,
    error: inboundError,
  } = useQuery({
    queryKey: ["employee", "inventory", "inbound", inventoryInboundPage, inventoryApplied?.search || ""],
    queryFn: () => {
      const f = inventoryApplied || { search: "" };
      const q = new URLSearchParams();
      q.set("page", String(inventoryInboundPage));
      q.set("pageSize", "10");
      if (f.search.trim()) q.set("search", f.search.trim());
      return api.get<InboundResponse>(`/inventory/inbound?${q.toString()}`);
    },
    enabled: section === "inventory" && inventoryActiveTab === "inbound-history" && !!inventoryApplied,
  });

  const {
    data: outboundRows,
    isLoading: outboundLoading,
    error: outboundError,
  } = useQuery({
    queryKey: [
      "employee",
      "dispatch",
      "outbound",
      dispatchPage,
      dispatchApplied?.fechaInicio || "",
      dispatchApplied?.fechaFin || "",
      dispatchApplied?.search || "",
      dispatchApplied?.pageSize || "20",
    ],
    queryFn: () => {
      const f = dispatchApplied || { fechaInicio: "", fechaFin: "", search: "", pageSize: "20" };
      const q = new URLSearchParams();
      q.set("page", String(dispatchPage));
      q.set("pageSize", f.pageSize || "20");
      if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
      if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
      if (f.search.trim()) q.set("search", f.search.trim());
      const qs = q.toString();
      return api.get<OutboundResponse>(`/dispatch/outbound${qs ? `?${qs}` : ""}`);
    },
    enabled: section === "dispatch" && !!dispatchApplied,
  });

  const {
    data: dispatchInventorySearchResult,
    isLoading: dispatchInventoryLoading,
    error: dispatchInventoryError,
  } = useQuery({
    queryKey: ["employee", "dispatch", "inventory-search", dispatchInventorySearchDebounced],
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("search", dispatchInventorySearchDebounced);
      q.set("page", "1");
      q.set("pageSize", "8");
      return api.get<DispatchInventorySearchResponse>(`/inventory/search-dispatch?${q.toString()}`);
    },
    enabled: section === "dispatch" && dispatchInventorySearchActiveIndex !== null && dispatchInventorySearchDebounced.length > 0,
  });

  const {
    data: deliveryQueue,
    isLoading: deliveryQueueLoading,
    error: deliveryQueueError,
  } = useQuery({
    queryKey: ["employee", "delivery", "queue", deliverySearch],
    queryFn: () => {
      const q = new URLSearchParams();
      if (deliverySearch.trim()) q.set("search", deliverySearch.trim());
      return api.get<DeliveryQueueRow[]>(`/delivery/queue${q.toString() ? `?${q.toString()}` : ""}`);
    },
    enabled: section === "delivery",
  });

  const {
    data: deliveryRiders,
    isLoading: deliveryRidersLoading,
    error: deliveryRidersError,
  } = useQuery({
    queryKey: ["employee", "delivery", "riders"],
    queryFn: () => api.get<DeliveryRider[]>("/delivery/riders"),
    enabled: section === "delivery",
  });

  const {
    data: deliveryDetail,
    isLoading: deliveryDetailLoading,
    error: deliveryDetailError,
  } = useQuery({
    queryKey: ["employee", "delivery", "detail", deliveryDetailOrderId],
    queryFn: () => api.get<DeliveryDetail>(`/delivery/${deliveryDetailOrderId}/detail`),
    enabled: section === "delivery" && Number.isInteger(deliveryDetailOrderId) && Number(deliveryDetailOrderId) > 0,
  });

  const assignDelivery = useMutation({
    mutationFn: (payload: { orderId: number; motorizadoId: number }) => api.patch<{ ok: boolean }>("/delivery/assign", payload),
    onSuccess: async (_data, variables) => {
      setDeliverySuccessMessage(`Pedido #${variables.orderId} asignado correctamente.`);
      await qc.invalidateQueries({ queryKey: ["employee", "delivery", "queue"] });
    },
  });

  const createDispatch = useMutation({
    mutationFn: (payload: { observacion: string; items: Array<{ id_inventario: number; cantidad: number }> }) =>
      api.post<{
        ok: boolean;
        message?: string;
        items?: Array<{ id_inventario: number; cantidad: number; nuevo_stock: number | null; nombre: string }>;
      }>("/dispatch", payload),
    onSuccess: async () => {
      setDispatchFormError(null);
      setDispatchSubmitAttempted(false);
      setDispatchCreateDraft({ observacion: "", items: [createEmptyDispatchItem()] });
      setDispatchInventorySearchActiveIndex(null);
      setDispatchInventorySearchTerm("");
      setDispatchPage(1);

      const baseFilters = dispatchApplied || dispatchDraft;
      const todayLima = getTodayDateInputInLima();
      const { next, adjusted } = ensureDispatchFiltersIncludeDate(baseFilters, todayLima);

      setDispatchApplied(next);
      if (adjusted) {
        setDispatchDraft(next);
        setDispatchListNotice(`Salida registrada. Se ajustó el rango de fechas para incluir hoy (${todayLima}) y mostrar el nuevo registro.`);
      } else {
        setDispatchListNotice("Salida registrada. Mostrando resultados más recientes en la página 1.");
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employee", "dispatch", "outbound"] }),
        qc.invalidateQueries({ queryKey: ["employee", "inventory"] }),
        qc.invalidateQueries({ queryKey: ["employee", "dispatch", "inventory-search"] }),
      ]);
      await qc.refetchQueries({ queryKey: ["employee", "dispatch", "outbound"], type: "active" });
    },
  });

  const createInboundInventory = useMutation({
    mutationFn: (payload: { id_inventario: number; cantidad: number; motivo: string }) =>
      api.post<{
        ok: boolean;
        message?: string;
        entry?: {
          id_entrada_inventario: number;
          fecha_entrada_utc: string;
          id_inventario: number;
          producto: string;
          cantidad: number;
          motivo: string;
          responsable_id: number | null;
        };
        stock?: { anterior: number; nuevo: number };
      }>("/inventory/inbound", payload),
    onSuccess: async data => {
      setInventoryInboundFormError(null);
      setInventoryInboundDraft({ id_inventario: "", cantidad: "", motivo: "" });
      setInventoryInboundSearchDraft("");
      setInventoryInboundSearchOpen(false);
      setInventoryInboundSearchActiveIndex(-1);

      const producto = String(data?.entry?.producto || "producto");
      const stockNuevo = Number(data?.stock?.nuevo || 0);
      setInventoryInboundSuccess(`Entrada registrada para ${producto}. Stock actualizado: ${stockNuevo}.`);

      setInventoryInboundPage(1);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employee", "inventory"] }),
        qc.invalidateQueries({ queryKey: ["employee", "inventory", "inbound"] }),
      ]);
    },
  });

  useEffect(() => {
    return () => {
      if (dispatchCreateToastCloseTimerRef.current != null) {
        window.clearTimeout(dispatchCreateToastCloseTimerRef.current);
      }
      if (dispatchListToastCloseTimerRef.current != null) {
        window.clearTimeout(dispatchListToastCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (createDispatch.isSuccess) {
      if (dispatchCreateToastCloseTimerRef.current != null) {
        window.clearTimeout(dispatchCreateToastCloseTimerRef.current);
        dispatchCreateToastCloseTimerRef.current = null;
      }
      setDispatchCreateSuccessDismissed(false);
      setDispatchCreateToastClosing(false);
    }
  }, [createDispatch.isSuccess]);

  useEffect(() => {
    if (dispatchListNotice) {
      if (dispatchListToastCloseTimerRef.current != null) {
        window.clearTimeout(dispatchListToastCloseTimerRef.current);
        dispatchListToastCloseTimerRef.current = null;
      }
      setDispatchListNoticeDismissed(false);
      setDispatchListToastClosing(false);
    }
  }, [dispatchListNotice]);

  const closeDispatchCreateToast = () => {
    if (dispatchCreateToastClosing) return;
    setDispatchCreateToastClosing(true);
    dispatchCreateToastCloseTimerRef.current = window.setTimeout(() => {
      setDispatchCreateSuccessDismissed(true);
      setDispatchCreateToastClosing(false);
      dispatchCreateToastCloseTimerRef.current = null;
    }, 140);
  };

  const closeDispatchListToast = () => {
    if (dispatchListToastClosing) return;
    setDispatchListToastClosing(true);
    dispatchListToastCloseTimerRef.current = window.setTimeout(() => {
      setDispatchListNoticeDismissed(true);
      setDispatchListToastClosing(false);
      dispatchListToastCloseTimerRef.current = null;
    }, 140);
  };

  const markPrepared = useMutation({
    mutationFn: (id: number) => api.patch<{ ok: true; message?: string }>(`/orders/${id}/prepare`),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders", "pending"] }),
        qc.invalidateQueries({ queryKey: ["employee", "delivery", "queue"] }),
        qc.invalidateQueries({ queryKey: ["orders", "status-log"] }),
        qc.invalidateQueries({ queryKey: ["employee", "kpis"] }),
      ]);
    },
  });

  const headerTitle = useMemo(() => {
    return section === "pending"
      ? "Pedidos pendientes"
      : section === "status-log"
        ? "Historial de estados"
        : section === "inventory"
          ? "Inventario"
          : section === "delivery"
            ? "Asignación de reparto"
            : "Despachos";
  }, [section]);

  const dispatchInventoryById = useMemo(() => {
    const map = new Map<number, InventoryRow>();
    for (const row of Object.values(dispatchInventoryCacheById)) {
      map.set(Number(row.id_inventario), row);
    }
    for (const row of dispatchInventorySearchResult?.rows || []) {
      map.set(Number(row.id_inventario), row);
    }
    return map;
  }, [dispatchInventoryCacheById, dispatchInventorySearchResult]);

  const dispatchDuplicateInventoryIds = useMemo(() => getDispatchDuplicateInventoryIds(dispatchCreateDraft.items), [dispatchCreateDraft.items]);

  const statusLogAppliedSummary = useMemo(() => {
    const f = statusLogFiltersApplied;
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
      };
      parts.push(`Evento: ${eventLabelMap[f.evento] || f.evento}`);
    }
    if (f.fechaInicio.trim() || f.fechaFin.trim()) parts.push(`Rango: ${f.fechaInicio || "…"} → ${f.fechaFin || "…"}`);
    parts.push(`Tamaño: ${f.pageSize || "20"}`);
    return parts.join(" · ");
  }, [statusLogFiltersApplied]);

  const dispatchAppliedSummary = useMemo(() => {
    const f = dispatchApplied;
    if (!f) return "Sin filtros activos";
    const parts: string[] = [];
    if (f.fechaInicio.trim() || f.fechaFin.trim()) parts.push(`Rango: ${f.fechaInicio || "…"} → ${f.fechaFin || "…"}`);
    if (f.search.trim()) parts.push(`Buscar: ${f.search.trim()}`);
    parts.push(`Tamaño: ${f.pageSize || "20"}`);
    return parts.join(" · ");
  }, [dispatchApplied]);

  const inventoryInboundSelectedId = useMemo(() => {
    const parsed = Number(inventoryInboundDraft.id_inventario);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [inventoryInboundDraft.id_inventario]);

  const inventoryInboundSelectedRow = useMemo(() => {
    if (!inventoryInboundSelectedId) return null;
    return (inventoryRows || []).find(r => Number(r.id_inventario) === inventoryInboundSelectedId) || null;
  }, [inventoryRows, inventoryInboundSelectedId]);

  const inventoryInboundSearchCandidates = useMemo(() => {
    const source = inventoryRows || [];
    const term = inventoryInboundSearchDraft.trim().toLowerCase();
    if (!term) return [];
    return source
      .filter(r => {
        const haystack = `${r.id_inventario} ${r.nombre_producto}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 50);
  }, [inventoryRows, inventoryInboundSearchDraft]);

  const inventoryInboundListboxId = "emp-inbound-search-listbox";
  const inventoryInboundSearchTerm = inventoryInboundSearchDraft.trim();
  const inventoryInboundDropdownVisible = inventoryInboundSearchOpen && inventoryInboundSearchTerm.length > 0;

  return (
    <div className="d-flex">
      <aside id="sidebar" className="d-flex flex-column flex-shrink-0 p-3">
        <div className="text-center mb-4">
          <img src="/assets/images/logo-bodega.png" alt="logo" className="rounded-circle mb-2" width={80} height={80} />
          <h5 className="m-0 fw-semibold text-truncate" title={employeeDisplayName}>
            {employeeDisplayName}
          </h5>
          <div className="small text-muted">Empleado</div>
        </div>

        <div className="menu-title">Panel Empleado</div>
        <ul className="nav nav-pills flex-column mb-auto">
          <li className="nav-item">
            <button className={`nav-link ${section === "pending" ? "active" : ""}`} onClick={() => setSection("pending")}>
              <i className="fa-solid fa-clipboard-list"></i> Pedidos pendientes
            </button>
          </li>
          <li>
            <button
              className={`nav-link ${section === "dispatch" ? "active" : ""}`}
              onClick={() => {
                setSection("dispatch");
                setDispatchPage(1);
                setDispatchFilterError(null);
                setDispatchApplied(s => s ?? { ...dispatchDraft });
                setDispatchListNotice(null);
              }}
            >
              <i className="fa-solid fa-truck"></i> Despachos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "delivery" ? "active" : ""}`} onClick={() => setSection("delivery")}>
              <i className="fa-solid fa-motorcycle"></i> Asignación de reparto
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
            <button className={`nav-link ${section === "status-log" ? "active" : ""}`} onClick={() => setSection("status-log")}>
              <i className="fa-solid fa-list"></i> Historial de estados
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
                onClick={() => {
                  const f = pendingApplied || { fechaInicio: "", fechaFin: "", search: "" };
                  const q = new URLSearchParams();
                  if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
                  if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
                  if (f.search.trim()) q.set("search", f.search.trim());
                  const qs = q.toString();
                  exportFile(`/orders/pending/export${qs ? `?${qs}` : ""}`, "pedidos-pendientes.csv");
                }}
                disabled={exportingGeneric}
              >
                {exportingGeneric ? "Exportando..." : "Exportar pendientes (CSV)"}
              </button>
            ) : null}

            {section === "status-log" ? (
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => {
                  const f = statusLogFiltersApplied || { idPedido: "", evento: "", fechaInicio: "", fechaFin: "", pageSize: "20" };
                  const q = new URLSearchParams();
                  if (f.idPedido.trim()) q.set("idPedido", f.idPedido.trim());
                  if (f.evento.trim()) q.set("evento", f.evento.trim());
                  if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
                  if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
                  const qs = q.toString();
                  exportFile(`/orders/status-log/export${qs ? `?${qs}` : ""}`, "historial-estados.csv");
                }}
                disabled={exportingGeneric}
              >
                {exportingGeneric ? "Exportando..." : "Exportar historial (CSV)"}
              </button>
            ) : null}

            {section === "inventory" ? (
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => {
                  const f = inventoryApplied || { search: "" };
                  const q = new URLSearchParams();
                  if (f.search.trim()) q.set("search", f.search.trim());
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
                  const f = dispatchApplied || { fechaInicio: "", fechaFin: "", search: "" };
                  const q = new URLSearchParams();
                  if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
                  if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
                  if (f.search.trim()) q.set("search", f.search.trim());
                  const qs = q.toString();
                  exportFile(`/dispatch/outbound/export${qs ? `?${qs}` : ""}`, "despachos.csv");
                }}
                disabled={exportingGeneric}
              >
                {exportingGeneric ? "Exportando..." : "Exportar despachos (CSV)"}
              </button>
            ) : null}

            <span className="badge bg-light text-dark">Pendientes: {kpisLoading ? "…" : (kpis?.pendientes ?? "—")}</span>
            <span className="badge bg-light text-dark">En camino: {kpisLoading ? "…" : (kpis?.encamino ?? "—")}</span>
            <span className="badge bg-light text-dark">Entregados hoy: {kpisLoading ? "…" : (kpis?.entregadosHoy ?? "—")}</span>
            <span className="small text-muted">KPIs globales (no se filtran por esta vista)</span>
          </div>
        </div>

        {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}

        {kpisError ? <div className="alert alert-warning">{getErrorMessage(kpisError)}</div> : null}

        {section === "pending" ? (
          <section className="card">
            <div className="card-body">
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

              <div className="small text-muted mb-3">
                Mostrando {pendingLoading ? "…" : (pendingOrders?.length ?? 0)} de {kpisLoading ? "…" : (kpis?.pendientes ?? 0)} pedidos pendientes.
              </div>

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

        {section === "status-log" ? (
          <section className="card">
            <div className="card-body">
              <form
                className="row g-2 align-items-end mb-3"
                onSubmit={e => {
                  e.preventDefault();
                  if (
                    statusLogFiltersDraft.fechaInicio.trim() &&
                    statusLogFiltersDraft.fechaFin.trim() &&
                    statusLogFiltersDraft.fechaInicio > statusLogFiltersDraft.fechaFin
                  ) {
                    setStatusLogFilterError("El rango de fechas es inválido: la fecha de inicio no puede ser mayor que la fecha fin.");
                    return;
                  }
                  setStatusLogFilterError(null);
                  setStatusLogPage(1);
                  setStatusLogFiltersApplied({ ...statusLogFiltersDraft });
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
                    value={statusLogFiltersDraft.idPedido}
                    onChange={e => setStatusLogFiltersDraft(s => ({ ...s, idPedido: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label" htmlFor="emp-log-evento">
                    Evento
                  </label>
                  <select
                    id="emp-log-evento"
                    className="form-select form-select-sm"
                    value={statusLogFiltersDraft.evento}
                    onChange={e => setStatusLogFiltersDraft(s => ({ ...s, evento: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="PREPARAR_PEDIDO">Pedido preparado</option>
                    <option value="TRANSICION_ESTADO">Cambio de estado</option>
                    <option value="DELIVERY_ASIGNADO">Repartidor asignado</option>
                    <option value="DELIVERY_EN_RUTA">Inicio de ruta</option>
                    <option value="DELIVERY_ENTREGADO">Entrega completada</option>
                    <option value="DELIVERY_NO_ENTREGADO">Entrega no completada</option>
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
                    value={statusLogFiltersDraft.fechaInicio}
                    onChange={e => setStatusLogFiltersDraft(s => ({ ...s, fechaInicio: e.target.value }))}
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
                    value={statusLogFiltersDraft.fechaFin}
                    onChange={e => setStatusLogFiltersDraft(s => ({ ...s, fechaFin: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-1">
                  <label className="form-label" htmlFor="emp-log-pageSize">
                    Tamaño
                  </label>
                  <select
                    id="emp-log-pageSize"
                    className="form-select form-select-sm"
                    value={statusLogFiltersDraft.pageSize}
                    onChange={e => setStatusLogFiltersDraft(s => ({ ...s, pageSize: e.target.value }))}
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
                      const clean = { idPedido: "", evento: "", fechaInicio: "", fechaFin: "", pageSize: "20" };
                      setStatusLogFiltersDraft(clean);
                      setStatusLogFiltersApplied(clean);
                      setStatusLogFilterError(null);
                      setStatusLogPage(1);
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </form>

              {statusLogFilterError ? <div className="alert alert-warning py-2">{statusLogFilterError}</div> : null}
              <div className="small text-muted mb-3">Filtros activos: {statusLogAppliedSummary}</div>

              {statusLogError ? <div className="alert alert-danger">{getErrorMessage(statusLogError)}</div> : null}

              {statusLogLoading ? <div className="text-muted">Cargando...</div> : null}

              {!statusLogLoading && statusLog && statusLog.rows.length === 0 ? <div className="alert alert-info mb-0">No hay registros.</div> : null}

              {!statusLogLoading && statusLog && statusLog.rows.length > 0 ? (
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

                  <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
                    <div className="small text-muted">
                      Página {statusLog.page} de {statusLog.totalPages} · {statusLog.total} registros
                    </div>
                    <div className="btn-group btn-group-sm" role="group" aria-label="Paginación historial">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={statusLog.page <= 1 || statusLogLoading}
                        onClick={() => setStatusLogPage(p => Math.max(p - 1, 1))}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={statusLog.page >= statusLog.totalPages || statusLogLoading}
                        onClick={() => setStatusLogPage(p => Math.min(p + 1, statusLog.totalPages))}
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
              <form
                className="row g-2 align-items-end mb-3"
                onSubmit={e => {
                  e.preventDefault();
                  setInventoryApplied({ ...inventoryDraft });
                  setInventoryInboundPage(1);
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
                  <button type="submit" className="btn btn-sm btn-primary w-100">
                    Aplicar
                  </button>
                </div>
                <div className="col-sm-6 col-md-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary w-100"
                    onClick={() => {
                      const clean = { search: "" };
                      setInventoryDraft(clean);
                      setInventoryApplied(clean);
                      setInventoryInboundPage(1);
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </form>

              <div className="small text-muted mb-3">La búsqueda por producto se aplica automáticamente después de una pausa breve al escribir.</div>

              <ul className="nav nav-tabs mb-3" role="tablist" aria-label="Vistas de inventario empleado">
                <li className="nav-item" role="presentation">
                  <button
                    type="button"
                    role="tab"
                    className={`nav-link ${inventoryActiveTab === "stock" ? "active" : ""}`}
                    aria-selected={inventoryActiveTab === "stock"}
                    onClick={() => setInventoryActiveTab("stock")}
                  >
                    Stock actual
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    type="button"
                    role="tab"
                    className={`nav-link ${inventoryActiveTab === "inbound-form" ? "active" : ""}`}
                    aria-selected={inventoryActiveTab === "inbound-form"}
                    onClick={() => setInventoryActiveTab("inbound-form")}
                  >
                    Registrar entrada
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    type="button"
                    role="tab"
                    className={`nav-link ${inventoryActiveTab === "inbound-history" ? "active" : ""}`}
                    aria-selected={inventoryActiveTab === "inbound-history"}
                    onClick={() => setInventoryActiveTab("inbound-history")}
                  >
                    Historial de entradas
                  </button>
                </li>
              </ul>

              {inventoryActiveTab === "stock" || inventoryActiveTab === "inbound-form" ? (
                inventoryError ? (
                  <div className="alert alert-danger">{getErrorMessage(inventoryError)}</div>
                ) : null
              ) : null}
              {inventoryActiveTab === "stock" || inventoryActiveTab === "inbound-form" ? (
                inventoryLoading ? (
                  <div className="text-muted">Cargando...</div>
                ) : null
              ) : null}
              {inventoryActiveTab === "inbound-history" ? (
                inboundError ? (
                  <div className="alert alert-danger">{getErrorMessage(inboundError)}</div>
                ) : null
              ) : null}

              {inventoryActiveTab === "inbound-form" ? (
                <div className="card border mb-4">
                  <div className="card-body">
                    <h6 className="mb-2">Registrar entrada</h6>
                    <div className="small text-muted mb-3">
                      Flujo operativo principal: busca el producto, selecciónalo y registra la cantidad. Despachos se mantiene exclusivamente para
                      salidas.
                    </div>

                    {inventoryInboundSuccess ? <div className="alert alert-success py-2">{inventoryInboundSuccess}</div> : null}
                    {createInboundInventory.isError ? (
                      <div className="alert alert-danger py-2">{getErrorMessage(createInboundInventory.error)}</div>
                    ) : null}
                    {inventoryInboundFormError ? <div className="alert alert-warning py-2">{inventoryInboundFormError}</div> : null}

                    <form
                      className="row g-2 align-items-end"
                      onSubmit={e => {
                        e.preventDefault();
                        setInventoryInboundFormError(null);
                        setInventoryInboundSuccess(null);

                        const idInventario = Number(inventoryInboundDraft.id_inventario);
                        const cantidad = Number(inventoryInboundDraft.cantidad);
                        const motivo = inventoryInboundDraft.motivo.trim();

                        if (!Number.isInteger(idInventario) || idInventario <= 0) {
                          setInventoryInboundFormError("Selecciona un producto válido desde el buscador.");
                          return;
                        }

                        if (!Number.isInteger(cantidad) || cantidad <= 0) {
                          setInventoryInboundFormError("Ingresa una cantidad válida mayor que 0.");
                          return;
                        }

                        if (!motivo) {
                          setInventoryInboundFormError("Ingresa el motivo de la entrada.");
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
                        <label className="form-label" htmlFor="emp-inbound-search">
                          Buscar producto para entrada
                        </label>
                        <div className="position-relative" ref={inventoryInboundSearchWrapRef}>
                          <input
                            id="emp-inbound-search"
                            type="search"
                            className="form-control form-control-sm"
                            placeholder="Nombre de producto o ID inventario"
                            value={inventoryInboundSearchDraft}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={inventoryInboundDropdownVisible}
                            aria-controls={inventoryInboundListboxId}
                            aria-activedescendant={
                              inventoryInboundDropdownVisible &&
                              inventoryInboundSearchActiveIndex >= 0 &&
                              inventoryInboundSearchActiveIndex < inventoryInboundSearchCandidates.length
                                ? `emp-inbound-option-${inventoryInboundSearchCandidates[inventoryInboundSearchActiveIndex].id_inventario}`
                                : undefined
                            }
                            onFocus={() => {
                              if (inventoryInboundSearchDraft.trim().length > 0) {
                                setInventoryInboundSearchOpen(true);
                              }
                            }}
                            onBlur={() => {
                              window.setTimeout(() => {
                                setInventoryInboundSearchOpen(false);
                                setInventoryInboundSearchActiveIndex(-1);
                              }, 120);
                            }}
                            onKeyDown={e => {
                              if (e.key === "Escape") {
                                setInventoryInboundSearchOpen(false);
                                setInventoryInboundSearchActiveIndex(-1);
                                return;
                              }

                              if (e.key === "ArrowDown") {
                                if (!inventoryInboundSearchDraft.trim()) return;
                                e.preventDefault();
                                setInventoryInboundSearchOpen(true);
                                if (inventoryInboundSearchCandidates.length > 0) {
                                  setInventoryInboundSearchActiveIndex(prev => {
                                    const next = prev + 1;
                                    return next >= inventoryInboundSearchCandidates.length ? 0 : next;
                                  });
                                }
                                return;
                              }

                              if (e.key === "ArrowUp") {
                                if (!inventoryInboundSearchDraft.trim() || inventoryInboundSearchCandidates.length === 0) return;
                                e.preventDefault();
                                setInventoryInboundSearchOpen(true);
                                setInventoryInboundSearchActiveIndex(prev => {
                                  if (prev < 0) return inventoryInboundSearchCandidates.length - 1;
                                  const next = prev - 1;
                                  return next < 0 ? inventoryInboundSearchCandidates.length - 1 : next;
                                });
                                return;
                              }

                              if (e.key === "Enter") {
                                if (!inventoryInboundSearchDraft.trim()) return;
                                e.preventDefault();
                                const targetIndex =
                                  inventoryInboundSearchActiveIndex >= 0
                                    ? inventoryInboundSearchActiveIndex
                                    : inventoryInboundSearchCandidates.length > 0
                                      ? 0
                                      : -1;
                                if (targetIndex < 0) return;
                                const row = inventoryInboundSearchCandidates[targetIndex];
                                if (!row) return;
                                setInventoryInboundDraft(s => ({ ...s, id_inventario: String(row.id_inventario) }));
                                setInventoryInboundSearchDraft(getInventorySelectionLabel(row));
                                setInventoryInboundFormError(null);
                                setInventoryInboundSearchOpen(false);
                                setInventoryInboundSearchActiveIndex(-1);
                                return;
                              }
                            }}
                            onChange={e => {
                              const nextValue = e.target.value;
                              setInventoryInboundSearchDraft(nextValue);
                              setInventoryInboundSearchOpen(nextValue.trim().length > 0);
                              setInventoryInboundSearchActiveIndex(-1);
                              setInventoryInboundFormError(null);
                              setInventoryInboundDraft(s => ({ ...s, id_inventario: "" }));
                            }}
                          />

                          {inventoryInboundDropdownVisible ? (
                            <div
                              id={inventoryInboundListboxId}
                              className="position-absolute start-0 top-100 mt-1 bg-white border rounded shadow-sm"
                              style={{ width: "100%", zIndex: 1070, maxHeight: 240, overflowY: "auto" }}
                              role="listbox"
                              aria-label="Resultados de búsqueda para entrada"
                            >
                              {inventoryError ? (
                                <div className="px-2 py-2 small text-danger">No se pudo cargar el stock para sugerencias.</div>
                              ) : null}
                              {!inventoryError && inventoryInboundSearchCandidates.length === 0 ? (
                                <div className="px-2 py-2 small text-muted">Sin coincidencias en el stock cargado.</div>
                              ) : null}

                              {!inventoryError
                                ? inventoryInboundSearchCandidates.map((r, index) => {
                                    const isSelected = Number(inventoryInboundDraft.id_inventario) === Number(r.id_inventario);
                                    const isActive = inventoryInboundSearchActiveIndex === index;
                                    return (
                                      <button
                                        id={`emp-inbound-option-${r.id_inventario}`}
                                        key={`emp-inbound-sel-${r.id_inventario}`}
                                        type="button"
                                        role="option"
                                        aria-selected={isActive}
                                        className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0 border-bottom rounded-0 ${isSelected || isActive ? "active" : ""}`}
                                        onMouseDown={event => event.preventDefault()}
                                        onMouseEnter={() => setInventoryInboundSearchActiveIndex(index)}
                                        onClick={() => {
                                          setInventoryInboundDraft(s => ({ ...s, id_inventario: String(r.id_inventario) }));
                                          setInventoryInboundSearchDraft(getInventorySelectionLabel(r));
                                          setInventoryInboundFormError(null);
                                          setInventoryInboundSearchOpen(false);
                                          setInventoryInboundSearchActiveIndex(-1);
                                        }}
                                      >
                                        <span className="small">{getInventorySelectionLabel(r)}</span>
                                        <span className={`badge ${isSelected || isActive ? "text-bg-light text-dark" : "text-bg-secondary"}`}>
                                          Stock {r.stock ?? 0}
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
                        <label className="form-label" htmlFor="emp-inbound-quantity">
                          Cantidad
                        </label>
                        <input
                          id="emp-inbound-quantity"
                          type="number"
                          min="1"
                          className="form-control form-control-sm"
                          placeholder="Cantidad"
                          value={inventoryInboundDraft.cantidad}
                          onChange={e => setInventoryInboundDraft(s => ({ ...s, cantidad: e.target.value }))}
                        />
                      </div>

                      <div className="col-12 col-md-9 col-lg-4">
                        <label className="form-label" htmlFor="emp-inbound-reason">
                          Motivo
                        </label>
                        <input
                          id="emp-inbound-reason"
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Ej: Compra mayorista, ajuste positivo, devolución cliente"
                          value={inventoryInboundDraft.motivo}
                          onChange={e => setInventoryInboundDraft(s => ({ ...s, motivo: e.target.value }))}
                        />
                      </div>

                      <div className="col-12 d-flex flex-wrap gap-2 mt-2">
                        <button type="submit" className="btn btn-sm btn-primary" disabled={createInboundInventory.isPending}>
                          {createInboundInventory.isPending ? "Registrando..." : "Registrar entrada"}
                        </button>
                        {inventoryInboundSelectedId ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => {
                              setInventoryInboundDraft(s => ({ ...s, id_inventario: "" }));
                              setInventoryInboundSearchDraft("");
                              setInventoryInboundSearchOpen(false);
                              setInventoryInboundSearchActiveIndex(-1);
                            }}
                          >
                            Limpiar selección
                          </button>
                        ) : null}
                      </div>
                    </form>

                    {inventoryInboundSelectedRow ? (
                      <div className="alert alert-light border mt-3 mb-0">
                        <div className="small text-muted">Producto seleccionado</div>
                        <div className="fw-semibold">{inventoryInboundSelectedRow.nombre_producto}</div>
                        <div className="small text-muted">
                          ID inventario: {inventoryInboundSelectedRow.id_inventario} · Stock actual: {inventoryInboundSelectedRow.stock ?? 0}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {inventoryActiveTab === "stock" ? (
                <>
                  <h6 className="mb-2">Stock actual</h6>

                  {!inventoryLoading && inventoryRows && inventoryRows.length === 0 ? (
                    <div className="alert alert-info mb-0">Sin resultados para los filtros actuales.</div>
                  ) : null}

                  {!inventoryLoading && inventoryRows && inventoryRows.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead>
                          <tr>
                            <th style={{ width: 120 }}>ID inventario</th>
                            <th>Producto</th>
                            <th className="text-end">Stock</th>
                            <th className="text-end" style={{ width: 160 }}>
                              Acción
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryRows.map(r => (
                            <tr key={r.id_inventario}>
                              <td className="fw-semibold">#{r.id_inventario}</td>
                              <td>{r.nombre_producto}</td>
                              <td className="text-end fw-semibold">
                                <span className={`badge ${Number(r.stock ?? 0) <= 20 ? "text-bg-warning" : "text-bg-success"}`}>{r.stock ?? 0}</span>
                              </td>
                              <td className="text-end">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => {
                                    setInventoryInboundDraft(s => ({ ...s, id_inventario: String(r.id_inventario) }));
                                    setInventoryInboundSearchDraft(getInventorySelectionLabel(r));
                                    setInventoryInboundFormError(null);
                                    setInventoryInboundSearchOpen(false);
                                    setInventoryInboundSearchActiveIndex(-1);
                                  }}
                                >
                                  Usar en entrada
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              ) : null}

              {inventoryActiveTab === "inbound-history" ? (
                <>
                  <h6 className="mb-2">Historial de entradas</h6>
                  <div className="small text-muted mb-3">Trazabilidad de ingresos con responsable para los filtros aplicados.</div>

                  {!inventoryApplied ? <div className="alert alert-info">Aplica filtros para consultar el historial de entradas.</div> : null}
                  {inventoryApplied && inboundLoading ? <div className="text-muted">Cargando entradas...</div> : null}

                  {inventoryApplied && !inboundLoading && inboundRows && inboundRows.rows.length === 0 ? (
                    <div className="alert alert-info mb-0">Sin entradas para los filtros actuales.</div>
                  ) : null}

                  {inventoryApplied && !inboundLoading && inboundRows && inboundRows.rows.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead>
                          <tr>
                            <th style={{ width: 150 }}>Fecha</th>
                            <th>Producto</th>
                            <th className="text-end" style={{ width: 100 }}>
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
                        <div className="btn-group btn-group-sm" role="group" aria-label="Paginación entradas empleado">
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            disabled={inboundRows.page <= 1 || inboundLoading}
                            onClick={() => setInventoryInboundPage(p => Math.max(p - 1, 1))}
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            disabled={inboundRows.page >= inboundRows.totalPages || inboundLoading}
                            onClick={() => setInventoryInboundPage(p => Math.min(p + 1, inboundRows.totalPages))}
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        {section === "dispatch" ? (
          <section className="card">
            <div className="card-body">
              {(createDispatch.isSuccess && !dispatchCreateSuccessDismissed) || (dispatchListNotice && !dispatchListNoticeDismissed) ? (
                <div className="dispatch-toast-stack" role="status" aria-live="polite" aria-atomic="false">
                  {createDispatch.isSuccess && !dispatchCreateSuccessDismissed ? (
                    <div className={`dispatch-toast${dispatchCreateToastClosing ? " dispatch-toast--closing" : ""}`} role="alert">
                      <span className="dispatch-toast-text">Despacho registrado.</span>
                      <button type="button" className="dispatch-toast-close" aria-label="Cerrar mensaje" onClick={closeDispatchCreateToast}>
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                  ) : null}

                  {dispatchListNotice && !dispatchListNoticeDismissed ? (
                    <div className={`dispatch-toast${dispatchListToastClosing ? " dispatch-toast--closing" : ""}`} role="alert">
                      <span className="dispatch-toast-text">{dispatchListNotice}</span>
                      <button type="button" className="dispatch-toast-close" aria-label="Cerrar mensaje" onClick={closeDispatchListToast}>
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="row g-3">
                <div className="col-12 col-lg-6">
                  <div className="card border">
                    <div className="card-body">
                      <h6 className="mb-1">Paso 1: Registrar salida</h6>
                      <div className="small text-muted mb-3">
                        Registra una salida manual de inventario con un motivo o referencia clara para el equipo.
                      </div>

                      {createDispatch.isError ? <div className="alert alert-danger">{getErrorMessage(createDispatch.error)}</div> : null}
                      {dispatchInventoryError ? <div className="alert alert-warning">{getErrorMessage(dispatchInventoryError)}</div> : null}
                      {dispatchFormError ? <div className="alert alert-warning py-2">{dispatchFormError}</div> : null}

                      <form
                        className="row g-2"
                        onSubmit={e => {
                          e.preventDefault();
                          setDispatchFormError(null);
                          setDispatchSubmitAttempted(true);

                          const normalizedItems = dispatchCreateDraft.items.map(it => ({
                            id_inventario: Number(it.id_inventario),
                            cantidad: Number(it.cantidad),
                          }));

                          const hasItemErrors = dispatchCreateDraft.items.some(item =>
                            Boolean(
                              getDispatchItemErrorMessage({
                                item,
                                inventoryById: dispatchInventoryById,
                                duplicateIds: dispatchDuplicateInventoryIds,
                                strict: true,
                              }),
                            ),
                          );

                          const items = normalizedItems.filter(
                            it => Number.isFinite(it.id_inventario) && it.id_inventario > 0 && Number.isFinite(it.cantidad) && it.cantidad > 0,
                          );

                          if (items.length === 0) {
                            setDispatchFormError("Agrega al menos 1 ítem válido (inventario y cantidad mayor a 0).");
                            return;
                          }

                          if (hasItemErrors) {
                            setDispatchFormError("Corrige los errores de los ítems antes de registrar el despacho.");
                            return;
                          }

                          createDispatch.mutate({ observacion: dispatchCreateDraft.observacion.trim(), items });
                        }}
                      >
                        <div className="col-12">
                          <label className="form-label" htmlFor="emp-dispatch-observacion">
                            Motivo o referencia
                          </label>
                          <input
                            id="emp-dispatch-observacion"
                            className="form-control form-control-sm"
                            type="text"
                            value={dispatchCreateDraft.observacion}
                            onChange={e => setDispatchCreateDraft(s => ({ ...s, observacion: e.target.value }))}
                            placeholder="Ej: ajuste interno, merma, traslado no trazado en sistema"
                          />
                        </div>

                        <div className="col-12">
                          <label className="form-label">Ítems</label>
                          <div className="d-flex flex-column gap-2">
                            {dispatchCreateDraft.items.map((it, i) => {
                              const selectedInventory = dispatchInventoryById.get(Number(it.id_inventario));

                              return (
                                <div key={i} className="border rounded p-2">
                                  <div className="row g-2 align-items-start">
                                    <div className="col-12 col-xl-7">
                                      <label className="form-label small text-muted mb-1">Producto o inventario</label>
                                      {it.id_inventario.trim() ? (
                                        <div className="border rounded bg-light px-3 py-2 h-100">
                                          <div className="fw-semibold text-break">
                                            {selectedInventory?.nombre_producto || it.selectedLabel || `ID ${it.id_inventario}`}
                                          </div>
                                          <div className="small text-muted text-break">
                                            {selectedInventory
                                              ? `Inventario #${selectedInventory.id_inventario} · Stock ${selectedInventory.stock}`
                                              : it.selectedLabel || `Inventario #${it.id_inventario}`}
                                          </div>
                                        </div>
                                      ) : (
                                        <div>
                                          <input
                                            className="form-control form-control-sm"
                                            type="search"
                                            placeholder="Buscar por ID o nombre de producto"
                                            value={it.searchDraft}
                                            onFocus={() => {
                                              setDispatchInventorySearchActiveIndex(i);
                                              setDispatchInventorySearchTerm(it.searchDraft);
                                            }}
                                            onBlur={() => {
                                              window.setTimeout(() => {
                                                setDispatchInventorySearchActiveIndex(prev => (prev === i ? null : prev));
                                              }, 120);
                                            }}
                                            onChange={e => {
                                              const nextValue = e.target.value;
                                              setDispatchCreateDraft(s => ({
                                                ...s,
                                                items: s.items.map((x, idx) =>
                                                  idx === i ? { ...x, searchDraft: nextValue, id_inventario: "", selectedLabel: "" } : x,
                                                ),
                                              }));
                                              setDispatchInventorySearchActiveIndex(i);
                                              setDispatchInventorySearchTerm(nextValue);
                                            }}
                                          />
                                          {dispatchInventorySearchActiveIndex === i && it.searchDraft.trim() ? (
                                            <div className="border rounded mt-1" style={{ maxHeight: 220, overflowY: "auto" }}>
                                              {dispatchInventoryLoading ? <div className="small text-muted p-2">Buscando inventario...</div> : null}
                                              {!dispatchInventoryLoading && (dispatchInventorySearchResult?.rows || []).length === 0 ? (
                                                <div className="small text-muted p-2">Sin resultados para la búsqueda actual.</div>
                                              ) : null}
                                              {!dispatchInventoryLoading
                                                ? (dispatchInventorySearchResult?.rows || []).map(row => (
                                                    <button
                                                      type="button"
                                                      key={row.id_inventario}
                                                      className="btn btn-sm btn-light w-100 text-start border-0 border-bottom rounded-0"
                                                      onMouseDown={e => e.preventDefault()}
                                                      onClick={() => {
                                                        const label = `${row.id_inventario} · ${row.nombre_producto} · stock ${row.stock}`;
                                                        setDispatchCreateDraft(s => ({
                                                          ...s,
                                                          items: s.items.map((x, idx) =>
                                                            idx === i
                                                              ? {
                                                                  ...x,
                                                                  id_inventario: String(row.id_inventario),
                                                                  selectedLabel: label,
                                                                  searchDraft: label,
                                                                }
                                                              : x,
                                                          ),
                                                        }));
                                                        setDispatchInventoryCacheById(prev => ({ ...prev, [row.id_inventario]: row }));
                                                        setDispatchInventorySearchActiveIndex(null);
                                                        setDispatchInventorySearchTerm("");
                                                      }}
                                                    >
                                                      #{row.id_inventario} · {row.nombre_producto} · stock {row.stock}
                                                    </button>
                                                  ))
                                                : null}
                                            </div>
                                          ) : null}
                                        </div>
                                      )}
                                    </div>

                                    <div className="col-12 col-sm-4 col-xl-2">
                                      <label className="form-label small text-muted mb-1" htmlFor={`emp-dispatch-cantidad-${i}`}>
                                        Cantidad
                                      </label>
                                      <input
                                        id={`emp-dispatch-cantidad-${i}`}
                                        className="form-control form-control-sm"
                                        type="number"
                                        min="1"
                                        inputMode="numeric"
                                        placeholder="Cantidad"
                                        value={it.cantidad}
                                        onChange={e =>
                                          setDispatchCreateDraft(s => ({
                                            ...s,
                                            items: s.items.map((x, idx) => (idx === i ? { ...x, cantidad: e.target.value } : x)),
                                          }))
                                        }
                                      />
                                    </div>

                                    <div className="col-12 col-sm-8 col-xl-3">
                                      <label className="form-label small text-muted mb-1">Acciones</label>
                                      <div className="d-flex gap-2 flex-wrap">
                                        {it.id_inventario.trim() ? (
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary"
                                            onClick={() => {
                                              setDispatchCreateDraft(s => ({
                                                ...s,
                                                items: s.items.map((x, idx) =>
                                                  idx === i
                                                    ? {
                                                        ...x,
                                                        id_inventario: "",
                                                        selectedLabel: "",
                                                        searchDraft: "",
                                                      }
                                                    : x,
                                                ),
                                              }));
                                              setDispatchInventorySearchActiveIndex(i);
                                              setDispatchInventorySearchTerm("");
                                            }}
                                          >
                                            Buscar otro
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-danger"
                                          disabled={dispatchCreateDraft.items.length <= 1}
                                          onClick={() => {
                                            setDispatchCreateDraft(s => ({ ...s, items: s.items.filter((_, idx) => idx !== i) }));
                                            setDispatchInventorySearchActiveIndex(prev => {
                                              if (prev === null) return prev;
                                              if (prev === i) return null;
                                              if (prev > i) return prev - 1;
                                              return prev;
                                            });
                                          }}
                                        >
                                          Quitar
                                        </button>
                                      </div>
                                    </div>

                                    {selectedInventory ? (
                                      <div className="col-12">
                                        <div className="small text-muted">
                                          Producto: {selectedInventory.nombre_producto} · Stock disponible: {selectedInventory.stock}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="small text-muted mt-2">
                            Busca un item, confirma la cantidad y usa “Buscar otro” si necesitas reemplazar la selección.
                          </div>
                        </div>

                        <div className="col-12 d-flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setDispatchCreateDraft(s => ({ ...s, items: [...s.items, createEmptyDispatchItem()] }))}
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
                      <h6 className="mb-1">Paso 2: Filtrar listado</h6>
                      <div className="small text-muted mb-3">Define el rango y criterios para consultar despachos registrados.</div>
                      <form
                        className="row g-2 align-items-end"
                        onSubmit={e => {
                          e.preventDefault();
                          if (
                            dispatchDraft.fechaInicio.trim() &&
                            dispatchDraft.fechaFin.trim() &&
                            dispatchDraft.fechaInicio > dispatchDraft.fechaFin
                          ) {
                            setDispatchFilterError("El rango de fechas es inválido: la fecha de inicio no puede ser mayor que la fecha fin.");
                            return;
                          }
                          setDispatchFilterError(null);
                          setDispatchListNotice(null);
                          setDispatchPage(1);
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
                        <div className="col-12 col-md-2">
                          <label className="form-label" htmlFor="emp-disp-pageSize">
                            Tamaño
                          </label>
                          <select
                            id="emp-disp-pageSize"
                            className="form-select form-select-sm"
                            value={dispatchDraft.pageSize}
                            onChange={e => setDispatchDraft(s => ({ ...s, pageSize: e.target.value }))}
                          >
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                          </select>
                        </div>
                        <div className="col-6 col-md-2">
                          <button type="submit" className="btn btn-sm btn-primary w-100">
                            Aplicar
                          </button>
                        </div>
                        <div className="col-6 col-md-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary w-100"
                            onClick={() => {
                              const clean = createDefaultDispatchFilters();
                              setDispatchDraft(clean);
                              setDispatchApplied(clean);
                              setDispatchPage(1);
                              setDispatchFilterError(null);
                              setDispatchListNotice(null);
                            }}
                          >
                            Limpiar
                          </button>
                        </div>
                      </form>
                      {dispatchFilterError ? <div className="alert alert-warning py-2 mt-2 mb-0">{dispatchFilterError}</div> : null}
                    </div>
                  </div>
                </div>
              </div>

              <hr className="my-4" />

              <h6 className="mb-3">Paso 3: Resultados del listado</h6>
              {dispatchApplied ? <div className="small text-muted mb-3">Filtros activos: {dispatchAppliedSummary}</div> : null}

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
                    <div className="btn-group btn-group-sm" role="group" aria-label="Paginación despachos">
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

        {section === "delivery" ? (
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
                    value={deliverySearch}
                    onChange={e => setDeliverySearch(e.target.value)}
                  />
                </div>
                <div className="col-sm-4 col-md-2">
                  <button type="submit" className="btn btn-sm btn-primary w-100">
                    Buscar
                  </button>
                </div>
              </form>

              {deliveryQueueError ? <div className="alert alert-danger">{getErrorMessage(deliveryQueueError)}</div> : null}
              {deliveryRidersError ? <div className="alert alert-danger">{getErrorMessage(deliveryRidersError)}</div> : null}
              {deliveryDetailError ? <div className="alert alert-danger">{getErrorMessage(deliveryDetailError)}</div> : null}
              {assignDelivery.isError ? <div className="alert alert-danger">{getErrorMessage(assignDelivery.error)}</div> : null}
              {deliverySuccessMessage ? <div className="alert alert-success">{deliverySuccessMessage}</div> : null}

              {deliveryQueueLoading || deliveryRidersLoading ? <div className="text-muted">Cargando...</div> : null}

              {!deliveryQueueLoading && deliveryQueue && deliveryQueue.length === 0 ? (
                <div className="alert alert-info mb-0">No hay pedidos listos para asignar.</div>
              ) : null}

              {!deliveryQueueLoading && deliveryQueue && deliveryQueue.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Cliente</th>
                        <th>Dirección</th>
                        <th>Estado pedido</th>
                        <th>Estado envío</th>
                        <th style={{ minWidth: 420 }}>Asignación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryQueue.map(row => (
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
                          <td className="text-truncate" style={{ maxWidth: 260 }} title={row.direccion_envio}>
                            {row.direccion_envio}
                          </td>
                          <td>
                            <span className="badge bg-secondary">{row.estado_pedido}</span>
                          </td>
                          <td>
                            <span className="badge bg-light text-dark">{row.estado_envio || "PENDIENTE"}</span>
                          </td>
                          <td>
                            <div className="d-flex gap-2 flex-wrap">
                              <select
                                className="form-select form-select-sm"
                                value={deliveryAssignedRiderByOrder[row.id_pedido] || ""}
                                onChange={e =>
                                  setDeliveryAssignedRiderByOrder(prev => ({
                                    ...prev,
                                    [row.id_pedido]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Selecciona repartidor</option>
                                {(deliveryRiders || []).map(r => (
                                  <option key={r.id_motorizado} value={String(r.id_motorizado)}>
                                    #{r.id_motorizado} · {r.nombre} {r.apellido}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                disabled={assignDelivery.isPending || !deliveryAssignedRiderByOrder[row.id_pedido]}
                                onClick={() => {
                                  const ok = window.confirm(`¿Asignar repartidor al pedido #${row.id_pedido}?`);
                                  if (!ok) return;
                                  setDeliverySuccessMessage(null);
                                  assignDelivery.mutate({
                                    orderId: row.id_pedido,
                                    motorizadoId: Number(deliveryAssignedRiderByOrder[row.id_pedido]),
                                  });
                                }}
                              >
                                {assignDelivery.isPending ? "Asignando..." : "Asignar"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => setDeliveryDetailOrderId(row.id_pedido)}
                              >
                                Ver detalle
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {deliveryDetailOrderId ? (
                <div className="card border mt-3">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between mb-2 gap-2">
                      <h6 className="mb-0">Detalle de reparto pedido #{deliveryDetailOrderId}</h6>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setDeliveryDetailOrderId(null)}>
                        Cerrar
                      </button>
                    </div>

                    {deliveryDetailLoading ? <div className="text-muted">Cargando detalle...</div> : null}

                    {!deliveryDetailLoading && deliveryDetail ? (
                      <div className="row g-2 small">
                        <div className="col-md-4">
                          <strong>Estado pedido:</strong> {deliveryDetail.estado_pedido || "—"}
                        </div>
                        <div className="col-md-4">
                          <strong>Estado envío:</strong> {deliveryDetail.estado_envio || "—"}
                        </div>
                        <div className="col-md-4">
                          <strong>Repartidor:</strong> {deliveryDetail.repartidor || "—"}
                        </div>
                        <div className="col-md-4">
                          <strong>Email repartidor:</strong> {deliveryDetail.repartidor_email || "—"}
                        </div>
                        <div className="col-md-4">
                          <strong>Cliente:</strong> {deliveryDetail.cliente || "—"}
                        </div>
                        <div className="col-md-4">
                          <strong>Teléfono cliente:</strong> {deliveryDetail.cliente_telefono || "—"}
                        </div>
                        <div className="col-md-6">
                          <strong>Nombre receptor:</strong> {deliveryDetail.nombre_receptor || "—"}
                        </div>
                        <div className="col-md-6">
                          <strong>DNI receptor:</strong> {deliveryDetail.dni_receptor || "—"}
                        </div>
                        <div className="col-md-12">
                          <strong>Observación:</strong> {deliveryDetail.observacion || "—"}
                        </div>
                        <div className="col-md-12">
                          <strong>Motivo no entrega:</strong> {deliveryDetail.motivo_no_entrega || "—"}
                        </div>
                        <div className="col-md-4">
                          <strong>Asignado:</strong>{" "}
                          {(() => {
                            const dt = formatDateTime(deliveryDetail.fecha_asignacion, "datetime");
                            if (!dt) return "—";
                            return `${dt.date}${dt.time ? ` ${dt.time}` : ""}`;
                          })()}
                        </div>
                        <div className="col-md-4">
                          <strong>Inicio ruta:</strong>{" "}
                          {(() => {
                            const dt = formatDateTime(deliveryDetail.fecha_inicio_ruta, "datetime");
                            if (!dt) return "—";
                            return `${dt.date}${dt.time ? ` ${dt.time}` : ""}`;
                          })()}
                        </div>
                        <div className="col-md-4">
                          <strong>Entregado:</strong>{" "}
                          {(() => {
                            const dt = formatDateTime(deliveryDetail.fecha_entrega, "datetime");
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
        ) : null}
      </main>
    </div>
  );
}
