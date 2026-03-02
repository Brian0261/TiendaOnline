import { api } from "../api/http";
import { normalizeImageUrl } from "../shared/image";

const LS_KEY = "shoppingCart";
const BASE_URL = import.meta.env.VITE_API_BASE || "/api";

export type CartProduct = {
  id: number;
  name: string;
  price: number;
  image?: string;
  description?: string;
};

export type CartItem = {
  product: CartProduct;
  quantity: number;
};

type BackendCartItem = {
  id_carrito?: number;
  id_producto?: number;
  cantidad?: number;
  nombre_producto?: string;
  descripcion?: string;
  precio?: number;
  imagen?: string;
};

type BackendCartResponse =
  | BackendCartItem[]
  | {
      success?: boolean;
      items?: BackendCartItem[];
      cart?: BackendCartItem[];
    };

type CartCountResponse =
  | number
  | {
      total?: number;
      count?: number;
      success?: boolean;
    };

function getToken(): string | null {
  return localStorage.getItem("auth_token") || localStorage.getItem("token") || null;
}

function clearStaleAuthState(): void {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("token");
  localStorage.removeItem("auth_user");
  localStorage.removeItem("user");
}

function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; message?: unknown };
  const status = Number(e.status);
  if (status === 401) return true;
  if (typeof e.message === "string" && e.message.includes("401")) return true;
  return false;
}

function lsRead(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]") as CartItem[];
  } catch {
    return [];
  }
}

function lsWrite(items: CartItem[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function lsClear(): void {
  lsWrite([]);
}

async function fetchJsonWithToken<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers, credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

async function pushLocalCartToBackend(items: CartItem[]): Promise<void> {
  for (const it of items) {
    const productId = Number(it?.product?.id ?? 0);
    const qty = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
    if (!productId || qty <= 0) continue;
    await api.post<{ success?: boolean }>("/cart/add", { id_producto: productId, cantidad: qty });
  }
}

// Sincroniza el carrito guardado en localStorage (modo invitado) al carrito del usuario autenticado.
// Retorna true si había items y se sincronizaron correctamente.
export async function syncGuestCartToServer(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  const local = lsRead();
  if (!local.length) return false;

  await pushLocalCartToBackend(local);
  lsClear();
  return true;
}

function mapBackendItem(it: BackendCartItem): CartItem {
  return {
    product: {
      id: Number(it.id_producto ?? 0),
      name: String(it.nombre_producto ?? ""),
      price: Number(it.precio ?? 0),
      image: normalizeImageUrl(it.imagen),
      description: it.descripcion ?? "",
    },
    quantity: Number(it.cantidad ?? 1),
  };
}

// Copia el carrito del usuario autenticado (backend) al carrito invitado (localStorage) al cerrar sesión.
// Luego limpia el carrito del backend para evitar duplicados cuando vuelva a iniciar sesión.
export async function migrateServerCartToGuestOnLogout(token: string): Promise<boolean> {
  const t = String(token || "").trim();
  if (!t) return false;

  const data = await fetchJsonWithToken<BackendCartResponse>("/cart", t, { method: "GET" });
  const backendItems = Array.isArray(data) ? data : data.items || data.cart || [];
  const mapped = (backendItems || []).map(mapBackendItem).filter(i => i.product.id && i.quantity > 0);
  if (mapped.length === 0) return false;

  const local = lsRead();
  const next: CartItem[] = [...local];

  for (const it of mapped) {
    const idx = next.findIndex(x => x.product.id === it.product.id);
    if (idx >= 0) {
      next[idx] = { ...next[idx], quantity: Number(next[idx].quantity ?? 0) + Number(it.quantity ?? 0) };
    } else {
      next.push(it);
    }
  }

  lsWrite(next);
  await fetchJsonWithToken<{ success?: boolean }>("/cart/clear", t, { method: "DELETE" });
  return true;
}

export async function loadCart(): Promise<CartItem[]> {
  const token = getToken();
  if (token) {
    try {
      // Si el usuario se autentica con items en carrito invitado, primero sincronizamos.
      await syncGuestCartToServer();
      const data = await api.get<BackendCartResponse>("/cart");
      const items = Array.isArray(data) ? data : data.items || data.cart || [];
      return (items || []).map(mapBackendItem).filter(i => i.product.id);
    } catch {
      // fallback a localStorage
    }
  }
  return lsRead();
}

export async function addToCart(
  product: { id: number; nombre: string; precio: number; imagen?: string; descripcion?: string },
  qty = 1,
): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await api.post<{ success?: boolean }>("/cart/add", { id_producto: product.id, cantidad: qty });
      return;
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      clearStaleAuthState();
    }
  }

  const cart = lsRead();
  const idx = cart.findIndex(i => i.product.id === product.id);
  const image = normalizeImageUrl(product.imagen);

  if (idx >= 0) {
    cart[idx] = { ...cart[idx], quantity: cart[idx].quantity + qty };
  } else {
    cart.push({
      product: {
        id: product.id,
        name: product.nombre,
        price: Number(product.precio ?? 0),
        image,
        description: product.descripcion || "",
      },
      quantity: qty,
    });
  }

  lsWrite(cart);
}

export async function setQuantity(productId: number, qty: number): Promise<void> {
  const token = getToken();
  const q = Math.max(0, Math.floor(qty));

  if (token) {
    try {
      await api.put<{ success?: boolean }>("/cart/update/0", { id_producto: productId, cantidad: q });
      return;
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      clearStaleAuthState();
    }
  }

  const cart = lsRead();
  const idx = cart.findIndex(i => i.product.id === productId);
  if (idx < 0) return;

  if (q <= 0) {
    cart.splice(idx, 1);
  } else {
    cart[idx] = { ...cart[idx], quantity: q };
  }

  lsWrite(cart);
}

export async function removeFromCart(productId: number): Promise<void> {
  await setQuantity(productId, 0);
}

export async function clearCart(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await api.del<{ success?: boolean }>("/cart/clear");
      return;
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      clearStaleAuthState();
    }
  }
  lsWrite([]);
}

export async function getCartCount(): Promise<number> {
  const token = getToken();
  if (token) {
    try {
      // Mantiene el contador consistente tras login (mismo criterio que loadCart).
      await syncGuestCartToServer();
      const res = await api.get<CartCountResponse>("/cart/count");
      if (typeof res === "number") return res;
      return Number(res.total ?? res.count ?? 0);
    } catch {
      // fallback localStorage
    }
  }
  const local = lsRead();
  return local.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
}
