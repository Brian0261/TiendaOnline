// frontend/assets/js/dashboard/customer.js

import { requireRole } from "/assets/js/shared/authGuard.js";
import { refreshUser, api, getToken } from "/assets/js/shared/api.js";
import showToast from "/assets/js/shared/toast.js";

// Solo CLIENTE
requireRole("CLIENTE");

// Tabs: ["profile", "orders"]
const params = new URLSearchParams(window.location.search);
const defaultTab = params.get("tab") || "profile";
let userData = null;
let es = null; // EventSource (SSE) instancia

document.addEventListener("DOMContentLoaded", async () => {
  // Referencias
  const tabProfile = document.getElementById("tab-profile");
  const tabOrders = document.getElementById("tab-orders");
  const sectionProfile = document.getElementById("section-profile");
  const sectionOrders = document.getElementById("section-orders");
  const userNameElem = document.getElementById("cliente-nombre");

  // Fetch user data
  try {
    const { user } = await refreshUser();
    userData = user;
    userNameElem.textContent = user.nombre.split(" ")[0];
    fillProfileForm(user);
  } catch {
    showToast("Error", "No se pudo cargar el usuario", "danger");
  }

  // Inicializa tabs
  function activateTab(tab) {
    if (tab === "orders") {
      tabOrders.classList.add("active");
      tabProfile.classList.remove("active");
      sectionOrders.style.display = "block";
      sectionProfile.style.display = "none";
      cargarMisCompras();
    } else {
      tabProfile.classList.add("active");
      tabOrders.classList.remove("active");
      sectionOrders.style.display = "none";
      sectionProfile.style.display = "block";
    }
  }

  // Manejadores de tabs
  tabProfile.onclick = e => {
    e.preventDefault();
    activateTab("profile");
    window.history.replaceState({}, "", "?tab=profile");
  };
  tabOrders.onclick = e => {
    e.preventDefault();
    activateTab("orders");
    window.history.replaceState({}, "", "?tab=orders");
  };

  // Activar el tab correcto al entrar
  activateTab(defaultTab);

  // Conectar al stream SSE para cambios en pedidos del usuario
  connectOrderStream();

  // ----- Editar datos personales -----
  const form = document.getElementById("profile-form");
  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      try {
        await api.put("/auth/me", data, true);
        showToast("Éxito", "Datos actualizados correctamente", "success");
        // Actualiza nombre mostrado
        if (data.nombre) userNameElem.textContent = data.nombre.split(" ")[0];
      } catch (err) {
        showToast("Error", err.message || "No se pudo actualizar", "danger");
      }
    };
  }
});

// Rellena el formulario con los datos actuales
function fillProfileForm(user) {
  document.getElementById("pf-nombre").value = user.nombre;
  document.getElementById("pf-apellido").value = user.apellido;
  document.getElementById("pf-email").value = user.email;
  document.getElementById("pf-telefono").value = user.telefono || "";
  document.getElementById("pf-direccion").value = user.direccion_principal || "";
}

// Trae compras del usuario
async function cargarMisCompras() {
  const ordersSection = document.getElementById("orders-list");
  ordersSection.innerHTML = '<div class="text-center my-3">Cargando...</div>';
  try {
    const orders = await api.get("/orders/my", true);
    if (!orders.length) {
      ordersSection.innerHTML = `
        <div class="alert alert-warning text-center">
          <b>¡Oh! Aún no tienes compras online.</b><br>
          <button class="btn btn-primary mt-2" onclick="window.location.href='/products/catalog.html'">Comprar</button>
        </div>
      `;
      return;
    }
    let html = `<div class="table-responsive"><table class="table table-hover align-middle">
      <thead><tr>
        <th># Pedido</th><th>Fecha</th><th>Estado</th><th>Total (S/)</th><th>Productos</th>
      </tr></thead><tbody>`;
    for (const o of orders) {
      html += `<tr>
        <td>${o.id_pedido}</td>
        <td>${new Date(o.fecha_creacion).toLocaleString("es-PE")}</td>
        <td>${o.estado_pedido}</td>
        <td>${o.total_pedido.toFixed(2)}</td>
        <td>${o.productos.map(p => `${p.nombre} x${p.cantidad}`).join("<br>")}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    ordersSection.innerHTML = html;
  } catch {
    ordersSection.innerHTML = `<div class="alert alert-danger">Error al cargar compras</div>`;
  }
}

/* ============================
   Tiempo real con SSE (cliente)
   ============================ */
function connectOrderStream() {
  const token = getToken?.();
  if (!token) return;

  // Cierra instancia previa si existe
  if (es) {
    try {
      es.close();
    } catch {}
    es = null;
  }

  es = new EventSource(`/api/orders/stream?token=${encodeURIComponent(token)}`);

  // Conexión establecida
  es.addEventListener("connected", () => {
    // console.debug("SSE conectado");
  });

  // Cuando el backend emite un cambio de pedido del usuario
  es.addEventListener("order-update", evt => {
    try {
      const data = JSON.parse(evt.data || "{}"); // { id_pedido, estado_pedido }
      const sectionOrders = document.getElementById("section-orders");
      // Si el tab "Mis compras" está visible, refrescamos la tabla
      if (sectionOrders && sectionOrders.style.display !== "none") {
        cargarMisCompras();
      } else {
        // Si no está visible, solo notificamos sutilmente
        showToast("Pedido actualizado", `#${data.id_pedido} → ${data.estado_pedido}`, "info");
      }
    } catch {
      // Ignorar parse errors
    }
  });

  // Reintentar si se cae
  es.onerror = () => {
    try {
      es.close();
    } catch {}
    es = null;
    setTimeout(connectOrderStream, 3000);
  };
}

// Vincula logout con modal para el botón del dashboard
import logoutHelper from "/assets/js/shared/logout.js";
logoutHelper("#logout-btn");
