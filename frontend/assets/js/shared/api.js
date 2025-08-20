/******************************************************************
 *  Micro-SDK para acceder al backend
 *  Archivo: frontend/assets/js/shared/api.js
 *
 *  - Todas las rutas usan el prefijo /api en el servidor Node
 *  - Detección y fallback de BASE:
 *      • Local:      http://localhost:3000/api
 *      • Staging/Prod (Pages): Azure FQDN primero, luego api.staging...
 *      • Fallback:   FQDN de Azure (Container Apps) /api
 *
 *  ✅ Si el path ya es absoluto (http/https), NO antepone BASE.
 ******************************************************************/

/* ─────────────────────────  Detección de BASE  ───────────────────────── */
const hostname = typeof window !== "undefined" ? window.location.hostname : "";

// FQDN actual de tu API en Azure (staging). Cambia si mueves la API.
const AZURE_API_FQDN = "https://bodega-api-stg.bluemoss-a77fa1fc.brazilsouth.azurecontainerapps.io";

// Subdominio de API detrás de Cloudflare (proxy hacia Azure)
const CF_API_STG = "https://api.staging.bodegaluchito.shop";

// Lista ordenada por preferencia para elegir BASE en este entorno
function computeBaseCandidates() {
  const IS_LOCAL = hostname === "localhost" || hostname === "127.0.0.1";
  const ON_BODEGA_DOMAIN = /\.bodegaluchito\.shop$/i.test(hostname);

  if (IS_LOCAL) {
    // Desarrollo local → backend local
    return ["http://localhost:3000/api"];
  }

  if (ON_BODEGA_DOMAIN) {
    // En staging/prod: **Primero Azure FQDN** (siempre disponible),
    // y si ya creaste el subdominio api.staging... lo tomará como fallback.
    return [`${AZURE_API_FQDN}/api`, `${CF_API_STG}/api`];
  }

  // Cualquier otro host (por ejemplo vista previa de Pages/otro dominio): usa Azure FQDN
  return [`${AZURE_API_FQDN}/api`];
}

// Permite forzar BASE por querystring: ?api=azure | ?api=cf | ?api=local
function forcedBaseByQuery() {
  try {
    const q = new URLSearchParams(window.location.search);
    const v = (q.get("api") || "").toLowerCase();
    if (v === "azure") return `${AZURE_API_FQDN}/api`;
    if (v === "cf") return `${CF_API_STG}/api`;
    if (v === "local") return "http://localhost:3000/api";
  } catch {}
  return null;
}

const BASE_CANDIDATES = (() => {
  const forced = forcedBaseByQuery();
  if (forced) return [forced];
  return computeBaseCandidates();
})();

// Export dinámico para diagnosticar desde consola (se actualizará si hay fallback)
export let API_BASE = BASE_CANDIDATES[0];

// Extras para diagnóstico
export const AZURE_FQDN = AZURE_API_FQDN;
export const CF_API_BASE = `${CF_API_STG}/api`;

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

/* ─────────────────────── util: imágenes ────────────────────────── */
function fixImagePath(img) {
  if (!img) return "/assets/images/placeholder-product.png";
  if (/^https?:\/\//i.test(img)) return img;
  // fuerza raíz absoluta y normaliza si vino como "assets/images/..."
  const cleaned = String(img).replace(/^\/?assets\/images\//i, "");
  return `/assets/images/${cleaned}`;
}

/* ─────────────────────── fetch wrapper ────────────────────────── */
const DEFAULT_TIMEOUT_MS = 15000; // 15s
const isAbsoluteUrl = path => /^https?:\/\//i.test(path);

/**
 * Determina si un error es de red/CSP/DNS que amerita intentar fallback.
 */
function shouldTryFallback(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    err?.name === "AbortError" ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("net::err_name_not_resolved") ||
    msg.includes("csp") ||
    msg.includes("refused to connect")
  );
}

async function doFetch(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hace una solicitud intentando con API_BASE actual y, si hay error de red/CSP/DNS,
 * reintenta **una vez** con el siguiente candidato de BASE_CANDIDATES.
 */
async function request(method, path, body = null, auth = false, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const headers = {};
  if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const opts = { method, headers };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);

  // Arma URL (respeta rutas absolutas y evita //)
  const buildUrl = base => (isAbsoluteUrl(path) ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`);

  // Intento 1 con API_BASE actual
  try {
    const url1 = buildUrl(API_BASE);
    const res1 = await doFetch(url1, opts, timeoutMs);

    if (res1.status === 204) return null;

    const ct1 = res1.headers.get("content-type") || "";
    const isJson1 = ct1.includes("application/json");
    const payload1 = isJson1 ? await res1.json().catch(() => null) : await res1.text().catch(() => "");

    if (!res1.ok) {
      const msg1 = (isJson1 && payload1 && (payload1.message || payload1.error)) || `${res1.status} ${res1.statusText}`;
      const e = new Error(msg1);
      e.status = res1.status;
      e.detail = payload1;
      throw e;
    }

    return payload1;
  } catch (err1) {
    // Si la URL era absoluta (el caller pidió algo concreto), no hacemos fallback
    if (isAbsoluteUrl(path) || BASE_CANDIDATES.length < 2 || !shouldTryFallback(err1)) {
      if (err1?.name === "AbortError") throw new Error("Tiempo de espera agotado (timeout)");
      throw err1;
    }

    // Intento 2 con el siguiente candidato
    const nextBase = BASE_CANDIDATES.find(b => b !== API_BASE);
    if (!nextBase) {
      if (err1?.name === "AbortError") throw new Error("Tiempo de espera agotado (timeout)");
      throw err1;
    }

    try {
      const url2 = buildUrl(nextBase);
      const res2 = await doFetch(url2, opts, timeoutMs);

      if (res2.status === 204) {
        API_BASE = nextBase;
        if (typeof window !== "undefined") window.API_BASE = API_BASE;
        return null;
      }

      const ct2 = res2.headers.get("content-type") || "";
      const isJson2 = ct2.includes("application/json");
      const payload2 = isJson2 ? await res2.json().catch(() => null) : await res2.text().catch(() => "");

      if (!res2.ok) {
        const msg2 = (isJson2 && payload2 && (payload2.message || payload2.error)) || `${res2.status} ${res2.statusText}`;
        const e = new Error(msg2);
        e.status = res2.status;
        e.detail = payload2;
        throw e;
      }

      // Éxito con fallback → fija BASE para el resto de la sesión
      API_BASE = nextBase;
      if (typeof window !== "undefined") window.API_BASE = API_BASE;
      return payload2;
    } catch (err2) {
      if (err2?.name === "AbortError") throw new Error("Tiempo de espera agotado (timeout)");
      throw err2;
    }
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
   Normalizadores
   ================================================================= */

// Convierte claves ES -> EN y asegura tipos (precio como número / imagen absoluta)
const normalizeProduct = (p = {}) => {
  const rawImg = p.image ?? p.imagen ?? null;
  return {
    id: p.id ?? p.id_producto ?? null,
    name: p.name ?? p.nombre ?? p.nombre_producto ?? "",
    description: p.description ?? p.descripcion ?? "",
    price: Number(p.price ?? p.precio ?? 0),
    image: fixImagePath(rawImg),
    categoryId: p.categoryId ?? p.id_categoria ?? null,
    brandId: p.brandId ?? p.id_marca ?? null,
    active: p.active ?? p.activo ?? 1,
  };
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
export async function getProducts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const data = await api.get(`/products${qs ? `?${qs}` : ""}`);
  const arr = Array.isArray(data) ? data : [];
  return arr.map(normalizeProduct);
}

export async function getProductById(id) {
  const data = await api.get(`/products/${id}`);
  return normalizeProduct(data);
}

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
export const addToCart = payload => api.post("/cart/add", payload, true);
export const getCart = () => api.get("/cart", true);
export const updateCartItem = payload => api.put(`/cart/update/0`, payload, true);
export const removeFromCart = idProducto => api.put(`/cart/update/0`, { id_producto: Number(idProducto), cantidad: 0 }, true);
export const deleteCartItem = idCarrito => api.del(`/cart/remove/${idCarrito}`, true);
export const getCartCount = () => api.get("/cart/count", true);
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
  const res = await fetch(`${API_BASE}${pathWithQuery}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(errMsg || "Error descargando archivo");
  return await res.blob();
}

/** Exporta pedidos como CSV (para Excel) */
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

/* Export por defecto la capa baja por si se necesita algo puntual */
export default api;

/* ──────────── Soporte global para scripts NO-módulo (ej. modal login) ──────────── */
if (typeof window !== "undefined") {
  window.API_BASE = API_BASE;
  window.API = {
    get: (p, a = false, t) => api.get(p, a, t),
    post: (p, b, a = false, t) => api.post(p, b, a, t),
    put: (p, b, a = false, t) => api.put(p, b, a, t),
    patch: (p, b, a = false, t) => api.patch(p, b, a, t),
    del: (p, a = false, t) => api.del(p, a, t),

    // helpers típicos que el modal podría usar:
    login: data => loginUser(data),
    register: data => registerUser(data),
    token: {
      get: getToken,
      set: setToken,
      remove: removeToken,
    },
  };
}
