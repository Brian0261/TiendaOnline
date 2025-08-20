/******************************************************************
 *  Micro-SDK para acceder al backend
 *  Archivo: frontend/assets/js/shared/api.js
 *
 *  - Todas las rutas usan el prefijo /api en el servidor Node
 *  - Este archivo detecta el hostname y arma un BASE absoluto:
 *      • Local:      http://localhost:3000/api
 *      • Staging/Prod (Cloudflare Pages): FQDN de Azure + /api
 *
 *  ✅ Mejora: si el path ya es una URL absoluta (http/https),
 *     NO se le antepone BASE (útil para pruebas puntuales).
 ******************************************************************/

/* ─────────────────────────  Detección de BASE  ───────────────────────── */
const hostname = typeof window !== "undefined" ? window.location.hostname : "";

// FQDN actual de tu API en Azure (staging). Cámbialo si mueves la API.
const AZURE_API_FQDN = "https://bodega-api-stg.bluemoss-a77fa1fc.brazilsouth.azurecontainerapps.io";

// Por defecto (fallback) asumimos mismo host sirviendo /api.
let BASE = "/api";

if (hostname === "localhost" || hostname === "127.0.0.1") {
  // Desarrollo local → backend local
  BASE = "http://localhost:3000/api";
} else if (hostname === "staging.bodegaluchito.shop" || hostname === "bodegaluchito.shop" || hostname === "www.bodegaluchito.shop") {
  // Staging / Producción (Cloudflare Pages) → API en Azure
  BASE = `${AZURE_API_FQDN}/api`;
} else if (hostname) {
  // Cualquier otro host (p.ej. otro subdominio) → API en Azure
  BASE = `${AZURE_API_FQDN}/api`;
}

// Export útil para diagnóstico desde la consola
export const API_BASE = "https://api.staging.bodegaluchito.shop";
export const AZURE_FQDN = AZURE_API_FQDN;

/* ─────────────────────────  JWT helpers  ───────────────────────── */
export const getToken = () => localStorage.getItem("token");
export const setToken = t => localStorage.setItem("token", t);
export const removeToken = () => localStorage.removeItem("token");

/** Decodifica el payload (NO usar para datos sensibles). */
export function getUserInfo() {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1])); // { id_usuario, rol, exp, … }
  } catch {
    return null;
  }
}

/* ─────────────────────── fetch wrapper ────────────────────────── */
const DEFAULT_TIMEOUT_MS = 15000; // 15s

function isAbsoluteUrl(path) {
  return /^https?:\/\//i.test(path);
}

async function request(method, path, body = null, auth = false, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const headers = {};
  // Si NO es FormData, seteamos Content-Type
  if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const opts = {
    method,
    headers,
    signal: controller.signal,
    // credentials: "include", // Úsalo solo si autenticas por cookies
  };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);

  try {
    // Si path ya es absoluto, respétalo; si no, anteponemos BASE
    const url = isAbsoluteUrl(path) ? path : `${BASE}${path.startsWith("/") ? path : `/${path}`}`;

    const res = await fetch(url, opts);

    // Puede venir 204 (sin contenido)
    if (res.status === 204) return null;

    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

    if (!res.ok) {
      const msg = (isJson && payload && (payload.message || payload.error)) || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    return payload;
  } catch (err) {
    // Uniformiza error
    if (err?.name === "AbortError") {
      throw new Error("Tiempo de espera agotado (timeout)");
    }
    throw new Error(err?.message || "Error de red");
  } finally {
    clearTimeout(timer);
  }
}

/* Helpers de verbo (capa baja) */
export const api = {
  get: (p, a = false, t) => request("GET", p, null, a, t),
  post: (p, b, a = false, t) => request("POST", p, b, a, t),
  put: (p, b, a = false, t) => request("PUT", p, b, a, t),
  patch: (p, b, a = false, t) => request("PATCH", p, b, a, t),
  del: (p, a = false, t) => request("DELETE", p, null, a, t),
};

/* =================================================================
   High-level helpers por dominio
   ================================================================= */

/* ========== Autenticación ========== */
export const registerUser = data => api.post("/auth/register", data);
export const loginUser = data => api.post("/auth/login", data);
export const refreshUser = () => api.get("/auth/me", true);

/* ========== Productos ========== */

/**
 * Lista productos con filtros opcionales.
 * @param {Object} params
 *    {string} search   → texto de búsqueda
 *    {number} category → id_categoria
 *    {string} status   → "active" | "inactive" | "all"
 *    {number} limit    → TOP n
 *    {number} page     → página (1..n)
 */
export function getProducts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/products${qs ? `?${qs}` : ""}`);
}

export const getProductById = id => api.get(`/products/${id}`);

export const createProduct = data => api.post("/products", data, true);
export const updateProduct = (id, d) => api.put(`/products/${id}`, d, true);

/*  🔸 BORRADO LÓGICO (inactivar) */
export const deleteProduct = id => api.del(`/products/${id}`, true);

/*  🔸 ACTIVAR de nuevo */
export const activateProduct = id => api.put(`/products/${id}/activate`, null, true);

/*  🔸 ELIMINACIÓN DEFINITIVA */
export const hardDeleteProduct = id => api.del(`/products/${id}/hard`, true);

export const getCategories = () => api.get("/products/categories");
export const getBrands = () => api.get("/products/brands");

/* ========== Carrito (requiere login) ========== */
// POST /api/cart/add  body: { id_producto, cantidad }
export const addToCart = payload => api.post("/cart/add", payload, true);

// GET /api/cart  → { success: true, cart: [...] }
export const getCart = () => api.get("/cart", true);

// PUT /api/cart/update/:id_carrito  (el :id_carrito no se usa en el backend)
export const updateCartItem = payload => api.put(`/cart/update/0`, payload, true);

// Eliminar por producto: mandamos cantidad 0 al mismo endpoint de update
export const removeFromCart = idProducto => api.put(`/cart/update/0`, { id_producto: Number(idProducto), cantidad: 0 }, true);

// (opcional) borrar por id_carrito — si algún día lo usas desde el admin
export const deleteCartItem = idCarrito => api.del(`/cart/remove/${idCarrito}`, true);

// Contador
export const getCartCount = () => api.get("/cart/count", true);

// Vaciar carrito completo
export const clearCart = () => api.del("/cart/clear", true);

/** Config de reparto (centro, radio, reglas de precios) */
export const getDeliveryConfig = () => api.get("/config/delivery");

/* ========== Reporte de ventas (ADMIN) ========== */
export const getSalesReport = (params = {}) => {
  const mapped = { ...params };
  if (params.startDate) mapped.fechaInicio = params.startDate;
  if (params.endDate) mapped.fechaFin = params.endDate;
  delete mapped.startDate;
  delete mapped.endDate;
  const qs = new URLSearchParams(mapped).toString();
  return api.get(`/reports/sales${qs ? `?${qs}` : ""}`, true);
};

/* ========== Historial de pedidos (ADMIN) ========== */
export const getOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/orders${qs ? `?${qs}` : ""}`, true);
};

/* Descargas CSV/Blob: usar BASE absoluto + Authorization */
async function fetchBlob(pathWithQuery, errMsg) {
  const res = await fetch(`${BASE}${pathWithQuery}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(errMsg || "Error descargando archivo");
  return await res.blob();
}

/**
 * Exporta pedidos como CSV (para Excel)
 * @param {Object} params - igual que getOrders
 * @param {boolean} urlBlob - si true, devuelve blob URL
 */
export const exportOrders = async (params = {}, urlBlob = false) => {
  const qs = new URLSearchParams(params).toString();
  const blob = await fetchBlob(`/orders/export${qs ? `?${qs}` : ""}`, "No se pudo exportar el historial");
  return urlBlob ? URL.createObjectURL(blob) : blob;
};

/** Pedidos pendientes (empleado) */
export const getPendingOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/orders/pending${qs ? `?${qs}` : ""}`, true);
};

/* Detalle de un pedido */
export const getOrder = id => api.get(`/orders/${id}`, true);

/** Cambia estado a PREPARADO */
export const prepareOrder = id => api.patch(`/orders/${id}/prepare`, null, true);

/** Acción masiva: marcar preparados */
export const prepareOrdersBulk = ids => api.patch("/orders/prepare-bulk", { ids }, true);

// Pedidos que pueden cambiar de estado (Estados tab)
export const getTransitionableOrders = () => api.get("/orders/transitionable", true);

export const transitionOrder = (id, body) => api.patch(`/orders/${id}/transition`, body, true);

export const getStatusLog = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/orders/status-log${qs ? `?${qs}` : ""}`, true);
};

// KPIs del panel de empleado
export const getEmployeeKpis = () => api.get("/orders/kpis", true);

// Inventario
export const getInventory = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/inventory${qs ? `?${qs}` : ""}`, true);
};

// Despacho (registrar salida)
export const createDispatch = body => api.post("/dispatch", body, true);

// Salidas de inventario (lista)
export const getOutbound = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/dispatch/outbound${qs ? `?${qs}` : ""}`, true);
};

// Exportar salidas (CSV)
export const exportOutbound = async (params = {}, urlBlob = false) => {
  const qs = new URLSearchParams(params).toString();
  const blob = await fetchBlob(`/dispatch/outbound/export${qs ? `?${qs}` : ""}`, "No se pudo exportar las salidas");
  return urlBlob ? URL.createObjectURL(blob) : blob;
};

export const exportPendingOrders = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await fetchBlob(`/orders/pending/export${qs ? `?${qs}` : ""}`, "No se pudo exportar pendientes");
};

export const exportStatusLogCsv = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await fetchBlob(`/orders/status-log/export${qs ? `?${qs}` : ""}`, "No se pudo exportar historial de estados");
};

export const exportInventoryCsv = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await fetchBlob(`/inventory/export${qs ? `?${qs}` : ""}`, "No se pudo exportar el inventario");
};

/* ========== Checkout / Pago ========== */
export const createOrder = d => api.post("/orders", d, true);
export const payIzipayInit = d => api.post("/payments/izipay/init", d, true);
export const payIzipayMockConfirm = d => api.post("/payments/izipay/mock-confirm", d, true);

// ---- CATEGORÍAS (ADMIN) ----
export const listCategoriesAdmin = () => api.get("/categories", true);
export const createCategory = payload => api.post("/categories", payload, true);
export const updateCategory = (id, payload) => api.put(`/categories/${id}`, payload, true);
export const deleteCategory = id => api.del(`/categories/${id}`, true);

/* Export por defecto la capa baja en caso de requerir algo puntual */
export default api;
