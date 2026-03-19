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

let schemaValidatedAt = 0;
let schemaValidationCacheOk = false;

async function ensureDeliverySchema(pool) {
  const now = Date.now();
  const cacheWindowMs = 60_000;

  if (schemaValidationCacheOk && now - schemaValidatedAt < cacheWindowMs) {
    return;
  }

  const health = await deliveryRepository.getDeliverySchemaHealth(pool);
  if (!health.ok) {
    const detail = [...(health.missingColumns || []).map(v => `columna:${v}`), ...(health.missingTables || []).map(v => `tabla:${v}`)];
    throw createHttpError(
      503,
      "El módulo de delivery no está habilitado en esta base de datos. Ejecuta la migración 202603030001_delivery_v2.sql.",
      detail.join(", "),
    );
  }

  schemaValidationCacheOk = true;
  schemaValidatedAt = now;
}

async function listRiders() {
  const pool = await deliveryRepository.getPool();
  await ensureDeliverySchema(pool);
  return deliveryRepository.listRiders(pool);
}

async function listAssignableShipments({ search = "", limit = 100 }) {
  const pool = await deliveryRepository.getPool();
  await ensureDeliverySchema(pool);
  return deliveryRepository.listAssignableShipments(pool, { search, limit });
}

async function resolveMotorizadoForUser(pool, userId) {
  const normalizedUserId = Number(userId);
  const currentLink = await deliveryRepository.getMotorizadoByUserId(pool, normalizedUserId);
  if (currentLink) return currentLink;

  const riderUser = await deliveryRepository.getRiderUserById(pool, normalizedUserId);
  if (!riderUser) return null;
  if (toUpper(riderUser.rol) !== "REPARTIDOR") return null;
  if (toUpper(riderUser.estado || "ACTIVO") !== "ACTIVO") return null;

  const orphan = await deliveryRepository.findOrphanMotorizadoCandidate(pool, {
    nombre: riderUser.nombre,
    apellido: riderUser.apellido,
    telefono: riderUser.telefono || "",
  });
  if (!orphan?.id_motorizado) return null;

  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await deliveryRepository.relinkMotorizadoToUserTx(tx, {
      id_motorizado: orphan.id_motorizado,
      id_usuario: normalizedUserId,
    });
    await tx.query("COMMIT");
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }

  return deliveryRepository.getMotorizadoByUserId(pool, normalizedUserId);
}

async function listMyShipments({ userId, estado = "" }) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    throw createHttpError(401, "Usuario no autenticado");
  }

  const pool = await deliveryRepository.getPool();
  await ensureDeliverySchema(pool);
  const motorizado = await resolveMotorizadoForUser(pool, Number(userId));
  if (!motorizado) throw createHttpError(403, "Tu usuario no está vinculado a un motorizado");

  return deliveryRepository.listMyShipments(pool, { userId: Number(userId), estado });
}

async function getDeliveryDetail({ orderId }) {
  const idPedido = Number(orderId);
  if (!Number.isInteger(idPedido) || idPedido <= 0) {
    throw createHttpError(400, "orderId inválido");
  }

  const pool = await deliveryRepository.getPool();
  await ensureDeliverySchema(pool);
  const detail = await deliveryRepository.getDeliveryDetailByOrderId(pool, idPedido);
  if (!detail) throw createHttpError(404, "Pedido no encontrado");
  return detail;
}

async function assignShipment({ orderId, motorizadoId, assignedBy }) {
  const idPedido = Number(orderId);
  const idMotorizado = Number(motorizadoId);
  const idUsuario = Number(assignedBy);

  if (!Number.isInteger(idPedido) || idPedido <= 0) throw createHttpError(400, "orderId inválido");
  if (!Number.isInteger(idMotorizado) || idMotorizado <= 0) throw createHttpError(400, "motorizadoId inválido");

  const pool = await deliveryRepository.getPool();
  await ensureDeliverySchema(pool);
  const rider = await deliveryRepository.getRiderById(pool, idMotorizado);
  if (!rider) throw createHttpError(404, "Repartidor no encontrado");

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
  await ensureDeliverySchema(pool);
  const motorizado = await resolveMotorizadoForUser(pool, idUsuario);
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

  const pool = await deliveryRepository.getPool();
  await ensureDeliverySchema(pool);
  const motorizado = await resolveMotorizadoForUser(pool, idUsuario);
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
      userId: idUsuario,
    });

    await deliveryRepository.markDeliveredTx(tx, { orderId: idPedido });
    await orderRepository.updateOrderStateTx(tx, idPedido, "ENTREGADO");

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
  await ensureDeliverySchema(pool);
  const motorizado = await resolveMotorizadoForUser(pool, idUsuario);
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
  getDeliveryDetail,
  assignShipment,
  startRoute,
  markDelivered,
  markFailed,
};

export {};
