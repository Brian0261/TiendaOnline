// backend/controllers/orderController.js

const orderService = require("../services/orderService");
const { emitToUser } = require("../utils/sse");

/**
 * Listar pedidos (historial completo, filtrado, búsqueda) — ADMINISTRADOR
 */
exports.getOrders = async (req, res) => {
  try {
    const { search = "", estado = "", fechaInicio = "", fechaFin = "" } = req.query;
    const data = await orderService.getOrders({ search, estado, fechaInicio, fechaFin });
    res.json(data);
  } catch (err) {
    console.error("Error getOrders:", err);
    res.status(500).json({ message: "Error al obtener el historial de pedidos" });
  }
};

/**
 * Pedidos SOLO del usuario logueado (cliente)
 */
exports.getMyOrders = async (req, res) => {
  try {
    const id_usuario = req.user.id_usuario;
    const data = await orderService.getMyOrders(id_usuario);
    res.json(data);
  } catch (err) {
    console.error("Error getMyOrders:", err);
    res.status(500).json({ message: "Error al obtener tus compras" });
  }
};

/**
 * Exportar historial (Excel o PDF, aquí solo CSV para simplicidad)
 */
exports.exportOrders = async (req, res) => {
  try {
    req.query.limit = 1000; // Limite para evitar exceso
    const { search, estado, fechaInicio, fechaFin } = req.query;
    req.query.search = search || "";
    req.query.estado = estado || "";
    req.query.fechaInicio = fechaInicio || "";
    req.query.fechaFin = fechaFin || "";
    const { filename, csv } = await orderService.exportOrdersCsv({
      search: req.query.search,
      estado: req.query.estado,
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
    });
    res.header("Content-Type", "text/csv");
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    console.error("Error exportOrders:", err);
    res.status(500).json({ message: "Error al exportar el historial" });
  }
};

// === NUEVO: pedidos pendientes para EMPLEADO ===
exports.getPendingOrders = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, search = "" } = req.query;
    const data = await orderService.getPendingOrders({ fechaInicio, fechaFin, search });
    res.json(data);
  } catch (err) {
    console.error("Error getPendingOrders:", err);
    res.status(500).json({ message: "Error al obtener pedidos pendientes" });
  }
};

// GET /orders/:id – Detalle de un pedido (EMPLEADO o ADMIN)
exports.getOrderById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "ID inválido" });

    const data = await orderService.getOrderById(id);
    res.json(data);
  } catch (err) {
    console.error("getOrderById:", err);
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: "Error al obtener detalle" });
  }
};

// PATCH /orders/:id/prepare – Marcar un pedido como PREPARADO
exports.markOrderPrepared = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.id_usuario; // quien hizo el cambio

    if (!id) return res.status(400).json({ message: "ID inválido" });

    const data = await orderService.markOrderPrepared({ id, userId });
    res.json(data);
  } catch (err) {
    console.error("markOrderPrepared:", err);
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: "Error al actualizar pedido" });
  }
};

// PATCH /orders/prepare-bulk  – Acción masiva
exports.markOrdersPreparedBulk = async (req, res) => {
  try {
    const ids = req.body.ids || [];
    const userId = req.user.id_usuario;

    const data = await orderService.markOrdersPreparedBulk({ ids, userId });
    res.json(data);
  } catch (err) {
    console.error("markOrdersPreparedBulk:", err);
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: "Error en acción masiva" });
  }
};

// Lista de pedidos que pueden cambiar de estado (PREPARADO o EN CAMINO)
exports.getTransitionable = async (req, res) => {
  try {
    const data = await orderService.getTransitionable();
    res.json(data);
  } catch (err) {
    console.error("getTransitionable:", err);
    res.status(500).json({ message: "Error al listar pedidos transicionables" });
  }
};

// PATCH /orders/:id/transition
exports.transitionOrder = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { from, to } = req.body || {};
    const userId = req.user.id_usuario;

    const data = await orderService.transitionOrder({ id, from, to, userId });
    res.json(data);
  } catch (err) {
    console.error("transitionOrder:", err);
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: "Error al cambiar estado" });
  }
};

// GET /orders/status-log?limit=20
exports.getStatusLog = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || Number(req.query.limit) || 20, 1), 100);
    const idPedido = req.query.idPedido ? Number(req.query.idPedido) : null;
    const evento = String(req.query.evento || "").trim();
    const fechaInicio = String(req.query.fechaInicio || "").trim();
    const fechaFin = String(req.query.fechaFin || "").trim();

    const data = await orderService.getStatusLog({
      page,
      pageSize,
      idPedido,
      evento,
      fechaInicio,
      fechaFin,
    });
    res.json(data);
  } catch (err) {
    console.error("getStatusLog:", err);
    res.status(500).json({ message: "Error al obtener log" });
  }
};

// KPIs para panel de empleado
exports.getEmployeeKpis = async (req, res) => {
  try {
    const data = await orderService.getEmployeeKpis();
    res.json(data);
  } catch (err) {
    console.error("getEmployeeKpis:", err);
    res.status(500).json({ message: "Error al obtener KPIs" });
  }
};

// Exporta CSV de PEDIDOS PENDIENTES (empleado)
exports.exportPendingOrders = async (req, res) => {
  try {
    const { fechaInicio = "", fechaFin = "", search = "" } = req.query;
    const { filename, csv } = await orderService.exportPendingOrdersCsv({ fechaInicio, fechaFin, search });
    res.header("Content-Type", "text/csv");
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    console.error("exportPendingOrders:", err);
    res.status(500).json({ message: "Error al exportar pendientes" });
  }
};

// Exporta CSV del HISTORIAL DE ESTADOS (empleado)
exports.exportStatusLog = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 10000);
    const idPedido = req.query.idPedido ? Number(req.query.idPedido) : null;
    const evento = String(req.query.evento || "").trim();
    const fechaInicio = String(req.query.fechaInicio || "").trim();
    const fechaFin = String(req.query.fechaFin || "").trim();

    const { filename, csv } = await orderService.exportStatusLogCsv({
      limit,
      idPedido,
      evento,
      fechaInicio,
      fechaFin,
    });
    res.header("Content-Type", "text/csv");
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    console.error("exportStatusLog:", err);
    res.status(500).json({ message: "Error al exportar historial" });
  }
};

/**
 * POST /api/orders
 * Crea un pedido en estado PENDIENTE con los ítems actuales del CARRITO del usuario.
 * Body: { deliveryType, address, shippingCost, receiptType, receiptData, paymentMethodId }
 */
// === POST /api/orders  (crea pedido en estado PENDIENTE a partir del CARRITO) ===
exports.createDraftOrder = async (req, res) => {
  const requester = req.user || null;

  try {
    const { status, body } = await orderService.createDraftOrder(requester, req.body);
    return res.status(status).json(body);
  } catch (err) {
    console.error("createDraftOrder error:", err);
    if (err.status) return res.status(err.status).json({ message: err.message });
    return res.status(500).json({ message: "No se pudo crear el pedido" });
  }
};

// PATCH /orders/:id/cancel – Cancelar pedido no pagado (cliente)
exports.cancelDraftOrder = async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ message: "ID inválido" });

    const requester = req.user;
    const data = await orderService.cancelDraftOrder({ orderId, requester });
    return res.json(data);
  } catch (err) {
    console.error("cancelDraftOrder:", err);
    if (err?.status) return res.status(err.status).json({ message: err.message, detail: err.detail });
    return res.status(500).json({ message: "No se pudo cancelar el pedido" });
  }
};

// PATCH /orders/:id/refund – Reembolsar pedido (ADMIN)
exports.refundOrder = async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ message: "ID inválido" });

    const requester = req.user;
    const data = await orderService.refundOrder({ orderId, requester });
    return res.json(data);
  } catch (err) {
    console.error("refundOrder:", err);
    if (err?.status) return res.status(err.status).json({ message: err.message, detail: err.detail });
    return res.status(500).json({ message: "No se pudo reembolsar el pedido" });
  }
};

// === Finaliza pedido tras pago (mock/webhook)
// Deja el pedido en PENDIENTE y emite SSE al dueño del pedido
exports.finalizeOrderOnPayment = async (reqOrPayload, res) => {
  return orderService.finalizeOrderOnPayment(reqOrPayload, res, { emitToUser });
};

export {};
