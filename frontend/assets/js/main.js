// frontend/assets/js/main.js
import { getToken, getCartCount } from "./shared/api.js";
import { updateCartCounter } from "./shared/cartUtils.js";

/* ─────────────────────  Inicialización ─────────────────────
   ‣ Si el documento aún se está parseando (readyState = "loading"),
     esperamos a DOMContentLoaded.
   ‣ Si ya está listo ("interactive" o "complete"), ejecutamos de inmediato.
----------------------------------------------------------------*/
function init() {
  verificarSesion(); // pinta navbar según sesión
  actualizarContadorCarrito(); // contador carrito (local + backend)
  configurarBuscador(); // submit del buscador
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* ───────────────────────── 1) Verificar sesión ───────────────────────── */
export async function verificarSesion() {
  const token = getToken();

  // 1) Intentar leer usuario guardado (preferir "auth_user")
  let user = null;
  try {
    const raw = localStorage.getItem("auth_user") || localStorage.getItem("user");
    user = raw ? JSON.parse(raw) : null;
  } catch {
    user = null;
  }

  // 2) Si no hay user pero sí token, intentar decodificar lo básico del token
  //    (OJO: el token no siempre trae nombre/apellido; el nombre visible vendrá de auth_user)
  if (!user && token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      user = { rol: payload?.rol, nombre: "Usuario", apellido: "" };
    } catch {}
  }

  // 3) Elementos del navbar (usar selectores robustos)
  const userMenu = document.getElementById("user-menu") || document.querySelector("[data-user-menu]");
  const loginRegisterLinks = document.getElementById("login-register-links") || document.querySelector("[data-login-links]");
  const navUsername = document.getElementById("nav-username") || document.querySelector("[data-username]");
  const userAvatar = document.getElementById("user-avatar") || document.querySelector("[data-user-avatar]");

  // 4) Pintar UI
  const hasSession = Boolean(token && user && user.rol);
  if (hasSession) {
    if (userMenu) userMenu.style.display = "block";
    if (loginRegisterLinks) loginRegisterLinks.classList.add("d-none");

    // Iniciales para el avatar
    const initials = `${user?.nombre?.charAt(0) || ""}${user?.apellido?.charAt(0) || ""}`.toUpperCase();
    if (userAvatar) userAvatar.textContent = initials || "U";

    // Mostrar nombre corto (primera palabra del nombre)
    if (navUsername) {
      const shortName = (user?.nombre || "Usuario").toString().trim().split(/\s+/)[0] || "Usuario";
      navUsername.textContent = shortName;
    }
  } else {
    if (userMenu) userMenu.style.display = "none";
    if (loginRegisterLinks) loginRegisterLinks.classList.remove("d-none");
  }

  // 5) Vincular acciones del menú usuario
  const goAccount = document.getElementById("go-account");
  const goOrders = document.getElementById("go-orders");
  if (goAccount) {
    goAccount.onclick = e => {
      e.preventDefault();
      window.location.href = "/dashboard/customer.html?tab=profile";
    };
  }
  if (goOrders) {
    goOrders.onclick = e => {
      e.preventDefault();
      window.location.href = "/dashboard/customer.html?tab=orders";
    };
  }

  // 6) Inicializar logout (modal + borrado de sesión)
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    import("./shared/logout.js").then(m => m.default("#logout-btn"));
  }
}

/* ──────────────────────── 2) Redirección por rol ─────────────────────── */
function redirigirDashboard(rol) {
  switch (rol) {
    case "CLIENTE":
      window.location.href = "/dashboard/customer.html";
      break;
    case "ADMINISTRADOR":
      window.location.href = "/dashboard/admin.html";
      break;
    case "EMPLEADO":
      window.location.href = "/dashboard/employee.html";
      break;
    default:
      window.location.href = "/"; // más seguro que /index.html
  }
}

/* ──────────────────────── 3) Contador de carrito ─────────────────────── */
async function actualizarContadorCarrito() {
  // 1️⃣ Valor inmediato desde localStorage (funciona sin login)
  updateCartCounter();

  // 2️⃣ Si hay token, intenta sincronizar con el backend
  if (!getToken()) return; // invitado: lo anterior basta

  try {
    const { total } = await getCartCount(); // → { total: N }
    const span = document.getElementById("cart-count");
    if (span) span.textContent = total ?? "0";
  } catch (err) {
    console.warn("No se pudo actualizar contador desde servidor:", err);
  }
}

/* ─────────────────────────── 4) Buscador ─────────────────────────────── */
function configurarBuscador() {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  if (!form || !input) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) {
      window.location.href = `/products/catalog.html?search=${encodeURIComponent(query)}`;
    }
  });
}

/* ─────────── 5) Eventos que evitan el F5 para refrescar el navbar ─────── */
// a) Cuando los parciales (navbar/footer/modal) terminan de cargarse
window.addEventListener("partials:loaded", () => {
  // Re-pintar porque los elementos del navbar ya existen en el DOM
  verificarSesion();
});

// b) Cuando el login se completa (evento que debe disparar login.js)
window.addEventListener("auth:login", () => {
  verificarSesion();
  actualizarContadorCarrito();
});

// c) Si cambian token/usuario desde otra pestaña
window.addEventListener("storage", e => {
  if (e.key === "token" || e.key === "auth_user" || e.key === "user") {
    verificarSesion();
    actualizarContadorCarrito();
  }
});

// d) Al volver el foco a la pestaña (defensivo)
window.addEventListener("focus", () => {
  verificarSesion();
});

export { redirigirDashboard };
