/******************************************************************
 *  Micro-SDK para acceder al backend
 *  Archivo: frontend/assets/js/shared/api.js
 *
 *  - Todas las rutas usan el prefijo /api (definido en server.js)
 *  - Sólo emplea fetch nativo + pequeños helpers de negocio
 ******************************************************************/

/* ─────────────────────────  Config base  ───────────────────────── */
const BASE = "/api";

/* ─────────────────────────  JWT helpers  ───────────────────────── */
export const getToken = () => localStorage.getItem("token");
export const setToken = t => localStorage.setItem("token", t);
export const removeToken = () => localStorage.removeItem("token");
/** Decodifica el payload ( NO usar para datos sensibles ) */
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
async function request(method, path, body = null, auth = false) {
  const headers = {};
  if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const opts = { method, headers };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text(); // puede ser vacío (204)
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new Error(data?.message || `${res.status} ${res.statusText}`);
  return data;
}

/* Helpers de verbo (capa baja) */
export const api = {
  get: (p, a = false) => request("GET", p, null, a),
  post: (p, b, a = false) => request("POST", p, b, a),
  put: (p, b, a = false) => request("PUT", p, b, a),
  patch: (p, b, a = false) => request("PATCH", p, b, a),
  del: (p, a = false) => request("DELETE", p, null, a),
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

// PUT /api/cart/update/:id_carrito  (el :id_carrito no se usa en el controlador)
// body: { id_producto, cantidad }
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
  // Traduce nombres de parámetros a los que espera el backend
  const mapped = { ...params };
  if (params.startDate) mapped.fechaInicio = params.startDate;
  if (params.endDate) mapped.fechaFin = params.endDate;
  delete mapped.startDate;
  delete mapped.endDate;
  const qs = new URLSearchParams(mapped).toString();
  return api.get(`/reports/sales${qs ? `?${qs}` : ""}`, true);
};

/* ========== Historial de pedidos (ADMIN) ========== */

/**
 * Lista pedidos con filtros
 * @param {Object} params - { estado, fechaInicio, fechaFin, search }
 */
export const getOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/orders${qs ? `?${qs}` : ""}`, true);
};

/**
 * Exporta pedidos como CSV (para Excel)
 * @param {Object} params - igual que getOrders
 * @param {boolean} urlBlob - si true, devuelve blob URL
 */
export const exportOrders = async (params = {}, urlBlob = false) => {
  const qs = new URLSearchParams(params).toString();
  const token = getToken();
  const res = await fetch(`/api/orders/export${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("No se pudo exportar el historial");
  const blob = await res.blob();
  if (urlBlob) return URL.createObjectURL(blob);
  // Si no, retorna blob
  return blob;
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
  const token = getToken();
  const res = await fetch(`/api/dispatch/outbound/export${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("No se pudo exportar las salidas");
  const blob = await res.blob();
  if (urlBlob) return URL.createObjectURL(blob);
  return blob;
};

export const exportPendingOrders = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/orders/pending/export${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("No se pudo exportar pendientes");
  return await res.blob();
};

export const exportStatusLogCsv = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/orders/status-log/export${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("No se pudo exportar historial de estados");
  return await res.blob();
};

export const exportInventoryCsv = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/inventory/export${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("No se pudo exportar el inventario");
  return await res.blob();
};

/* ========== Checkout / Pago ========== */
export const createOrder = d => api.post("/orders", d, true);
export const payIzipayInit = d => api.post("/payments/izipay/init", d, true);
export const payIzipayMockConfirm = d => api.post("/payments/izipay/mock-confirm", d, true);

// ---- CATEGORÍAS (ADMIN) ----
export const listCategoriesAdmin = () => api.get("/categories", true);
export const createCategory = payload => api.post("/categories", payload, true); // (ya estaba bien)
export const updateCategory = (id, payload) => api.put(`/categories/${id}`, payload, true);
export const deleteCategory = id => api.del(`/categories/${id}`, true);

/* Export por defecto la capa baja en caso de requerir algo puntual */
export default api;
