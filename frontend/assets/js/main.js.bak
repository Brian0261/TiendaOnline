// frontend/assets/js/main.js
import { getToken, getCartCount, getUserInfo } from "./shared/api.js";
import { updateCartCounter } from "./shared/cartUtils.js";

/* ─────────────────────  Inicialización ─────────────────────
   ‣ Si el documento aún se está parseando (readyState = "loading"),
     esperamos a DOMContentLoaded.
   ‣ Si ya está listo ("interactive" o "complete"), ejecutamos de inmediato.
----------------------------------------------------------------*/
function init() {
  verificarSesion();
  actualizarContadorCarrito();
  configurarBuscador();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* ───────────────────────── 1. Verificar sesión ───────────────────────── */
function verificarSesion() {
  const token = getToken();
  let user = null;

  // Si tienes user guardado en localStorage, lo recuperas
  try {
    user = JSON.parse(localStorage.getItem("user"));
  } catch {
    user = null;
  }
  // Si no hay user, intenta decodificar el token (solo para mostrar el menú)
  if (!user && token) {
    try {
      const info = JSON.parse(atob(token.split(".")[1]));
      user = {
        nombre: info.nombre || "Usuario",
        apellido: info.apellido || "",
        rol: info.rol,
      };
    } catch {}
  }

  // Elementos del navbar
  const userMenu = document.getElementById("user-menu");
  const loginRegisterLinks = document.getElementById("login-register-links");
  const navUsername = document.getElementById("nav-username");
  const userAvatar = document.getElementById("user-avatar");

  // Lógica de mostrar/ocultar según sesión
  if (token && user && user.rol) {
    if (userMenu && navUsername && loginRegisterLinks && userAvatar) {
      userMenu.style.display = "block";
      loginRegisterLinks.classList.add("d-none"); // USAR d-none
      // Iniciales para el avatar
      const initials = `${user.nombre?.charAt(0) || ""}${user.apellido?.charAt(0) || ""}`.toUpperCase();
      userAvatar.textContent = initials || "U";
      navUsername.textContent = `${user.nombre?.split(" ")[0] || "Usuario"}`;
    }
  } else {
    if (userMenu) userMenu.style.display = "none";
    if (loginRegisterLinks) loginRegisterLinks.classList.remove("d-none"); // USAR d-none
  }

  // Vincular botones de menú de usuario
  const goAccount = document.getElementById("go-account");
  const goOrders = document.getElementById("go-orders");
  if (goAccount)
    goAccount.onclick = e => {
      e.preventDefault();
      window.location.href = "/dashboard/customer.html?tab=profile";
    };
  if (goOrders)
    goOrders.onclick = e => {
      e.preventDefault();
      window.location.href = "/dashboard/customer.html?tab=orders";
    };

  // Logout global
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    import("./shared/logout.js").then(module => module.default("#logout-btn"));
  }
}

/* ──────────────────────── 2. Redirección por rol ─────────────────────── */
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
      window.location.href = "/index.html";
  }
}

/* ──────────────────────── 3. Contador de carrito ─────────────────────── */
async function actualizarContadorCarrito() {
  /* 1️⃣ Valor inmediato desde localStorage (funciona sin login) */
  updateCartCounter();

  /* 2️⃣ Si hay token, intenta sincronizar con el backend */
  if (!getToken()) return; // invitado: lo anterior basta

  try {
    const { total } = await getCartCount(); // → { total: N }
    const span = document.getElementById("cart-count");
    if (span) span.textContent = total ?? "0";
  } catch (err) {
    console.warn("No se pudo actualizar contador desde servidor:", err);
  }
}

/* ─────────────────────────── 4. Buscador ─────────────────────────────── */
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

export { verificarSesion };
