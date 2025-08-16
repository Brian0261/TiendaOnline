// frontend/assets/js/dashboard/employee.js
import {
  getPendingOrders,
  getOrder,
  prepareOrder,
  prepareOrdersBulk,
  getTransitionableOrders,
  transitionOrder,
  getStatusLog,
  getEmployeeKpis,
  getInventory,
  refreshUser,
  getUserInfo,
  createDispatch,
  getOutbound,
  exportOutbound,
  exportPendingOrders,
  exportStatusLogCsv,
  exportInventoryCsv,
} from "/assets/js/shared/api.js";
import showToast from "/assets/js/shared/toast.js";

if (document.documentElement.dataset.page === "employee-dashboard") {
  /* ─────────── Referencias a la UI ─────────── */
  const tbody = document.querySelector("#pending-orders-table tbody");
  const countEl = document.getElementById("count-pendientes");
  const btnRefresh = document.getElementById("btn-refresh-pendientes");

  const kpiPendientes = document.getElementById("kpi-pendientes");
  const kpiEncamino = document.getElementById("kpi-encamino");
  const kpiEntregadosHoy = document.getElementById("kpi-entregados-hoy");

  const inputFechaInicio = document.getElementById("f-pendiente-fecha-inicio");
  const inputFechaFin = document.getElementById("f-pendiente-fecha-fin");
  const inputBuscar = document.getElementById("f-pendiente-buscar");

  const btnFiltrar = document.getElementById("btn-filtrar-pendientes");
  const btnLimpiar = document.getElementById("btn-limpiar-pendientes");

  const modalDetalle = new bootstrap.Modal(document.getElementById("modalPedidoDetalle"));
  const detalleTitleId = document.getElementById("detalle-pedido-id");
  const detalleBody = document.getElementById("detalle-pedido-contenido");

  const chkAll = document.getElementById("chk-all-pendientes");
  const btnBulk = document.getElementById("btn-preparado-masivo");

  /* ───────────────────────── ESTADOS (tab) ───────────────────────── */
  const estadosTbody = document.querySelector("#orders-status-table tbody");
  const estadosCountEl = document.getElementById("count-estados");
  const btnRefreshEst = document.getElementById("btn-refresh-estados");

  // Modal de confirmación de cambio de estado (ya existe en tu HTML)
  const modalConfirm = new bootstrap.Modal(document.getElementById("modalConfirmEstado"));
  const mPedidoSpan = document.getElementById("confirm-estado-pedido");
  const mEstadoActualBad = document.getElementById("confirm-estado-actual");
  const mEstadoNuevoBad = document.getElementById("confirm-estado-nuevo");
  const btnConfirmCambio = document.getElementById("btn-confirmar-estado");

  const logTbody = document.querySelector("#orders-status-log-table tbody");
  const btnLogRef = document.getElementById("btn-refresh-historial");

  /* ───────────────────────── DESPACHO (tab) ───────────────────────── */
  const invTbody = document.querySelector("#inventory-table tbody");
  const btnRefreshInv = document.getElementById("btn-refresh-inventario");

  const txtResponsable = document.getElementById("despacho-responsable");
  const txtObs = document.getElementById("despacho-observacion");
  const resumenTbody = document.querySelector("#despacho-items-table tbody");
  const totalItemsSpan = document.getElementById("despacho-total-items");
  const btnClearResumen = document.getElementById("btn-limpiar-despacho");
  const btnConfirmarDesp = document.getElementById("btn-confirmar-despacho");

  /* ───────────────────────── SALIDAS (tab) ───────────────────────── */
  const salidasTbody = document.querySelector("#salidas-table tbody");
  const countSalidasEl = document.getElementById("count-salidas");
  const btnRefreshSalidas = document.getElementById("btn-refresh-salidas");

  const fSalIni = document.getElementById("f-salidas-fecha-inicio");
  const fSalFin = document.getElementById("f-salidas-fecha-fin");
  const fSalBuscar = document.getElementById("f-salidas-buscar");
  const btnFiltrarSal = document.getElementById("btn-filtrar-salidas");
  const btnLimpiarSal = document.getElementById("btn-limpiar-salidas");

  const btnRefreshAll = document.getElementById("btn-refresh-all");

  // Si quieres reutilizar el botón "Exportar" del sidebar:
  const btnExportGlobal = document.getElementById("btn-export-xlsx");

  // Estado local del resumen: Map<id_inventario, { id_inventario, nombre, cantidad, stock }>
  const dispatchMap = new Map();

  // ───── Persistir pestaña activa entre recargas (F5) ─────
  const ACTIVE_TAB_KEY = "employee.activeTab";

  /* ─────────── Modal de confirmación genérico (para "Preparado") ─────────── */
  const modalConfirmSimpleEl = document.getElementById("modalConfirmSimple");
  const modalConfirmSimple = modalConfirmSimpleEl ? new bootstrap.Modal(modalConfirmSimpleEl) : null;
  const confirmSimpleMsgEl = document.getElementById("confirmSimpleMsg");
  const btnConfirmSimple = document.getElementById("btnConfirmSimple");

  let onConfirmSimple = null;

  // Fallback para convertir HTML a texto plano si usamos window.confirm()
  function stripTags(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }

  function openConfirm(messageHTML, onConfirm) {
    // Si no existe el modal, hacer fallback a confirm()
    if (!modalConfirmSimple) {
      if (window.confirm(stripTags(messageHTML))) onConfirm?.();
      return;
    }
    confirmSimpleMsgEl.innerHTML = messageHTML;
    onConfirmSimple = onConfirm;

    // reset botón
    btnConfirmSimple.disabled = false;
    btnConfirmSimple.innerHTML = `<i class="fa-solid fa-check me-1"></i>Confirmar`;

    modalConfirmSimple.show();
  }

  btnConfirmSimple?.addEventListener("click", async () => {
    if (!onConfirmSimple) return;
    btnConfirmSimple.disabled = true;
    btnConfirmSimple.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
    try {
      await onConfirmSimple();
      modalConfirmSimple.hide();
    } catch (e) {
      console.error(e);
      // no cerramos para que el usuario pueda reintentar o cancelar
      btnConfirmSimple.disabled = false;
      btnConfirmSimple.innerHTML = `<i class="fa-solid fa-check me-1"></i>Confirmar`;
    }
  });

  async function loadEmployeeKpis() {
    try {
      const { pendientes, encamino, entregadosHoy } = await getEmployeeKpis();
      if (kpiPendientes) kpiPendientes.textContent = pendientes;
      if (kpiEncamino) kpiEncamino.textContent = encamino;
      if (kpiEntregadosHoy) kpiEntregadosHoy.textContent = entregadosHoy;
    } catch (err) {
      console.error(err);
      if (kpiPendientes && !kpiPendientes.textContent) kpiPendientes.textContent = "0";
      if (kpiEncamino && !kpiEncamino.textContent) kpiEncamino.textContent = "0";
      if (kpiEntregadosHoy && !kpiEntregadosHoy.textContent) kpiEntregadosHoy.textContent = "0";
    }
  }

  /* ─────────── Helpers ─────────── */

  // 🔸 Devuelve TRUE si al menos uno de los filtros tiene valor
  function hasActiveFilters() {
    return inputFechaInicio.value || inputFechaFin.value || inputBuscar.value;
  }

  // 🔸 Activa / desactiva el botón según haya algo que limpiar
  function toggleClearBtn() {
    btnLimpiar.disabled = !hasActiveFilters();
  }

  // 🔸 Vacía los campos de filtro
  function clearFilters() {
    inputFechaInicio.value = "";
    inputFechaFin.value = "";
    inputBuscar.value = "";
    toggleClearBtn();
  }

  function formatoFechaCorta(fechaStr) {
    if (!fechaStr) return "";
    const [yyyy, mm, dd] = fechaStr.split("-");
    return `${dd}/${mm}/${yyyy}`;
  }

  function renderDetalle(data) {
    detalleTitleId.textContent = `#${data.id_pedido}`;
    const rows = data.productos
      .map(
        p => `
        <tr>
          <td>${p.nombre}</td>
          <td class="text-end">${p.cantidad}</td>
          <td class="text-end">S/ ${p.precio.toFixed(2)}</td>
        </tr>`
      )
      .join("");
    detalleBody.innerHTML = `
      <p><strong>Cliente:</strong> ${data.cliente}</p>
      <p><strong>Dirección:</strong> ${data.direccion_envio}</p>
      <p><strong>Estado:</strong> ${data.estado_pedido}</p>
      <hr>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Producto</th>
              <th class="text-end">Cant.</th>
              <th class="text-end">Precio</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="text-end fw-semibold">Total: S/ ${data.total_pedido.toFixed(2)}</p>
    `;
  }

  function getSelectedIds() {
    return [...tbody.querySelectorAll("input[type=checkbox][data-id]:checked")].map(cb => Number(cb.dataset.id));
  }

  function updateBulkBtnState() {
    const sel = getSelectedIds().length;
    btnBulk.disabled = sel === 0;
    btnBulk.textContent = sel ? `Marcar Preparado (${sel})` : "Marcar Preparado";
  }

  // Mapea estado → badge
  function badgeEstado(estado) {
    const map = {
      PENDIENTE: "bg-warning text-dark",
      PREPARADO: "bg-info text-dark",
      "EN CAMINO": "bg-primary",
      ENTREGADO: "bg-success",
    };
    const cls = map[estado] || "bg-secondary";
    return `<span class="badge ${cls} state-badge">${estado}</span>`;
  }

  // Helper: siempre renderiza con la hora de Lima
  function formatDateTimeLima(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("es-PE", {
      timeZone: "America/Lima",
      dateStyle: "short",
      timeStyle: "medium",
      hour12: true,
    });
  }

  function updateResumenButtonsState() {
    const hasItems = dispatchMap.size > 0;
    btnClearResumen.disabled = !hasItems;
    btnConfirmarDesp.disabled = !hasItems;
  }

  function renderResumen() {
    resumenTbody.innerHTML = "";
    if (dispatchMap.size === 0) {
      resumenTbody.innerHTML = `
      <tr class="placeholder-row">
        <td colspan="3" class="text-muted fst-italic">(Sin items)</td>
      </tr>`;
    } else {
      for (const item of dispatchMap.values()) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
        <td>${item.nombre}</td>
        <td class="text-end">${item.cantidad}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" data-action="remove-item" data-id="${item.id_inventario}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      `;
        resumenTbody.appendChild(tr);
      }
    }
    totalItemsSpan.textContent = dispatchMap.size;
    updateResumenButtonsState();
  }

  function addToResumen({ id_inventario, nombre, stock }, qty) {
    const wanted = Math.max(1, Math.floor(qty || 0));
    if (!Number.isFinite(wanted)) return;

    const prev = dispatchMap.get(id_inventario);
    const currentQty = prev ? prev.cantidad : 0;
    const maxPermit = stock;
    const newQty = Math.min(currentQty + wanted, maxPermit);

    if (newQty <= 0) return;

    dispatchMap.set(id_inventario, { id_inventario, nombre, cantidad: newQty, stock });
    if (newQty < currentQty + wanted) {
      showToast("Aviso", "Se ajustó la cantidad al stock disponible.", "warning");
    }
    renderResumen();
  }

  function clearResumen() {
    dispatchMap.clear();
    txtObs.value = "";
    renderResumen();
  }

  // Cachea el "display name" en memoria para no pedirlo varias veces
  let __cachedDisplayName = null;

  function joinClean(...parts) {
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function resolveDisplayName(anyUserObj) {
    if (!anyUserObj) return "";

    const u = anyUserObj.user ?? anyUserObj;

    const nombre = u.nombre ?? u.nombres ?? u.firstName ?? u.given_name ?? u.name?.split(" ")?.[0];
    const apellido = u.apellido ?? u.apellidos ?? u.lastName ?? u.family_name ?? u.name?.split(" ")?.slice(1).join(" ");

    const armado = joinClean(nombre, apellido);
    if (armado) return armado;

    return (u.nombre_completo ?? u.fullname ?? u.name ?? "").toString().trim();
  }

  async function getDisplayNameOnce() {
    if (__cachedDisplayName) return __cachedDisplayName;

    let display = "Empleado";
    try {
      const me = await refreshUser(); // /auth/me
      const fromMe = resolveDisplayName(me);
      if (fromMe) display = fromMe;
      else {
        const payload = getUserInfo(); // payload del JWT
        const fromJwt = resolveDisplayName(payload);
        if (fromJwt) display = fromJwt;
      }
    } catch {
      const payload = getUserInfo();
      const fromJwt = resolveDisplayName(payload);
      if (fromJwt) display = fromJwt;
    }

    __cachedDisplayName = display;
    return display;
  }

  async function fillResponsable() {
    if (!txtResponsable) return;
    const display = await getDisplayNameOnce();
    txtResponsable.value = display || "Empleado";
  }

  function getSalidasFilters() {
    return {
      fechaInicio: fSalIni?.value || "",
      fechaFin: fSalFin?.value || "",
      search: (fSalBuscar?.value || "").trim(),
    };
  }
  function hasSalidasFilters() {
    return !!(fSalIni?.value || fSalFin?.value || fSalBuscar?.value);
  }
  function toggleClearBtnSal() {
    if (btnLimpiarSal) btnLimpiarSal.disabled = !hasSalidasFilters();
  }
  function clearSalidasFilters() {
    if (fSalIni) fSalIni.value = "";
    if (fSalFin) fSalFin.value = "";
    if (fSalBuscar) fSalBuscar.value = "";
    toggleClearBtnSal();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ─────────── Carga de pedidos ─────────── */
  async function loadPending(params = {}) {
    try {
      const data = await getPendingOrders(params);

      /* --- Render --- */
      tbody.innerHTML = "";
      if (!data.length) {
        tbody.innerHTML = `
          <tr class="placeholder-row">
            <td><input type="checkbox" disabled /></td>
            <td colspan="7" class="text-muted fst-italic">(Sin datos todavía)</td>
          </tr>`;
      } else {
        for (const p of data) {
          const productosTxt = p.productos.map(pr => `${pr.cantidad}× ${pr.nombre}`).join("<br>");
          const fechaLocal = formatoFechaCorta(p.fecha_creacion);

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><input type="checkbox" data-id="${p.id_pedido}"></td>
            <td>${p.id_pedido}</td>
            <td>${fechaLocal}</td>
            <td>${p.cliente}</td>
            <td>${productosTxt}</td>
            <td>${p.direccion_envio}</td>
            <td><span class="badge bg-warning text-dark state-badge">Pendiente</span></td>
            <td>
              <button class="btn btn-outline-success btn-sm" data-action="marcar-preparado" data-id="${p.id_pedido}">
                <i class="fa-solid fa-check"></i>
              </button>
              <button class="btn btn-outline-secondary btn-sm ms-1" data-action="ver-detalle" data-id="${p.id_pedido}">
                <i class="fa-solid fa-eye"></i>
              </button>
            </td>
          `;
          tbody.appendChild(tr);
        }
      }

      countEl.textContent = data.length;
      await loadEmployeeKpis();
      toggleClearBtn(); // por si los filtros están vacíos
    } catch (err) {
      console.error(err);
      showToast("Error", "No se pudieron cargar los pedidos pendientes.", "danger");
    }
    updateBulkBtnState();
  }

  // Cargar tabla de pedidos transicionables
  async function loadTransitionable() {
    try {
      const data = await getTransitionableOrders();

      estadosTbody.innerHTML = "";
      if (!data.length) {
        estadosTbody.innerHTML = `
          <tr class="placeholder-row">
            <td colspan="5" class="text-muted fst-italic">(Sin datos todavía)</td>
          </tr>`;
      } else {
        for (const o of data) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${o.id_pedido}</td>
            <td>${o.cliente}</td>
            <td>${badgeEstado(o.estado_actual)}</td>
            <td>${badgeEstado(o.siguiente_estado)}</td>
            <td>
              <button class="btn btn-sm btn-primary"
                data-action="open-transition"
                data-id="${o.id_pedido}"
                data-from="${o.estado_actual}"
                data-to="${o.siguiente_estado}">
                Cambiar
              </button>
            </td>
          `;
          estadosTbody.appendChild(tr);
        }
      }
      estadosCountEl.textContent = data.length;
    } catch (err) {
      console.error(err);
      showToast("Error", "No se pudo cargar la lista de estados.", "danger");
    }
  }

  async function loadStatusLog() {
    try {
      const data = await getStatusLog({ limit: 20 });
      logTbody.innerHTML = "";

      if (!data.length) {
        logTbody.innerHTML = `
          <tr class="placeholder-row">
            <td colspan="5" class="text-muted fst-italic">(Sin registros aún)</td>
          </tr>`;
        return;
      }

      for (const r of data) {
        const fecha = formatDateTimeLima(r.fecha_accion_utc);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${fecha}</td>
          <td>#${r.id_pedido}</td>
          <td>${r.anterior || "-"}</td>
          <td>${r.nuevo || "-"}</td>
          <td>${r.responsable}</td>
        `;
        logTbody.appendChild(tr);
      }
    } catch (err) {
      console.error(err);
      showToast("Error", "No se pudo cargar el log.", "danger");
    }
  }

  btnLogRef?.addEventListener("click", loadStatusLog);

  async function loadInventory(params = {}) {
    try {
      invTbody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="4" class="text-muted fst-italic">Cargando inventario...</td>
        </tr>`;

      const data = await getInventory(params);

      invTbody.innerHTML = "";
      if (!data.length) {
        invTbody.innerHTML = `
          <tr class="placeholder-row">
            <td colspan="4" class="text-muted fst-italic">(Inventario no cargado)</td>
          </tr>`;
        return;
      }

      for (const it of data) {
        const disabled = it.stock <= 0 ? "disabled" : "";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${it.nombre_producto}</td>
          <td class="text-end">${it.stock}</td>
          <td style="width:130px">
            <input type="number" class="form-control form-control-sm qty-input" min="1" max="${it.stock}" value="1" ${disabled}>
          </td>
          <td style="width:60px">
            <button class="btn btn-sm btn-outline-primary" data-action="add-item"
                    data-id="${it.id_inventario}"
                    data-name="${it.nombre_producto.replace(/"/g, "&quot;")}"
                    data-stock="${it.stock}" ${disabled}>
              <i class="fa-solid fa-plus"></i>
            </button>
          </td>
        `;
        invTbody.appendChild(tr);
      }
    } catch (err) {
      console.error(err);
      invTbody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="4" class="text-danger fst-italic">Error al cargar inventario</td>
        </tr>`;
    }
  }

  async function loadSalidas(params = {}) {
    try {
      salidasTbody.innerHTML = `
      <tr class="placeholder-row">
        <td colspan="5" class="text-muted fst-italic">Cargando...</td>
      </tr>`;

      const data = await getOutbound(params);

      salidasTbody.innerHTML = "";
      if (!data.length) {
        salidasTbody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="5" class="text-muted fst-italic">(Sin salidas)</td>
        </tr>`;
      } else {
        let total = 0;
        for (const r of data) {
          total += Number(r.cantidad) || 0;
          const fecha = formatDateTimeLima(r.fecha_salida_utc || r.fecha_salida);
          const tr = document.createElement("tr");
          tr.innerHTML = `
          <td>${fecha}</td>
          <td>${r.producto}</td>
          <td class="text-end">${r.cantidad}</td>
          <td>${r.motivo || "-"}</td>
          <td>${r.responsable || "-"}</td>
        `;
          salidasTbody.appendChild(tr);
        }
      }

      if (countSalidasEl) countSalidasEl.textContent = data.length;
    } catch (err) {
      console.error(err);
      salidasTbody.innerHTML = `
      <tr class="placeholder-row">
        <td colspan="5" class="text-danger fst-italic">Error al cargar salidas</td>
      </tr>`;
    }
  }

  btnFiltrarSal?.addEventListener("click", () => {
    loadSalidas(getSalidasFilters());
  });

  btnRefreshSalidas?.addEventListener("click", () => {
    loadSalidas(getSalidasFilters());
  });

  btnLimpiarSal?.addEventListener("click", () => {
    clearSalidasFilters();
    loadSalidas();
  });

  fSalBuscar?.addEventListener("keyup", e => {
    if (e.key === "Enter") btnFiltrarSal?.click();
  });

  [fSalIni, fSalFin, fSalBuscar].forEach(el => el && el.addEventListener("input", toggleClearBtnSal));

  btnExportGlobal?.addEventListener("click", async () => {
    const active = document.querySelector(".tab-pane.show.active")?.id;

    try {
      let blob,
        filename = "export.csv";

      switch (active) {
        case "tab-pendientes":
          blob = await exportPendingOrders({
            fechaInicio: inputFechaInicio?.value || "",
            fechaFin: inputFechaFin?.value || "",
            search: (inputBuscar?.value || "").trim(),
          });
          filename = "pendientes.csv";
          break;

        case "tab-estados":
          blob = await exportStatusLogCsv({ limit: 200 });
          filename = "historial_estados.csv";
          break;

        case "tab-despacho":
          blob = await exportInventoryCsv({
            search: document.getElementById("f-inventario-buscar")?.value || "",
            almacen: document.getElementById("f-inventario-almacen")?.value || "",
          });
          filename = "inventario.csv";
          break;

        case "tab-salidas":
          blob = await exportOutbound({
            fechaInicio: fSalIni?.value || "",
            fechaFin: fSalFin?.value || "",
            search: (fSalBuscar?.value || "").trim(),
          });
          filename = "salidas.csv";
          break;

        default:
          return showToast("Exportar", "Abre una pestaña para exportar.", "info");
      }

      downloadBlob(blob, filename);
    } catch (err) {
      console.error(err);
      showToast("Error", "No se pudo exportar los datos.", "danger");
    }
  });

  // Recargar inventario
  btnRefreshInv?.addEventListener("click", () => loadInventory());

  // Delegación: añadir item desde la tabla izquierda
  invTbody.addEventListener("click", e => {
    const btn = e.target.closest("[data-action='add-item']");
    if (!btn) return;

    const row = btn.closest("tr");
    const qtyInput = row.querySelector(".qty-input");
    const qty = Number(qtyInput?.value || 0);

    const id_inventario = Number(btn.dataset.id);
    const nombre = btn.dataset.name;
    const stock = Number(btn.dataset.stock);

    if (!qty || qty <= 0) {
      qtyInput?.classList.add("is-invalid");
      return;
    }
    qtyInput?.classList.remove("is-invalid");

    addToResumen({ id_inventario, nombre, stock }, qty);
  });

  // Atajo: Enter en el input de cantidad equivale a pulsar "+"
  invTbody.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const row = e.target.closest("tr");
    const btn = row?.querySelector("[data-action='add-item']");
    btn?.click();
  });

  // Quitar item del resumen
  resumenTbody.addEventListener("click", e => {
    const btn = e.target.closest("[data-action='remove-item']");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    dispatchMap.delete(id);
    renderResumen();
  });

  // Limpiar resumen
  btnClearResumen?.addEventListener("click", clearResumen);

  // Confirmar despacho (inventario → resumen)
  btnConfirmarDesp?.addEventListener("click", async e => {
    e.preventDefault();
    if (dispatchMap.size === 0) return;

    const items = [...dispatchMap.values()].map(it => ({
      id_inventario: it.id_inventario,
      cantidad: it.cantidad,
    }));

    for (const it of items) {
      if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) {
        showToast("Error", "Hay cantidades inválidas en el resumen.", "danger");
        return;
      }
    }

    const body = {
      observacion: (txtObs.value || "").trim(),
      items,
    };

    btnConfirmarDesp.disabled = true;
    const original = btnConfirmarDesp.innerHTML;
    btnConfirmarDesp.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Procesando...`;

    try {
      const res = await createDispatch(body);
      showToast("Éxito", res?.message || "Despacho registrado.", "success");
      clearResumen();
      await loadInventory();
      await loadEmployeeKpis?.();
    } catch (err) {
      console.error(err);
      const msg = err?.message || "No se pudo registrar el despacho.";
      showToast("Error", msg, "danger");
    } finally {
      btnConfirmarDesp.disabled = dispatchMap.size === 0;
      btnConfirmarDesp.innerHTML = original;
    }
  });

  /* ─────────── Filtros ─────────── */
  function getFilterValues() {
    return {
      fechaInicio: inputFechaInicio.value,
      fechaFin: inputFechaFin.value,
      search: inputBuscar.value.trim(),
    };
  }

  /* ─────────── Event listeners ─────────── */

  // Filtrar
  btnFiltrar.addEventListener("click", () => {
    loadPending(getFilterValues());
  });

  // Refrescar respetando filtros
  btnRefresh?.addEventListener("click", () => {
    loadPending(getFilterValues());
  });

  // Limpiar filtros + recargar
  btnLimpiar.addEventListener("click", () => {
    clearFilters();
    loadPending();
  });

  // Botón recargar (tab estados)
  btnRefreshEst?.addEventListener("click", loadTransitionable);

  inputBuscar.addEventListener("keyup", e => {
    if (e.key === "Enter") btnFiltrar.click();
  });

  [inputFechaInicio, inputFechaFin, inputBuscar].forEach(el => el.addEventListener("input", toggleClearBtn));

  /* ────────────────────────────────────────────────────────────────
   Delegación de eventos en la tabla de pendientes
   - 1) Ver detalle (👁️)
   - 2) Marcar preparado (✓) (UNA fila) → ahora con modal de confirmación
   ──────────────────────────────────────────────────────────────── */
  tbody.addEventListener("click", async e => {
    // Si el clic fue en un checkbox, solo actualizar el botón masivo
    const cb = e.target.closest("input[type=checkbox][data-id]");
    if (cb) {
      updateBulkBtnState();
      return;
    }

    /* =====  VER DETALLE  ======================================== */
    const viewBtn = e.target.closest("[data-action='ver-detalle']");
    if (viewBtn) {
      const id = viewBtn.dataset.id;
      try {
        detalleBody.textContent = "Cargando...";
        modalDetalle.show();
        const data = await getOrder(id);
        renderDetalle(data);
      } catch (err) {
        console.error(err);
        modalDetalle.hide();
        showToast("Error", "No se pudo cargar el detalle.", "danger");
      }
      return;
    }

    /* =====  MARCAR PREPARADO  (✓)  ================================= */
    const prepBtn = e.target.closest("[data-action='marcar-preparado']");
    if (prepBtn) {
      const id = prepBtn.dataset.id;

      openConfirm(`¿Marcar el pedido <strong>#${id}</strong> como <span class="badge bg-primary">Preparado</span>?`, async () => {
        // Spinner en el botón
        const originalHTML = prepBtn.innerHTML;
        prepBtn.disabled = true;
        prepBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
        try {
          await prepareOrder(id);
          showToast("Éxito", `Pedido #${id} preparado`, "success");
          await loadPending(getFilterValues());
        } catch (err) {
          console.error(err);
          showToast("Error", err.message, "danger");
        } finally {
          prepBtn.disabled = false;
          prepBtn.innerHTML = originalHTML;
        }
      });
    }
  });

  // Checkbox global (Seleccionar todos)
  chkAll.addEventListener("change", () => {
    const checked = chkAll.checked;
    tbody.querySelectorAll("input[type=checkbox][data-id]").forEach(cb => {
      cb.checked = checked;
    });
    updateBulkBtnState();
  });

  // Acción masiva: Marcar preparado
  btnBulk.addEventListener("click", async () => {
    const ids = getSelectedIds();
    if (!ids.length) return;

    openConfirm(`¿Marcar <strong>${ids.length}</strong> pedidos como <span class="badge bg-primary">Preparados</span>?`, async () => {
      btnBulk.disabled = true;
      const originalHTML = btnBulk.innerHTML;
      btnBulk.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
      try {
        const res = await prepareOrdersBulk(ids);
        showToast("Éxito", `${res.updated} pedidos preparados`, "success");
        chkAll.checked = false;
        await loadPending(getFilterValues());
      } catch (err) {
        console.error(err);
        showToast("Error", err.message, "danger");
      } finally {
        btnBulk.disabled = true; // se desactiva hasta nueva selección
        btnBulk.innerHTML = originalHTML;
        btnBulk.textContent = "Marcar Preparado";
      }
    });
  });

  /* ─────────── Cambios de estado (pestaña ESTADOS) ─────────── */
  estadosTbody.addEventListener("click", e => {
    const btn = e.target.closest("[data-action='open-transition']");
    if (!btn) return;

    const id = btn.dataset.id;
    const from = btn.dataset.from;
    const to = btn.dataset.to;

    mPedidoSpan.textContent = `#${id}`;
    mEstadoActualBad.textContent = from;
    mEstadoNuevoBad.textContent = to;

    btnConfirmCambio.dataset.id = id;
    btnConfirmCambio.dataset.from = from;
    btnConfirmCambio.dataset.to = to;

    modalConfirm.show();
  });

  btnConfirmCambio.addEventListener("click", async () => {
    const id = btnConfirmCambio.dataset.id;
    const from = btnConfirmCambio.dataset.from;
    const to = btnConfirmCambio.dataset.to;

    btnConfirmCambio.disabled = true;
    btnConfirmCambio.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

    try {
      await transitionOrder(id, { from, to });
      showToast("Éxito", `Pedido #${id}: ${from} → ${to}`, "success");

      modalConfirm.hide();
      await loadTransitionable();
      await loadStatusLog();
      await loadEmployeeKpis();
    } catch (err) {
      console.error(err);
      const msg = err.message || "Error al cambiar estado";
      showToast("Error", msg, "danger");
    } finally {
      btnConfirmCambio.disabled = false;
      btnConfirmCambio.innerHTML = `<i class="fa-solid fa-check me-1"></i>Confirmar`;
    }
  });

  function getTabTarget(el) {
    return el.getAttribute("data-bs-target") || el.getAttribute("href");
  }

  document.addEventListener("shown.bs.tab", async e => {
    const target = getTabTarget(e.target);
    if (!target) return;

    localStorage.setItem(ACTIVE_TAB_KEY, target);
    history.replaceState(null, "", target);

    try {
      switch (target) {
        case "#tab-pendientes":
          await loadPending(getFilterValues());
          break;
        case "#tab-estados":
          await loadTransitionable();
          await loadStatusLog();
          await loadEmployeeKpis();
          break;
        case "#tab-despacho":
          await loadInventory();
          renderResumen();
          await fillResponsable();
          break;
        case "#tab-salidas":
          await loadSalidas(getSalidasFilters());
          toggleClearBtnSal();
          break;
      }
    } catch (err) {
      console.error("Error al cargar tab", target, err);
    }
  });

  btnRefreshAll?.addEventListener("click", async () => {
    btnRefreshAll.disabled = true;
    const original = btnRefreshAll.innerHTML;
    btnRefreshAll.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Actualizando`;

    try {
      await loadEmployeeKpis();

      const active = document.querySelector(".tab-pane.show.active")?.id;

      switch (active) {
        case "tab-pendientes":
          await loadPending(getFilterValues());
          break;
        case "tab-estados":
          await loadTransitionable();
          await loadStatusLog();
          break;
        case "tab-despacho":
          await loadInventory();
          break;
        case "tab-salidas":
          await loadSalidas(getSalidasFilters());
          break;
        default:
          break;
      }
    } catch (e) {
      console.error(e);
      showToast("Error", "No se pudo actualizar.", "danger");
    } finally {
      btnRefreshAll.disabled = false;
      btnRefreshAll.innerHTML = original;
    }
  });

  /* === Restaurar pestaña activa al cargar === */
  (function restoreActiveTab() {
    const target = location.hash || localStorage.getItem(ACTIVE_TAB_KEY) || "#tab-pendientes";
    const link = document.querySelector(`[data-bs-toggle="pill"][data-bs-target="${target}"], [data-bs-toggle="pill"][href="${target}"]`);
    if (link) new bootstrap.Tab(link).show(); // dispara el loader unificado
    document.body.classList.remove("tab-booting");
  })();

  // Estados base
  btnLimpiar.disabled = true;

  // KPIs iniciales
  loadEmployeeKpis();

  // Cargar la pestaña visible al iniciar
  const activePaneId = document.querySelector(".tab-pane.show.active")?.id || "tab-pendientes";

  (async () => {
    try {
      if (activePaneId === "tab-pendientes") {
        await loadPending(getFilterValues());
      } else if (activePaneId === "tab-estados") {
        await loadTransitionable();
        await loadStatusLog();
        await loadEmployeeKpis();
      } else if (activePaneId === "tab-despacho") {
        await loadInventory();
        renderResumen();
        await fillResponsable();
      } else if (activePaneId === "tab-salidas") {
        await loadSalidas(getSalidasFilters());
        toggleClearBtnSal();
      }
    } catch (e) {
      console.error("Init tab error:", e);
    }
  })();
}
