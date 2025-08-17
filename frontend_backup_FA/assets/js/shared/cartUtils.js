/* ---------- contador (backend first, fallback localStorage) ---------- */
import { getToken, getCartCount } from "/assets/js/shared/api.js";

/**
 * Actualiza el badge del carrito.
 * - Si hay token: consulta /api/cart/count y muestra ese total.
 * - Si no hay token o falla la API: usa localStorage (shoppingCart).
 */
export async function updateCartCounter() {
  const badge = document.getElementById("cart-count") || document.getElementById("cart-counter");

  if (!badge) return;

  let total = 0;
  const token = getToken?.() || localStorage.getItem("token");

  if (token) {
    try {
      const res = await getCartCount(); // { total: N } o { count: N }
      total = Number(res?.total ?? res?.count ?? 0);
    } catch {
      // si falla backend, caemos a localStorage abajo
    }
  }

  if (!token || total === 0) {
    try {
      const local = JSON.parse(localStorage.getItem("shoppingCart") || "[]");
      total = local.reduce((s, i) => s + (i.quantity ?? i.cantidad ?? 1), 0);
    } catch {
      total = 0;
    }
  }

  badge.textContent = total;
}

/* Actualiza el contador al cargar los parciales y al cargar el DOM */
document.addEventListener("DOMContentLoaded", () => updateCartCounter());
window.addEventListener("partials:loaded", () => updateCartCounter());
/* Si en otros puntos de tu app disparas eventos cuando cambie el carrito,
   escucha también estos (son opcionales, pero útiles): */
window.addEventListener("cart:changed", () => updateCartCounter());
window.addEventListener("cart:updated", () => updateCartCounter());
