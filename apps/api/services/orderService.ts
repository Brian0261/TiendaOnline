const { poolPromise } = require("../config/db.config");
const orderRepository = require("../repositories/orderRepository");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { JWT_SECRET } = require("../config/auth.config");

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function normalizeText(value, fallback = "") {
  const v = String(value == null ? "" : value).trim();
  return v || fallback;
}

function buildItemsFromGuestPayload(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const items = [];
  for (const it of rawItems) {
    const productId = Number(it?.id_producto ?? it?.idProducto ?? it?.productId ?? it?.id);
    const quantity = Number(it?.cantidad ?? it?.quantity ?? 0);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    items.push({ id_producto: productId, cantidad: Math.floor(quantity) });
  }
  return items;
}

function mergeItemQuantities(items) {
  const acc = new Map();
  for (const it of items) {
    const prev = acc.get(it.id_producto) || 0;
    acc.set(it.id_producto, prev + Number(it.cantidad || 0));
  }
  return Array.from(acc.entries()).map(([id_producto, cantidad]) => ({ id_producto, cantidad }));
}

function signGuestCheckoutToken(orderId) {
  return jwt.sign({ kind: "guest_checkout", orderId: Number(orderId) }, JWT_SECRET, { expiresIn: "30m" });
}

async function ensureGuestUserId(receiptData: any = {}) {
  const pool = await poolPromise;
  const name = normalizeText(receiptData?.nombre, "Cliente");
  const lastName = normalizeText(receiptData?.apellido, "Invitado");
  const random = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const email = `guest+${random}@minimarketexpress.local`;
  const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);

  const rs = await pool.query(
    `
      INSERT INTO usuario (nombre, apellido, email, contrasena, rol, email_verificado, email_verificado_en)
      VALUES ($1, $2, $3, $4, 'CLIENTE', TRUE, NOW())
      RETURNING id_usuario
    `,
    [name, lastName, email, passwordHash],
  );

  return Number(rs.rows?.[0]?.id_usuario || 0);
}

async function hydrateGuestItems(guestItems) {
  const merged = mergeItemQuantities(buildItemsFromGuestPayload(guestItems));
  if (!merged.length) return [];

  const ids = merged.map(it => it.id_producto);
  const pool = await poolPromise;
  const rs = await pool.query(
    `
      SELECT id_producto, nombre_producto, precio
      FROM producto
      WHERE id_producto = ANY($1) AND activo = TRUE
    `,
    [ids],
  );

  const byId = new Map<number, any>((rs.rows || []).map((r: any) => [Number(r.id_producto), r]));
  return merged
    .map(it => {
      const product = byId.get(Number(it.id_producto));
      if (!product) return null;
      return {
        id_producto: Number(product.id_producto),
        cantidad: Number(it.cantidad),
        precio: Number(product.precio || 0),
        nombre_producto: String(product.nombre_producto || ""),
      };
    })
    .filter(Boolean);
}

// Mapa de transiciones válidas
const ALLOWED_TRANSITIONS = {
  PREPARADO: "EN CAMINO",
  "EN CAMINO": "ENTREGADO",
};

function buildOrdersWithDetails(pedidos, detalles) {
  return pedidos.map(pedido => ({
    ...pedido,
    productos: detalles.filter(d => d.id_pedido === pedido.id_pedido),
  }));
}

async function getOrders({ search, estado, fechaInicio, fechaFin }) {
  const { pedidos, detalles } = await orderRepository.listOrdersAdmin({ search, estado, fechaInicio, fechaFin });
  return buildOrdersWithDetails(pedidos, detalles);
}

async function getMyOrders(userId) {
  const { pedidos, detalles } = await orderRepository.listOrdersByUser(userId);
  return buildOrdersWithDetails(pedidos, detalles);
}

async function exportOrdersCsv({ search, estado, fechaInicio, fechaFin }) {
  const { pedidos, detalles } = await orderRepository.listOrdersAdmin({ search, estado, fechaInicio, fechaFin });

  let csv =
    "ID Pedido,Fecha,Cliente,Email,Estado,Monto Total,Tipo Comprobante,Número Comprobante,Estado Comprobante,Producto,Cantidad,Precio Unitario\n";
  pedidos.forEach(p => {
    const productos = detalles.filter(d => d.id_pedido === p.id_pedido);
    productos.forEach(prod => {
      csv +=
        [
          p.id_pedido,
          new Date(p.fecha_creacion).toLocaleString("es-PE"),
          `"${p.cliente}"`,
          p.email,
          p.estado_pedido,
          p.total_pedido,
          p.tipo_comprobante || "",
          p.numero_comprobante || "",
          p.estado_comprobante || "",
          `"${prod.nombre}"`,
          prod.cantidad,
          prod.precio_unitario_venta,
        ].join(",") + "\n";
    });
    if (!productos.length) {
      csv +=
        [
          p.id_pedido,
          new Date(p.fecha_creacion).toLocaleString("es-PE"),
          `"${p.cliente}"`,
          p.email,
          p.estado_pedido,
          p.total_pedido,
          p.tipo_comprobante || "",
          p.numero_comprobante || "",
          p.estado_comprobante || "",
          "",
          "",
          "",
        ].join(",") + "\n";
    }
  });

  return { filename: "historial_pedidos.csv", csv };
}

async function getPendingOrders({ fechaInicio, fechaFin, search }) {
  const { pedidos, detalles } = await orderRepository.listPendingOrders({ fechaInicio, fechaFin, search });

  return pedidos.map(p => ({
    id_pedido: p.id_pedido,
    fecha_creacion: p.fecha_creacion.toISOString(),
    cliente: p.cliente,
    direccion_envio: p.direccion_envio,
    estado: p.estado_pedido,
    productos: detalles.filter(d => d.id_pedido === p.id_pedido).map(d => ({ cantidad: d.cantidad, nombre: d.nombre })),
  }));
}

async function getOrderById(id) {
  const header = await orderRepository.getOrderHeaderById(id);
  if (!header) {
    const err = new Error("Pedido no encontrado");
    (err as any).status = 404;
    throw err;
  }

  const productos = await orderRepository.getOrderItemsById(id);
  return { ...header, productos };
}

async function markOrderPrepared({ id, userId }) {
  const estadoActual = await orderRepository.getOrderStateById(id);
  if (!estadoActual) {
    const err = new Error("Pedido no encontrado");
    (err as any).status = 404;
    throw err;
  }
  if (estadoActual !== "PENDIENTE") {
    const err = new Error("El pedido no está pendiente");
    (err as any).status = 400;
    throw err;
  }

  await orderRepository.updateOrderState(id, "PREPARADO");
  await orderRepository.insertHistory({
    descripcion: "Pedido marcado como preparado",
    accion: "PREPARAR_PEDIDO",
    id_pedido: id,
    id_usuario: userId,
  });

  return { ok: true, message: "Pedido marcado como preparado" };
}

async function markOrdersPreparedBulk({ ids, userId }) {
  if (!Array.isArray(ids) || !ids.length) {
    const err = new Error("Lista de IDs vacía.");
    (err as any).status = 400;
    throw err;
  }

  const { updatedIds } = await orderRepository.markOrdersPreparedBulkTx({ ids, userId });
  return { updated: updatedIds.length };
}

async function getTransitionable() {
  return orderRepository.listTransitionableOrders();
}

async function transitionOrder({ id, from, to, userId }) {
  if (!id || !from || !to) {
    const err = new Error("Parámetros incompletos");
    (err as any).status = 400;
    throw err;
  }
  if (ALLOWED_TRANSITIONS[from] !== to) {
    const err = new Error("Transición no permitida");
    (err as any).status = 400;
    throw err;
  }

  const estadoActual = await orderRepository.getOrderStateById(id);
  if (!estadoActual) {
    const err = new Error("Pedido no encontrado");
    (err as any).status = 404;
    throw err;
  }
  if (estadoActual !== from) {
    const err = new Error(`El pedido ya está en "${estadoActual}". Refresca la lista.`);
    (err as any).status = 409;
    throw err;
  }

  await orderRepository.updateOrderState(id, to);
  await orderRepository.updateShippingOnTransition(id, to);
  await orderRepository.insertHistory({
    descripcion: `${from} -> ${to}`,
    accion: "TRANSICION_ESTADO",
    id_pedido: id,
    id_usuario: userId,
  });

  return { ok: true, id_pedido: id, from, to };
}

function parseStateChange(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^([^\-→⇒➡>]+?)\s*(?:→|->|⇒|➡|>)\s*([^\(]+?)(?:\s*\((.+)\))?$/);
  if (match) {
    return {
      anterior: match[1]?.trim() || null,
      nuevo: match[2]?.trim() || null,
      comentario: match[3]?.trim() || null,
    };
  }

  const parts = raw.split(/\s*(?:→|->|⇒|➡|>)+\s*/);
  if (parts.length >= 2) {
    return {
      anterior: parts[0]?.trim() || null,
      nuevo: parts[1]?.trim() || null,
      comentario: null,
    };
  }

  return {
    anterior: null,
    nuevo: null,
    comentario: raw || null,
  };
}

function getEventLabelByAction(action) {
  const key = String(action || "")
    .trim()
    .toUpperCase();
  if (key === "PREPARAR_PEDIDO") return "Pedido preparado";
  if (key === "TRANSICION_ESTADO") return "Cambio de estado";
  if (key === "DELIVERY_ASIGNADO") return "Delivery asignado";
  if (key === "DELIVERY_EN_RUTA") return "Inicio de ruta";
  if (key === "DELIVERY_ENTREGADO") return "Entrega completada";
  if (key === "DELIVERY_NO_ENTREGADO") return "Entrega no completada";
  if (key === "PICKUP_ENTREGADO") return "Entrega en tienda";
  return key || "Evento";
}

function getReadableDetailByAction(action, rawDetail) {
  const key = String(action || "")
    .trim()
    .toUpperCase();
  const detail = String(rawDetail || "").trim();

  if (detail) {
    if (key === "PREPARAR_PEDIDO") return detail || "Pedido marcado como preparado";
    if (key === "DELIVERY_ASIGNADO") return detail || "Repartidor asignado al pedido";
    if (key === "DELIVERY_EN_RUTA") return detail || "Pedido en ruta";
    if (key === "DELIVERY_ENTREGADO") return detail || "Entrega completada";
    if (key === "DELIVERY_NO_ENTREGADO") return detail || "Entrega no completada";
    if (key === "PICKUP_ENTREGADO") return detail || "Pedido entregado en tienda (recojo)";
    return detail;
  }

  if (key === "PREPARAR_PEDIDO") return "Pedido marcado como preparado";
  if (key === "DELIVERY_ASIGNADO") return "Repartidor asignado al pedido";
  if (key === "DELIVERY_EN_RUTA") return "Pedido en ruta";
  if (key === "DELIVERY_ENTREGADO") return "Entrega completada";
  if (key === "DELIVERY_NO_ENTREGADO") return "Entrega no completada";
  if (key === "PICKUP_ENTREGADO") return "Pedido entregado en tienda (recojo)";

  return "";
}

async function getStatusLog({ page = 1, pageSize = 20, idPedido = null, evento = "", fechaInicio = "", fechaFin = "" } = {}) {
  const currentPage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (currentPage - 1) * safePageSize;

  const { rows, total } = await orderRepository.listStatusLog({
    limit: safePageSize,
    offset,
    idPedido,
    evento,
    fechaInicio,
    fechaFin,
  });

  const mapped = rows.map(r => {
    const parsed = parseStateChange(r.cambio);
    const isTransition = !!(parsed.anterior && parsed.nuevo);
    return {
      fecha_accion_utc: r.fecha_iso_utc,
      id_pedido: r.id_pedido,
      responsable: r.responsable,
      evento: getEventLabelByAction(r.accion),
      accion: r.accion,
      detalle: isTransition ? parsed.comentario || "" : getReadableDetailByAction(r.accion, r.cambio),
      anterior: parsed.anterior,
      nuevo: parsed.nuevo,
    };
  });

  return {
    rows: mapped,
    total: Number(total) || 0,
    page: currentPage,
    pageSize: safePageSize,
    totalPages: Math.max(Math.ceil((Number(total) || 0) / safePageSize), 1),
  };
}

async function getEmployeeKpis() {
  return orderRepository.getEmployeeKpis();
}

async function exportPendingOrdersCsv({ fechaInicio = "", fechaFin = "", search = "" }) {
  const { pedidos, detalles } = await orderRepository.listPendingOrdersForExport({ fechaInicio, fechaFin, search });

  let csv = "ID Pedido,Fecha,Cliente,Dirección,Estado,Producto,Cantidad\n";
  for (const p of pedidos) {
    const prods = detalles.filter(d => d.id_pedido === p.id_pedido);
    if (prods.length) {
      for (const d of prods) {
        csv +=
          [
            p.id_pedido,
            new Date(p.fecha_creacion).toLocaleString("es-PE"),
            `"${p.cliente}"`,
            `"${p.direccion_envio || ""}"`,
            p.estado_pedido,
            `"${d.nombre}"`,
            d.cantidad,
          ].join(",") + "\n";
      }
    } else {
      csv +=
        [
          p.id_pedido,
          new Date(p.fecha_creacion).toLocaleString("es-PE"),
          `"${p.cliente}"`,
          `"${p.direccion_envio || ""}"`,
          p.estado_pedido,
          "",
          "",
        ].join(",") + "\n";
    }
  }

  return { filename: "pendientes.csv", csv };
}

async function exportStatusLogCsv({ limit = 5000, idPedido = null, evento = "", fechaInicio = "", fechaFin = "" } = {}) {
  const rows = await orderRepository.listStatusLogForExport({ limit, idPedido, evento, fechaInicio, fechaFin });

  const mapped = rows.map(r => {
    const parsed = parseStateChange(r.cambio);
    const detalle = parsed.anterior && parsed.nuevo ? `${parsed.anterior} -> ${parsed.nuevo}` : getReadableDetailByAction(r.accion, r.cambio);
    return {
      fecha: r.fecha_iso_utc,
      id_pedido: r.id_pedido,
      evento: getEventLabelByAction(r.accion),
      detalle,
      responsable: r.responsable,
    };
  });

  let csv = "Fecha UTC,Pedido,Evento,Detalle,Responsable\n";
  for (const r of mapped) {
    csv += [r.fecha, r.id_pedido, `\"${r.evento}\"`, `\"${r.detalle}\"`, `\"${r.responsable}\"`].join(",") + "\n";
  }

  return { filename: "historial_estados.csv", csv };
}

async function createDraftOrder(requester, body) {
  const {
    deliveryType = "RECOJO",
    address = "Recojo en tienda – Sede Central",
    shippingCost = 0,
    receiptType = "BOLETA",
    receiptData = {},
    paymentMethodId = 4,
  } = body || {};

  const requesterId = requester?.id_usuario ? Number(requester.id_usuario) : null;
  const requesterRole = String(requester?.rol || "")
    .trim()
    .toUpperCase();
  const isGuest = !requesterId;

  if (!isGuest && requesterRole !== "CLIENTE") {
    const err = new Error("Solo los clientes pueden realizar pedidos");
    (err as any).status = 403;
    throw err;
  }

  const effectiveUserId = isGuest ? await ensureGuestUserId(receiptData) : Number(requesterId);

  const items = isGuest ? await hydrateGuestItems(body?.items) : await orderRepository.getCartItemsForOrderDraft(effectiveUserId);
  if (!items.length) {
    const err = new Error("Tu carrito está vacío");
    (err as any).status = 400;
    throw err;
  }

  const subtotal = round2(items.reduce((s, it) => s + Number(it.precio) * Number(it.cantidad), 0));
  const costoEnvio = round2(Number(deliveryType === "DOMICILIO" ? shippingCost || 5 : 0));
  const total = round2(subtotal + costoEnvio);
  const direccionEnvio = deliveryType === "DOMICILIO" ? address : "Recojo en tienda – Sede Central";

  let effectivePaymentMethodId = Number(paymentMethodId || 0);
  if (deliveryType === "DOMICILIO") {
    const mercadoPagoMethodId = await orderRepository.getPaymentMethodIdByName("Mercado Pago");
    if (!mercadoPagoMethodId) {
      const err = new Error("Método de pago 'Mercado Pago' no está configurado");
      (err as any).status = 500;
      throw err;
    }
    effectivePaymentMethodId = mercadoPagoMethodId;
  }

  if (!Number.isInteger(effectivePaymentMethodId) || effectivePaymentMethodId <= 0) {
    const err = new Error("Método de pago inválido");
    (err as any).status = 400;
    throw err;
  }

  const { orderId } = await orderRepository.createDraftOrderTx({
    userId: effectiveUserId,
    total,
    costoEnvio,
    direccionEnvio,
    paymentMethodId: effectivePaymentMethodId,
    items,
  });

  return {
    status: 201,
    body: {
      orderId,
      subtotal: round2(subtotal),
      shipping: round2(costoEnvio),
      total: round2(total),
      receiptType,
      receiptData,
      paymentMethodId: effectivePaymentMethodId,
      checkoutToken: signGuestCheckoutToken(orderId),
    },
  };
}

async function cancelDraftOrder({ orderId, requester }) {
  const pool = await poolPromise;
  const tx = await pool.connect();

  try {
    await tx.query("BEGIN");

    const orderRow = await orderRepository.getOrderForFinalizeTx(tx, orderId);
    if (!orderRow) {
      const err = new Error("Pedido no encontrado");
      (err as any).status = 404;
      throw err;
    }

    const role = String(requester?.rol || "");
    const requesterId = requester?.id_usuario;
    if (role === "CLIENTE" && Number(orderRow.id_usuario) !== Number(requesterId)) {
      const err = new Error("No autorizado");
      (err as any).status = 403;
      throw err;
    }

    if (orderRow.estado_pedido !== "PENDIENTE_PAGO") {
      const err = new Error("Solo se puede cancelar un pedido en PENDIENTE_PAGO");
      (err as any).status = 409;
      throw err;
    }

    await orderRepository.updateOrderStateTx(tx, orderId, "CANCELADO");
    await orderRepository.releaseReservationTx(tx, { orderId });
    await orderRepository.insertHistoryTx(tx, {
      descripcion: "Pedido cancelado por el usuario",
      accion: "PEDIDO_CANCELADO",
      id_pedido: orderId,
      id_usuario: requesterId,
    });

    await tx.query("COMMIT");
    return { ok: true };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function refundOrder({ orderId, requester }) {
  const role = String(requester?.rol || "");
  if (role !== "ADMINISTRADOR") {
    const err = new Error("No autorizado");
    (err as any).status = 403;
    throw err;
  }

  const pool = await poolPromise;
  const tx = await pool.connect();

  try {
    await tx.query("BEGIN");

    const orderRow = await orderRepository.getOrderForFinalizeTx(tx, orderId);
    if (!orderRow) {
      const err = new Error("Pedido no encontrado");
      (err as any).status = 404;
      throw err;
    }

    if (["CANCELADO", "REEMBOLSADO"].includes(String(orderRow.estado_pedido))) {
      const err = new Error("El pedido ya fue cancelado o reembolsado");
      (err as any).status = 409;
      throw err;
    }

    if (orderRow.estado_pedido === "PENDIENTE_PAGO") {
      const err = new Error("No se puede reembolsar un pedido no pagado");
      (err as any).status = 409;
      throw err;
    }

    // Restock basado en movimientos registrados al pagar
    const salidas = await orderRepository.listPedidoInventarioMovByOrderTx(tx, { orderId, tipo: "SALIDA" });
    for (const m of salidas) {
      await orderRepository.incrementInventoryRowTx(tx, { idInventario: m.id_inventario, cantidad: m.cantidad });
      await orderRepository.insertEntradaInventarioTx(tx, {
        cantidad: m.cantidad,
        motivo: `REEMBOLSO_PEDIDO_${orderId}`.substring(0, 255),
        idInventario: m.id_inventario,
        idUsuario: requester.id_usuario,
      });
      await orderRepository.insertPedidoInventarioMovTx(tx, { orderId, idInventario: m.id_inventario, tipo: "ENTRADA", cantidad: m.cantidad });
    }

    await orderRepository.updateOrderStateTx(tx, orderId, "REEMBOLSADO");
    await orderRepository.insertHistoryTx(tx, {
      descripcion: "Pedido reembolsado",
      accion: "PEDIDO_REEMBOLSADO",
      id_pedido: orderId,
      id_usuario: requester.id_usuario,
    });

    await tx.query("COMMIT");
    return { ok: true, restockedItems: salidas.length };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function finalizeOrderOnPayment(reqOrPayload, res, { emitToUser } = {} as any) {
  const body = reqOrPayload?.body ? reqOrPayload.body : reqOrPayload;
  const { orderId, receiptType, receiptData, paymentMethodId } = body || {};

  if (!orderId || !paymentMethodId) {
    if (res) return res.status(400).json({ error: "Faltan datos para confirmar el pago" });
    throw new Error("Faltan datos para confirmar el pago");
  }

  const pool = await poolPromise;
  const tx = await pool.connect();

  let userIdForSse = null;
  let rolledBack = false;

  try {
    await tx.query("BEGIN");

    const orderRow = await orderRepository.getOrderForFinalizeTx(tx, orderId);
    if (!orderRow) throw new Error("Pedido no encontrado");
    userIdForSse = orderRow.id_usuario || null;

    if (orderRow.estado_pedido !== "PENDIENTE_PAGO") {
      const err = new Error("El pedido no está en estado PENDIENTE_PAGO");
      (err as any).status = 409;
      throw err;
    }

    const totalPedido = await orderRepository.getOrderDetailTotalTx(tx, orderId);
    const shippingCost = await orderRepository.getOrderShippingCostTx(tx, orderId);

    // Consume reserva y descuenta inventario antes de confirmar el pago
    try {
      await orderRepository.consumeReservationAndDecrementInventoryTx(tx, { orderId, userId: userIdForSse });
    } catch (e) {
      if (e?.code === "RESERVA_EXPIRADA") {
        await orderRepository.updateOrderStateTx(tx, orderId, "CANCELADO");
        await orderRepository.releaseReservationTx(tx, { orderId });
      }
      throw e;
    }

    // Si es envío (shippingCost > 0), garantizamos fila ENVIO para que transiciones funcionen.
    await orderRepository.ensureShippingCreatedTx(tx, { orderId, shippingCost });

    await orderRepository.updateOrderPaymentTx(tx, {
      orderId,
      paymentMethodId,
      nuevoEstado: "PENDIENTE",
    });

    const tipo = receiptType === "FACTURA" ? "FACTURA" : "BOLETA";
    const numeroComprobante = await orderRepository.getNextComprobanteNumberByCountTx(tx, tipo);

    const idComprobante = await orderRepository.insertComprobanteTx(tx, {
      tipo,
      numero: numeroComprobante,
      monto: totalPedido + shippingCost,
      orderId,
      paymentMethodId,
    });

    if (tipo === "BOLETA") {
      const { nombre, dni } = receiptData || {};
      await orderRepository.insertBoletaTx(tx, {
        idComprobante,
        nombre: nombre || "Cliente",
        dni: dni || "00000000",
      });
    } else {
      const { razon_social, ruc, direccion } = receiptData || {};
      await orderRepository.insertFacturaTx(tx, {
        idComprobante,
        // Modelo simple: sin impuesto adicional (placeholder para futura implementación de IGV/descuentos)
        montoBase: Math.max(totalPedido + shippingCost, 0),
        montoImpuesto: 0,
        razonSocial: razon_social || "Cliente",
        ruc: ruc || "00000000000",
        direccion: direccion || "",
      });
    }

    if (userIdForSse) {
      await orderRepository.clearCartByUserTx(tx, userIdForSse);
    } else {
      userIdForSse = await orderRepository.getOrderOwnerUserIdTx(tx, orderId);
      if (userIdForSse) {
        await orderRepository.clearCartByUserTx(tx, userIdForSse);
      }
    }

    await tx.query("COMMIT");

    try {
      if (emitToUser && userIdForSse) {
        emitToUser(Number(userIdForSse), "order-update", {
          id_pedido: orderId,
          estado_pedido: "PENDIENTE",
        });
      }
    } catch {}

    const payload = { orderId, idComprobante, numero: numeroComprobante };
    return res ? res.status(200).json({ ok: true, ...payload }) : payload;
  } catch (err) {
    if (!rolledBack) {
      try {
        await tx.query("ROLLBACK");
        rolledBack = true;
      } catch {}
    }
    console.error("finalizeOrderOnPayment error:", err);
    if (res) {
      if (err?.status) return res.status(err.status).json({ error: err.message, detail: err.detail });
      return res.status(500).json({ error: "No se pudo confirmar el pago" });
    }
    throw err;
  } finally {
    tx.release();
  }
}

module.exports = {
  getOrders,
  getMyOrders,
  exportOrdersCsv,
  getPendingOrders,
  getOrderById,
  markOrderPrepared,
  markOrdersPreparedBulk,
  getTransitionable,
  transitionOrder,
  getStatusLog,
  getEmployeeKpis,
  exportPendingOrdersCsv,
  exportStatusLogCsv,
  createDraftOrder,
  cancelDraftOrder,
  refundOrder,
  finalizeOrderOnPayment,
};

export {};
