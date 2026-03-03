const deliveryRepository = require("../repositories/deliveryRepository");
const orderRepository = require("../repositories/orderRepository");

function createHttpError(status, message, detail = null) {
  const err = new Error(message);
  (err as any).status = status;
  if (detail) (err as any).detail = detail;
  return err;
}

function normalizeText(v, fallback = "") {
  const t = String(v == null ? "" : v).trim();
  return t || fallback;
}

function toUpper(v) {
  return String(v == null ? "" : v)
    .trim()
    .toUpperCase();
}

async function listRiders() {
  const pool = await deliveryRepository.getPool();
  return deliveryRepository.listRiders(pool);
}

async function listAssignableShipments({ search = "", limit = 100 }) {
  const pool = await deliveryRepository.getPool();
  return deliveryRepository.listAssignableShipments(pool, { search, limit });
}

async function listMyShipments({ userId, estado = "" }) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    throw createHttpError(401, "Usuario no autenticado");
  }

  const pool = await deliveryRepository.getPool();
  const motorizado = await deliveryRepository.getMotorizadoByUserId(pool, Number(userId));
  if (!motorizado) throw createHttpError(403, "Tu usuario no está vinculado a un motorizado");

  return deliveryRepository.listMyShipments(pool, { userId: Number(userId), estado });
}

async function assignShipment({ orderId, motorizadoId, assignedBy }) {
  const idPedido = Number(orderId);
  const idMotorizado = Number(motorizadoId);
  const idUsuario = Number(assignedBy);

  if (!Number.isInteger(idPedido) || idPedido <= 0) throw createHttpError(400, "orderId inválido");
  if (!Number.isInteger(idMotorizado) || idMotorizado <= 0) throw createHttpError(400, "motorizadoId inválido");

  const pool = await deliveryRepository.getPool();
  const tx = await pool.connect();

  try {
    await tx.query("BEGIN");

    const shipment = await deliveryRepository.getShipmentByOrderIdTx(tx, idPedido);
    if (!shipment) throw createHttpError(404, "Pedido no encontrado");
    if (!shipment.id_envio) throw createHttpError(409, "El pedido no tiene envío (solo aplica para domicilio)");

    if (toUpper(shipment.estado_pedido) === "PENDIENTE_PAGO") {
      throw createHttpError(409, "No se puede asignar un pedido sin pago confirmado");
    }

    if (toUpper(shipment.estado_pedido) !== "PREPARADO") {
      throw createHttpError(409, "Solo se pueden asignar pedidos en estado PREPARADO");
    }

    await deliveryRepository.assignShipmentTx(tx, {
      orderId: idPedido,
      motorizadoId: idMotorizado,
      assignedBy: Number.isFinite(idUsuario) ? idUsuario : null,
    });

    await deliveryRepository.insertDeliveryEventTx(tx, {
      idEnvio: shipment.id_envio,
      idPedido,
      tipoEvento: "ASIGNADO",
      detalle: `Pedido asignado al motorizado ${idMotorizado}`,
      payloadJson: JSON.stringify({ motorizadoId: idMotorizado }),
      userId: Number.isFinite(idUsuario) ? idUsuario : null,
    });

    await orderRepository.insertHistoryTx(tx, {
      descripcion: `Pedido asignado a motorizado #${idMotorizado}`,
      accion: "DELIVERY_ASIGNADO",
      id_pedido: idPedido,
      id_usuario: Number.isFinite(idUsuario) ? idUsuario : null,
    });

    await tx.query("COMMIT");
    return { ok: true, id_pedido: idPedido, id_motorizado: idMotorizado };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function startRoute({ orderId, userId }) {
  const idPedido = Number(orderId);
  const idUsuario = Number(userId);

  if (!Number.isInteger(idPedido) || idPedido <= 0) throw createHttpError(400, "orderId inválido");
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) throw createHttpError(401, "Usuario no autenticado");

  const pool = await deliveryRepository.getPool();
  const motorizado = await deliveryRepository.getMotorizadoByUserId(pool, idUsuario);
  if (!motorizado) throw createHttpError(403, "Tu usuario no está vinculado a un motorizado");

  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");

    const shipment = await deliveryRepository.getShipmentByOrderIdTx(tx, idPedido);
    if (!shipment || !shipment.id_envio) throw createHttpError(404, "Envío no encontrado");

    if (Number(shipment.id_motorizado || 0) !== Number(motorizado.id_motorizado)) {
      throw createHttpError(403, "No puedes iniciar ruta de un pedido no asignado a ti");
    }

    if (toUpper(shipment.estado_pedido) !== "PREPARADO") {
      throw createHttpError(409, "El pedido debe estar en PREPARADO para iniciar ruta");
    }

    await deliveryRepository.startRouteTx(tx, { orderId: idPedido });
    await orderRepository.updateOrderStateTx(tx, idPedido, "EN CAMINO");

    await deliveryRepository.insertDeliveryEventTx(tx, {
      idEnvio: shipment.id_envio,
      idPedido,
      tipoEvento: "EN_RUTA",
      detalle: "Repartidor inició ruta",
      payloadJson: null,
      userId: idUsuario,
    });

    await orderRepository.insertHistoryTx(tx, {
      descripcion: "PREPARADO -> EN CAMINO (delivery)",
      accion: "DELIVERY_EN_RUTA",
      id_pedido: idPedido,
      id_usuario: idUsuario,
    });

    await tx.query("COMMIT");
    return { ok: true, id_pedido: idPedido, estado: "EN CAMINO" };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function markDelivered({ orderId, userId, evidence }) {
  const idPedido = Number(orderId);
  const idUsuario = Number(userId);

  if (!Number.isInteger(idPedido) || idPedido <= 0) throw createHttpError(400, "orderId inválido");
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) throw createHttpError(401, "Usuario no autenticado");

  const nombreReceptor = normalizeText(evidence?.nombre_receptor || evidence?.nombreReceptor || "");
  if (!nombreReceptor) throw createHttpError(400, "nombre_receptor es obligatorio para marcar entregado");

  const dniReceptor = normalizeText(evidence?.dni_receptor || evidence?.dniReceptor || "");
  const observacion = normalizeText(evidence?.observacion || "");
  const fotoUrl = normalizeText(evidence?.foto_url || evidence?.fotoUrl || "");

  const latRaw = evidence?.lat;
  const lngRaw = evidence?.lng;
  const lat = latRaw == null || latRaw === "" ? null : Number(latRaw);
  const lng = lngRaw == null || lngRaw === "" ? null : Number(lngRaw);

  if (lat !== null && !Number.isFinite(lat)) throw createHttpError(400, "lat inválida");
  if (lng !== null && !Number.isFinite(lng)) throw createHttpError(400, "lng inválida");

  const pool = await deliveryRepository.getPool();
  const motorizado = await deliveryRepository.getMotorizadoByUserId(pool, idUsuario);
  if (!motorizado) throw createHttpError(403, "Tu usuario no está vinculado a un motorizado");

  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");

    const shipment = await deliveryRepository.getShipmentByOrderIdTx(tx, idPedido);
    if (!shipment || !shipment.id_envio) throw createHttpError(404, "Envío no encontrado");

    if (Number(shipment.id_motorizado || 0) !== Number(motorizado.id_motorizado)) {
      throw createHttpError(403, "No puedes cerrar un pedido no asignado a ti");
    }

    if (toUpper(shipment.estado_pedido) !== "EN CAMINO") {
      throw createHttpError(409, "El pedido debe estar EN CAMINO para marcar como entregado");
    }

    await deliveryRepository.insertDeliveryEvidenceTx(tx, {
      idEnvio: shipment.id_envio,
      idPedido,
      nombreReceptor,
      dniReceptor,
      observacion,
      fotoUrl,
      lat,
      lng,
      userId: idUsuario,
    });

    await deliveryRepository.markDeliveredTx(tx, { orderId: idPedido });
    await orderRepository.updateOrderStateTx(tx, idPedido, "ENTREGADO");

    await deliveryRepository.insertDeliveryEventTx(tx, {
      idEnvio: shipment.id_envio,
      idPedido,
      tipoEvento: "ENTREGADO",
      detalle: `Entrega confirmada por ${nombreReceptor}`,
      payloadJson: JSON.stringify({ nombreReceptor, dniReceptor: dniReceptor || null }),
      userId: idUsuario,
    });

    await orderRepository.insertHistoryTx(tx, {
      descripcion: "EN CAMINO -> ENTREGADO (delivery)",
      accion: "DELIVERY_ENTREGADO",
      id_pedido: idPedido,
      id_usuario: idUsuario,
    });

    await tx.query("COMMIT");
    return { ok: true, id_pedido: idPedido, estado: "ENTREGADO" };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function markFailed({ orderId, userId, motivo }) {
  const idPedido = Number(orderId);
  const idUsuario = Number(userId);
  const reason = normalizeText(motivo);

  if (!Number.isInteger(idPedido) || idPedido <= 0) throw createHttpError(400, "orderId inválido");
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) throw createHttpError(401, "Usuario no autenticado");
  if (!reason) throw createHttpError(400, "motivo es obligatorio");

  const pool = await deliveryRepository.getPool();
  const motorizado = await deliveryRepository.getMotorizadoByUserId(pool, idUsuario);
  if (!motorizado) throw createHttpError(403, "Tu usuario no está vinculado a un motorizado");

  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");

    const shipment = await deliveryRepository.getShipmentByOrderIdTx(tx, idPedido);
    if (!shipment || !shipment.id_envio) throw createHttpError(404, "Envío no encontrado");

    if (Number(shipment.id_motorizado || 0) !== Number(motorizado.id_motorizado)) {
      throw createHttpError(403, "No puedes reportar incidencia de un pedido no asignado a ti");
    }

    if (!["EN CAMINO", "PREPARADO"].includes(toUpper(shipment.estado_pedido))) {
      throw createHttpError(409, "El pedido no está en un estado válido para registrar incidencia");
    }

    await deliveryRepository.markFailedTx(tx, { orderId: idPedido, reason });
    await orderRepository.updateOrderStateTx(tx, idPedido, "PREPARADO");

    await deliveryRepository.insertDeliveryEventTx(tx, {
      idEnvio: shipment.id_envio,
      idPedido,
      tipoEvento: "NO_ENTREGADO",
      detalle: reason,
      payloadJson: null,
      userId: idUsuario,
    });

    await orderRepository.insertHistoryTx(tx, {
      descripcion: `Incidencia delivery: ${reason}`,
      accion: "DELIVERY_NO_ENTREGADO",
      id_pedido: idPedido,
      id_usuario: idUsuario,
    });

    await tx.query("COMMIT");
    return { ok: true, id_pedido: idPedido, estado: "PREPARADO", detalle: "Incidencia registrada" };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

module.exports = {
  listRiders,
  listAssignableShipments,
  listMyShipments,
  assignShipment,
  startRoute,
  markDelivered,
  markFailed,
};

export {};
