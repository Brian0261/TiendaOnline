// frontend/assets/js/shared/addToCart.js
import { getToken, getCart, addToCart as apiAddToCart, updateCartItem, removeFromCart } from "/assets/js/shared/api.js";

const LS_KEY = "shoppingCart";

/* ---------------- LocalStorage helpers ---------------- */
function lsRead() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}
function lsWrite(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}

/* ---------------- Normalización desde backend ---------------- */
function mapBackendItem(it) {
  return {
    product: {
      id: it.id_producto ?? it.product?.id ?? it.id,
      name: it.nombre_producto ?? it.product?.name ?? it.name,
      price: Number(it.precio ?? it.product?.price ?? it.price ?? 0),
      image: it.imagen ?? it.product?.image ?? it.image ?? "/assets/images/placeholder-product.png",
      description: it.descripcion ?? it.product?.description ?? it.description ?? "",
    },
    quantity: Number(it.cantidad ?? it.quantity ?? 1),
  };
}

/* ===================== API PÚBLICA ===================== */

/** Carga el carrito (backend si hay token; si no, localStorage) */
export async function loadCart() {
  const token = getToken?.() || localStorage.getItem("token");
  if (token) {
    try {
      const data = await getCart();
      const arr = Array.isArray(data) ? data : data?.items || data?.cart || [];
      return arr.map(mapBackendItem);
    } catch (e) {
      console.warn("[loadCart] backend falló, usando LS:", e);
    }
  }
  return lsRead();
}

/** Agrega un producto (qty por defecto 1) */
export async function addProductToCart(product, qty = 1) {
  const token = getToken?.() || localStorage.getItem("token");
  if (token) {
    await apiAddToCart({ id_producto: product.id, cantidad: qty });
    return;
  }
  const cart = lsRead();
  const idx = cart.findIndex(i => i.product.id === product.id);
  if (idx >= 0) cart[idx].quantity += qty;
  else cart.push({ product, quantity: qty });
  lsWrite(cart);
}

/** Cambia cantidad de un producto */
export async function updateProductQuantity(productId, qty) {
  const token = getToken?.() || localStorage.getItem("token");
  if (token) {
    await updateCartItem({ id_producto: Number(productId), cantidad: Number(qty) });
    return;
  }
  const cart = lsRead();
  const idx = cart.findIndex(i => String(i.product.id) === String(productId));
  if (idx >= 0) {
    cart[idx].quantity = Number(qty);
    if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    lsWrite(cart);
  }
}

/** Elimina un producto del carrito */
export async function removeProductFromCart(productId) {
  const token = getToken?.() || localStorage.getItem("token");
  if (token) {
    await removeFromCart(Number(productId));
    return;
  }
  const cart = lsRead();
  const next = cart.filter(i => String(i.product.id) !== String(productId));
  lsWrite(next);
}
