/******************************************************************
 *  Admin – gestión de productos + reporte de ventas (dashboard)
 ******************************************************************/
import {
  // Catálogo
  getCategories,
  getBrands,
  getProducts,
  getProductById as getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  activateProduct,
  hardDeleteProduct,
  // Reportes / Pedidos
  getSalesReport,
  getOrders,
  exportOrders,
  // ==== CRUD Categorías (admin) ====
  listCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../shared/api.js";
import showToast from "../shared/toast.js";
import { triggerCatalogRefresh } from "../shared/pubsub.js";

/* =====================  Constantes  ===================== */
const DEFAULT_PREVIEW = "/assets/images/agregar-producto.webp";
const PLACEHOLDER_IMG = "/assets/images/placeholder-product.png";

/* =====================  Refs DOM  ======================= */
let form, imgInp, imgPreview, removeBtn, modal, bsModal;
let selCategory, selBrand, selStatus, inpSearch;

/* ========= Modal de Confirmación ========= */
let confirmModal, confirmTitle, confirmBody, confirmBtn, confirmResolve;
function ensureConfirmModal() {
  if (document.getElementById("customConfirmModal")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `
<div class="modal fade" id="customConfirmModal" tabindex="-1" aria-labelledby="customConfirmTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content border-0">
      <div class="modal-header bg-danger text-white">
        <h5 class="modal-title" id="customConfirmTitle">Confirmar acción</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body" id="customConfirmBody"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" class="btn btn-danger" id="customConfirmBtn">Sí, continuar</button>
      </div>
    </div>
  </div>
</div>
    `
  );
  confirmModal = new bootstrap.Modal(document.getElementById("customConfirmModal"));
  confirmTitle = document.getElementById("customConfirmTitle");
  confirmBody = document.getElementById("customConfirmBody");
  confirmBtn = document.getElementById("customConfirmBtn");
}
function showConfirmModal({ title, message, btnLabel = "Sí, continuar", btnClass = "btn-danger" }) {
  ensureConfirmModal();
  confirmTitle.textContent = title;
  confirmBody.innerHTML = message;
  confirmBtn.textContent = btnLabel;
  confirmBtn.className = "btn " + btnClass;
  return new Promise(resolve => {
    confirmResolve = resolve;
    confirmBtn.onclick = () => {
      confirmModal.hide();
      resolve(true);
    };
    document.getElementById("customConfirmModal").addEventListener("hidden.bs.modal", () => resolve(false), { once: true });
    confirmModal.show();
  });
}

/* =====================  Estado  ========================= */
const productFilters = {
  status: "active", // active | inactive | all
  search: "", // texto buscador
};

/*********************  Bootstrap  *************************/
document.addEventListener("DOMContentLoaded", async () => {
  cacheRefs();
  await Promise.all([loadCategories(), loadBrands()]);
  await loadProducts();
  bindForm();
  bindModalReset();

  // Filtro estado
  selStatus.addEventListener("change", async e => {
    productFilters.status = e.target.value;
    await loadProducts();
  });

  // Buscador con debounce
  inpSearch?.addEventListener(
    "input",
    debounce(e => {
      productFilters.search = e.target.value.trim();
      loadProducts();
    }, 250)
  );

  // Sub-pestañas: cargar cuando se muestran
  document.getElementById("tab-listado-tab")?.addEventListener("shown.bs.tab", () => {
    // refresco rápido por si cambió algo
    loadProducts();
  });
  document.getElementById("tab-categorias-tab")?.addEventListener("shown.bs.tab", () => {
    loadCategoriesMgmt();
  });

  // =============== LÓGICA DE REPORTE DE VENTAS ===============
  setupReportEvents();

  // =============== AUTO-CARGA REPORTE MENSUAL AL ENTRAR ===============
  setupAutoLoadMonthlyReport();

  // =============== HISTORIAL DE PEDIDOS (ADMIN) ===============
  setupOrdersSection();

  // =============== CRUD CATEGORÍAS – Eventos ===============
  bindCategoryUI();
});

/* ==================  Helpers productos  ================== */
function cacheRefs() {
  form = document.getElementById("productForm");
  imgInp = document.getElementById("productImage");
  imgPreview = document.getElementById("productPreview");
  removeBtn = document.getElementById("removeImageBtn");
  modal = document.getElementById("modalProduct");
  bsModal = bootstrap.Modal.getOrCreateInstance(modal);
  selCategory = document.getElementById("productCategory");
  selBrand = document.getElementById("productBrand");
  selStatus = document.getElementById("statusFilter");
  inpSearch = document.getElementById("productSearch");
}

async function loadCategories() {
  const cats = await getCategories();
  selCategory.innerHTML = "<option value=''>— Elige —</option>" + cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
}
async function refreshProductCategoryOptions() {
  await loadCategories();
}
async function loadBrands() {
  const brands = await getBrands();
  selBrand.innerHTML = "<option value=''>— Elige —</option>" + brands.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
}
async function loadProducts() {
  const prods = await getProducts({ status: productFilters.status, search: productFilters.search });
  const tbody = document.querySelector("#productsTable tbody");
  tbody.innerHTML = "";
  prods.forEach(p => tbody.appendChild(renderRow(p)));
}

function renderRow(p) {
  const tr = document.createElement("tr");
  tr.dataset.id = p.id;
  const commonBtns = `
    <button class="btn btn-sm btn-outline-secondary btn-edit" title="Editar">
      <i class="bi bi-pencil"></i>
    </button>`;
  const activeBtns = `
    <button class="btn btn-sm btn-outline-secondary btn-del" title="Desactivar">
      <i class="bi bi-eye-slash"></i>
    </button>`;
  const inactiveBtns = `
    <button class="btn btn-sm btn-outline-success btn-activate" title="Activar">
      <i class="bi bi-check-circle"></i>
    </button>
    <button class="btn btn-sm btn-outline-danger btn-harddel" title="Eliminar">
      <i class="bi bi-trash-fill"></i>
    </button>`;
  tr.innerHTML = `
    <td><img src="${p.image}" width="48" onerror="this.src='${PLACEHOLDER_IMG}'"></td>
    <td>${p.name}</td>
    <td>${p.description ?? ""}</td>
    <td>S/ ${Number(p.price).toFixed(2)}</td>
    <td>${p.stock}</td>
    <td>${p.categoryName ?? "-"}</td>
    <td>${p.brandName ?? "-"}</td>
    <td class="text-center">
      ${commonBtns}
      ${p.active ? activeBtns : inactiveBtns}
    </td>
  `;
  tr.querySelector(".btn-edit").addEventListener("click", () => openEdit(p.id));
  if (p.active) {
    tr.querySelector(".btn-del").addEventListener("click", () => doSoftDelete(p.id, p.name));
  } else {
    tr.querySelector(".btn-activate").addEventListener("click", () => doActivate(p.id));
    tr.querySelector(".btn-harddel").addEventListener("click", () => doHardDelete(p.id, p.name));
  }
  return tr;
}

function bindForm() {
  imgInp.addEventListener("change", () => {
    if (!imgInp.files.length) resetPreview();
    else {
      imgPreview.src = URL.createObjectURL(imgInp.files[0]);
      removeBtn.classList.remove("d-none");
    }
  });
  removeBtn.addEventListener("click", resetPreview);

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }
    const fd = new FormData(form);
    const isEdit = Boolean(form.productId.value);
    try {
      if (isEdit) await updateProduct(form.productId.value, fd);
      else await createProduct(fd);
      showToast(isEdit ? "Producto actualizado" : "Producto creado", "success");
      bsModal.hide();
      await loadProducts();
      triggerCatalogRefresh();
    } catch (err) {
      showToast(err.message, "danger");
    }
  });

  function resetPreview() {
    imgInp.value = "";
    imgPreview.src = DEFAULT_PREVIEW;
    removeBtn.classList.add("d-none");
  }
}
function bindModalReset() {
  modal.addEventListener("hidden.bs.modal", () => {
    form.reset();
    form.classList.remove("was-validated");
    document.getElementById("modalProductLabel").textContent = "Registrar Producto";
    imgPreview.src = DEFAULT_PREVIEW;
    removeBtn.classList.add("d-none");
  });
}
async function openEdit(id) {
  const p = await getProduct(id);
  form.productId.value = p.id;
  form.productName.value = p.name;
  form.productPrice.value = p.price;
  form.productStock.value = p.stock ?? 0;
  selCategory.value = p.categoryId;
  selBrand.value = p.brandId;
  form.productDescription.value = p.description ?? "";
  imgPreview.src = p.image || DEFAULT_PREVIEW;
  removeBtn.classList.add("d-none");
  imgInp.value = "";
  document.getElementById("modalProductLabel").textContent = "Editar Producto";
  bsModal.show();
}
async function doSoftDelete(id, name) {
  const confirmed = await showConfirmModal({
    title: "Confirmar desactivación",
    message: `¿Seguro que deseas <b>desactivar</b> el producto <b>"${name}"</b>?<br><small class="text-danger">Seguirá visible en el panel de administración pero no en la tienda en línea.</small>`,
    btnLabel: "Sí, desactivar",
    btnClass: "btn-warning",
  });
  if (!confirmed) return;
  deleteProduct(id)
    .then(async () => {
      showToast("Producto desactivado", "success");
      await loadProducts();
      triggerCatalogRefresh();
    })
    .catch(err => showToast(err.message, "danger"));
}
async function doActivate(id) {
  const confirmed = await showConfirmModal({
    title: "Confirmar reactivación",
    message: `¿Seguro que deseas <b>activar</b> este producto?`,
    btnLabel: "Sí, activar",
    btnClass: "btn-success",
  });
  if (!confirmed) return;
  activateProduct(id)
    .then(async () => {
      showToast("Producto activado", "success");
      await loadProducts();
      triggerCatalogRefresh();
    })
    .catch(err => showToast(err.message, "danger"));
}
async function doHardDelete(id, name) {
  const confirmed = await showConfirmModal({
    title: "Eliminar definitivamente",
    message: `¿Eliminar <span class="text-danger"><b>PERMANENTEMENTE</b></span> el producto <b>"${name}"</b>?<br><small class="text-danger">Esta acción no se puede deshacer.</small>`,
    btnLabel: "Sí, eliminar definitivamente",
    btnClass: "btn-danger",
  });
  if (!confirmed) return;
  hardDeleteProduct(id)
    .then(async () => {
      showToast("Producto eliminado definitivamente", "success");
      await loadProducts();
      triggerCatalogRefresh();
    })
    .catch(err => showToast(err.message, "danger"));
}

/***************************************************************
 *  REPORTE DE VENTAS – DASHBOARD
 ***************************************************************/
let chartTopProductos, chartMetodosPago;

function setupReportEvents() {
  // Elementos
  const rango = document.getElementById("reporteRango");
  const fechaInicio = document.getElementById("reporteFechaInicio");
  const fechaFin = document.getElementById("reporteFechaFin");
  const btnGenerar = document.getElementById("btnGenerarReporte");
  const btnExportar = document.getElementById("btnExportarReporte");
  const feedback = document.getElementById("reporteFeedback");
  const kpis = document.getElementById("reporteKPIs");
  const graficos = document.getElementById("reporteGraficosYTablas");

  let ultimoReporte = null;

  btnGenerar.addEventListener("click", async () => {
    let f1, f2;
    const hoy = new Date();
    const pad = n => n.toString().padStart(2, "0");

    if (rango.value === "dia") {
      f1 = f2 = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
    }
    // ---- Cálculo lunes inicio de semana (ISO) ----
    else if (rango.value === "semana") {
      const hoyDay = hoy.getDay(); // 0 (domingo) - 6 (sábado)
      const offset = hoyDay === 0 ? 6 : hoyDay - 1; // lunes es 1
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - offset);

      f1 = `${lunes.getFullYear()}-${pad(lunes.getMonth() + 1)}-${pad(lunes.getDate())}`;
      f2 = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
    } else if (rango.value === "mes") {
      f1 = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-01`;
      f2 = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
    } else if (rango.value === "personalizado") {
      f1 = fechaInicio.value;
      f2 = fechaFin.value;
      if (!f1 || !f2) {
        showMsg("Selecciona las fechas de inicio y fin.", "warning");
        return;
      }
      if (f1 > f2) {
        showMsg("La fecha de inicio no puede ser posterior a la fecha fin.", "danger");
        return;
      }
    }

    btnGenerar.disabled = true;
    showMsg("Generando reporte...", "info");

    try {
      const data = await getSalesReport({ startDate: f1, endDate: f2 });
      console.log("DATA REPORTE:", data);
      ultimoReporte = { ...data, startDate: f1, endDate: f2 };

      if (data && typeof data.totalVentas !== "undefined") {
        if (Number(data.totalVentas) > 0) {
          btnExportar.disabled = false;
          try {
            renderKPIs(data);
            renderCharts(data);
          } catch (err) {
            console.error("Error en renderKPIs/renderCharts:", err);
            showMsg("Error interno al procesar el reporte. Consulta consola.", "danger");
            kpis.classList.add("d-none");
            graficos.style.display = "none";
            btnExportar.disabled = true;
            return;
          }
          kpis.classList.remove("d-none");
          graficos.style.display = "";
          feedback.innerHTML = "";
        } else {
          showMsg("No hay ventas registradas en el periodo seleccionado.", "warning");
          kpis.classList.add("d-none");
          graficos.style.display = "none";
          btnExportar.disabled = true;
        }
      } else {
        showMsg("No se pudo obtener el reporte (formato inválido).", "danger");
        kpis.classList.add("d-none");
        graficos.style.display = "none";
        btnExportar.disabled = true;
      }
    } catch (err) {
      console.error("ERROR FINAL:", err);
      showMsg("Ocurrió un error al generar el reporte.", "danger");
      kpis.classList.add("d-none");
      graficos.style.display = "none";
      btnExportar.disabled = true;
    }
    btnGenerar.disabled = false;
  });

  btnExportar.addEventListener("click", () => {
    if (!ultimoReporte) return;
    let csv = [
      `Reporte de Ventas,Bodega Luchito,Periodo,${ultimoReporte.startDate} a ${ultimoReporte.endDate}`,
      "",
      `Total Ventas (S/),${ultimoReporte.totalVentas}`,
      `Pedidos Completados,${ultimoReporte.pedidosCompletados}`,
      `Producto Más Vendido,${ultimoReporte.topProductos?.[0]?.nombre ?? "-"}`,
      `Método de Pago Más Usado,${ultimoReporte.topMetodosPago?.[0]?.nombre ?? "-"}`,
      "",
    ].join("\n");
    csv += "\nTop 5 Productos más vendidos:\nProducto,Cantidad\n";
    (ultimoReporte.topProductos || []).forEach(p => {
      csv += `"${p.nombre}",${p.cantidad}\n`;
    });
    csv += "\nMétodos de Pago Utilizados:\nMétodo,Cantidad\n";
    (ultimoReporte.topMetodosPago || []).forEach(m => {
      csv += `"${m.nombre}",${m.cantidad}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ReporteVentas-${ultimoReporte.startDate}_a_${ultimoReporte.endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    showToast("Exportado como Excel (.csv)", "success");
  });

  function showMsg(msg, type) {
    feedback.innerHTML = `<div class="alert alert-${type} mb-3">${msg}</div>`;
  }
}

function setupAutoLoadMonthlyReport() {
  document.addEventListener("show-sales-report-section", () => {
    const rango = document.getElementById("reporteRango");
    if (rango) rango.value = "mes";
    setTimeout(() => {
      const btnGenerar = document.getElementById("btnGenerarReporte");
      if (btnGenerar) btnGenerar.click();
    }, 100);
  });
}

function renderKPIs(data) {
  const elTotalVentas = document.getElementById("kpiTotalVentas");
  const elPedidosCompletados = document.getElementById("kpiPedidosCompletados");
  const elProductoTop = document.getElementById("kpiProductoTop");
  const elMetodoPagoTop = document.getElementById("kpiMetodoPagoTop");
  if (elTotalVentas) elTotalVentas.textContent = "S/ " + Number(data.totalVentas).toFixed(2);
  if (elPedidosCompletados) elPedidosCompletados.textContent = data.pedidosCompletados ?? 0;
  if (elProductoTop) elProductoTop.textContent = data.topProductos?.[0]?.nombre ?? "-";
  if (elMetodoPagoTop) elMetodoPagoTop.textContent = data.topMetodosPago?.[0]?.nombre ?? "-";
}

function renderCharts(data) {
  // Top productos
  const elChartProd = document.getElementById("chartTopProductos");
  if (!elChartProd) throw new Error("No se encontró el elemento chartTopProductos.");
  const ctxProd = elChartProd.getContext("2d");
  if (window.chartTopProductos && typeof window.chartTopProductos.destroy === "function") {
    window.chartTopProductos.destroy();
  }
  window.chartTopProductos = new Chart(ctxProd, {
    type: "bar",
    data: {
      labels: (data.topProductos || []).map(p => p.nombre),
      datasets: [
        {
          label: "Cantidad vendida",
          data: (data.topProductos || []).map(p => p.cantidad),
          backgroundColor: "rgba(220, 53, 69, 0.8)",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
    },
  });

  // Métodos de pago
  const elChartPago = document.getElementById("chartMetodosPago");
  if (!elChartPago) throw new Error("No se encontró el elemento chartMetodosPago.");
  const ctxPago = elChartPago.getContext("2d");
  if (window.chartMetodosPago && typeof window.chartMetodosPago.destroy === "function") {
    window.chartMetodosPago.destroy();
  }
  window.chartMetodosPago = new Chart(ctxPago, {
    type: "pie",
    data: {
      labels: (data.topMetodosPago || []).map(m => m.nombre),
      datasets: [
        {
          data: (data.topMetodosPago || []).map(m => m.cantidad),
          backgroundColor: ["rgba(52,58,64,0.85)", "rgba(220,53,69,0.85)", "rgba(255,193,7,0.85)", "rgba(25,135,84,0.85)"],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
    },
  });

  // Tablas pequeñas
  let tablaProd = "<table class='table table-sm'><thead><tr><th>Producto</th><th>Cantidad</th></tr></thead><tbody>";
  (data.topProductos || []).forEach(p => {
    tablaProd += `<tr><td>${p.nombre}</td><td>${p.cantidad}</td></tr>`;
  });
  tablaProd += "</tbody></table>";
  const elTablaProd = document.getElementById("tablaTopProductos");
  if (elTablaProd) elTablaProd.innerHTML = tablaProd;

  let tablaPago = "<table class='table table-sm'><thead><tr><th>Método</th><th>Cantidad</th></tr></thead><tbody>";
  (data.topMetodosPago || []).forEach(m => {
    tablaPago += `<tr><td>${m.nombre}</td><td>${m.cantidad}</td></tr>`;
  });
  tablaPago += "</tbody></table>";
  const elTablaPago = document.getElementById("tablaMetodosPago");
  if (elTablaPago) elTablaPago.innerHTML = tablaPago;
}

/**************************************************************
 *  HISTORIAL DE PEDIDOS – ADMIN
 **************************************************************/
function setupOrdersSection() {
  const stateFilter = document.getElementById("ordersStateFilter");
  const dateStart = document.getElementById("ordersDateStart");
  const dateEnd = document.getElementById("ordersDateEnd");
  const search = document.getElementById("ordersSearch");
  const filterBtn = document.getElementById("ordersFilterBtn");
  const exportBtn = document.getElementById("ordersExportBtn");
  const tableBody = document.querySelector("#ordersTable tbody");
  const feedback = document.getElementById("ordersFeedback");

  let lastQuery = {};

  // Función principal: cargar historial con filtros
  async function loadOrders({ estado = "", fechaInicio = "", fechaFin = "", search = "" } = {}) {
    feedback.innerHTML = `<div class="alert alert-info mb-2">Cargando...</div>`;
    try {
      const pedidos = await getOrders({ estado, fechaInicio, fechaFin, search });
      renderOrdersTable(pedidos);
      feedback.innerHTML = `<div class="alert alert-success mb-2">Se encontraron <b>${pedidos.length}</b> pedidos.</div>`;
      lastQuery = { estado, fechaInicio, fechaFin, search };
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert-danger mb-2">${err.message}</div>`;
      tableBody.innerHTML = "";
    }
  }

  function renderOrdersTable(pedidos) {
    tableBody.innerHTML = "";
    if (!pedidos.length) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No hay pedidos registrados.</td></tr>`;
      return;
    }
    pedidos.forEach(p => {
      const prods = p.productos
        .map(
          prod =>
            `<div><b>${prod.nombre}</b> <span class="badge bg-light text-dark">${prod.cantidad} x S/ ${Number(prod.precio_unitario_venta).toFixed(
              2
            )}</span></div>`
        )
        .join("");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.id_pedido}</td>
        <td>${(() => {
          const fechaStr = p.fecha_creacion.split("T")[0];
          const [yyyy, mm, dd] = fechaStr.split("-");
          return `${dd}/${mm}/${yyyy}`;
        })()}</td>
        <td>${p.cliente}</td>
        <td>${p.email}</td>
        <td>${prods}</td>
        <td>${p.estado_pedido}</td>
        <td>S/ ${Number(p.total_pedido).toFixed(2)}</td>
      `;

      tableBody.appendChild(tr);
    });
  }

  // Filtrar
  filterBtn.addEventListener("click", () => {
    loadOrders({
      estado: stateFilter.value,
      fechaInicio: dateStart.value,
      fechaFin: dateEnd.value,
      search: search.value.trim(),
    });
  });

  // Búsqueda rápida con Enter
  search.addEventListener("keyup", e => {
    if (e.key === "Enter") filterBtn.click();
  });

  // Exportar
  exportBtn.addEventListener("click", async () => {
    try {
      // Llama a exportOrders con los mismos filtros
      const url = await exportOrders(lastQuery, true);
      // Forzar descarga
      const a = document.createElement("a");
      a.href = url;
      a.download = "historial_pedidos.csv";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert-danger mb-2">${err.message}</div>`;
    }
  });

  // Carga inicial
  loadOrders();
}

/****************************************************************
 *  CATEGORÍAS – ADMIN (sub-pestaña dentro de Productos)
 ****************************************************************/
let _categories = [];
const catEls = {
  tableBody: () => document.querySelector("#categoriesTable tbody"),
  btnNew: () => document.getElementById("btn-new-category"),
  modalEl: () => document.getElementById("modalCategory"),
  form: () => document.getElementById("categoryForm"),
  id: () => document.getElementById("categoryId"),
  name: () => document.getElementById("categoryName"),
  alert: () => document.getElementById("categoryAlert"),
  title: () => document.querySelector("#modalCategory .modal-title"),
};
let catModal;

function bindCategoryUI() {
  const mEl = catEls.modalEl();
  if (mEl) catModal = bootstrap.Modal.getOrCreateInstance(mEl);

  // Nuevo
  catEls.btnNew()?.addEventListener("click", () => {
    catEls.title().textContent = "Nueva categoría";
    catEls.id().value = "";
    catEls.name().value = "";
    catEls.alert().innerHTML = "";
    catModal?.show();
  });

  // Acciones de fila (editar / eliminar)
  document.getElementById("categoriesTable")?.addEventListener("click", async e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    const cat = _categories.find(x => x.id === id);
    if (!cat) return;

    if (action === "edit") {
      catEls.title().textContent = "Editar categoría";
      catEls.id().value = String(cat.id);
      catEls.name().value = cat.nombre;
      catEls.alert().innerHTML = "";
      catModal?.show();
    }

    if (action === "del") {
      const confirmed = await showConfirmModal({
        title: "Eliminar categoría",
        message: '¿Eliminar esta categoría? <br><small class="text-danger">Si hay productos asociados, la operación puede fallar.</small>',
        btnLabel: "Sí, eliminar",
        btnClass: "btn-danger",
      });
      if (!confirmed) return;
      try {
        await deleteCategory(id);
        await loadCategoriesMgmt();
        await refreshProductCategoryOptions();
        showToast("Categoría eliminada", "success");
      } catch (err) {
        try {
          const msg = await err.json();
          showToast(msg?.message || "No se pudo eliminar la categoría", "danger");
        } catch {
          showToast("No se pudo eliminar la categoría", "danger");
        }
      }
    }
  });

  // Submit modal (crear/editar)
  catEls.form()?.addEventListener("submit", async e => {
    e.preventDefault();
    const id = catEls.id().value;
    const nombre = catEls.name().value.trim();
    const alertBox = catEls.alert();
    if (!nombre) {
      alertBox.innerHTML = `<div class="alert alert-warning py-2">Ingrese un nombre</div>`;
      return;
    }
    try {
      if (id) await updateCategory(Number(id), { nombre });
      else await createCategory({ nombre });
      catModal?.hide();
      await loadCategoriesMgmt();
      await refreshProductCategoryOptions();
      showToast(id ? "Categoría actualizada" : "Categoría creada", "success");
    } catch (err) {
      try {
        const msg = await err.json();
        alertBox.innerHTML = `<div class="alert alert-danger py-2">${msg?.message || "Error al guardar"}</div>`;
      } catch {
        alertBox.innerHTML = `<div class="alert alert-danger py-2">Error al guardar</div>`;
      }
    }
  });
}

async function loadCategoriesMgmt() {
  _categories = await listCategoriesAdmin();
  renderCategoriesTable(_categories);
}

function renderCategoriesTable(rows = []) {
  const tbody = catEls.tableBody();
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted fst-italic">Sin categorías</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${c.nombre}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-id="${c.id}">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" data-action="del" data-id="${c.id}">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `
    )
    .join("");
}

/* =====================  Utils  ===================== */
function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
