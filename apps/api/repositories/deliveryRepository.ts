const { poolPromise } = require("../config/db.config");

async function getMotorizadoByUserId(pool, userId) {
  const { rows } = await pool.query(
    `
      SELECT id_motorizado, nombre, apellido
      FROM motorizado
      WHERE id_usuario = $1
      LIMIT 1
    `,
    [userId],
  );
  return rows?.[0] || null;
}

async function listRiders(pool) {
  const { rows } = await pool.query(
    `
      SELECT
        m.id_motorizado,
        m.nombre,
        m.apellido,
        m.telefono,
        m.licencia,
        m.id_usuario,
        COALESCE(u.email, '') AS email_usuario
      FROM motorizado m
      LEFT JOIN usuario u ON u.id_usuario = m.id_usuario
      ORDER BY m.id_motorizado ASC
    `,
  );
  return rows || [];
}

async function listAssignableShipments(pool, { search = "", limit = 100 }) {
  const params = [];
  const filtros = [
    "pe.estado_pedido = 'PREPARADO'",
    "pe.costo_envio > 0",
    "(e.id_motorizado IS NULL OR e.estado_envio IN ('PENDIENTE', 'PENDIENTE_ASIGNACION', 'REPROGRAMADO'))",
  ];

  if (search && String(search).trim()) {
    const s = `%${String(search).trim()}%`;
    params.push(s);
    const p = `$${params.length}`;
    filtros.push(`(CAST(pe.id_pedido AS TEXT) ILIKE ${p} OR (c.nombre || ' ' || c.apellido) ILIKE ${p} OR pe.direccion_envio ILIKE ${p})`);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  params.push(safeLimit);

  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `
      SELECT
        pe.id_pedido,
        pe.fecha_creacion,
        pe.estado_pedido,
        pe.direccion_envio,
        pe.total_pedido,
        c.nombre || ' ' || c.apellido AS cliente,
        c.telefono,
        e.id_envio,
        e.estado_envio,
        e.id_motorizado
      FROM pedido pe
      INNER JOIN envio e ON e.id_pedido = pe.id_pedido
      INNER JOIN usuario c ON c.id_usuario = pe.id_usuario
      ${where}
      ORDER BY pe.fecha_creacion ASC, pe.id_pedido ASC
      LIMIT $${params.length}
    `,
    params,
  );

  return rows || [];
}

async function listMyShipments(pool, { userId, estado = "" }) {
  const rider = await getMotorizadoByUserId(pool, userId);
  if (!rider) return [];

  const params = [rider.id_motorizado];
  let estadoSql = "";
  if (estado && String(estado).trim()) {
    params.push(String(estado).trim().toUpperCase());
    estadoSql = ` AND e.estado_envio = $${params.length}`;
  }

  const { rows } = await pool.query(
    `
      SELECT
        pe.id_pedido,
        pe.fecha_creacion,
        pe.estado_pedido,
        pe.direccion_envio,
        pe.total_pedido,
        c.nombre || ' ' || c.apellido AS cliente,
        c.telefono,
        e.id_envio,
        e.estado_envio,
        e.fecha_asignacion,
        e.fecha_inicio_ruta,
        e.fecha_entrega,
        e.motivo_no_entrega
      FROM envio e
      INNER JOIN pedido pe ON pe.id_pedido = e.id_pedido
      INNER JOIN usuario c ON c.id_usuario = pe.id_usuario
      WHERE e.id_motorizado = $1
        AND pe.estado_pedido IN ('PREPARADO', 'EN CAMINO', 'ENTREGADO')
        ${estadoSql}
      ORDER BY
        CASE pe.estado_pedido WHEN 'EN CAMINO' THEN 0 WHEN 'PREPARADO' THEN 1 ELSE 2 END,
        pe.fecha_creacion ASC,
        pe.id_pedido ASC
    `,
    params,
  );

  return rows || [];
}

async function getShipmentByOrderIdTx(tx, orderId) {
  const { rows } = await tx.query(
    `
      SELECT
        pe.id_pedido,
        pe.estado_pedido,
        pe.costo_envio,
        e.id_envio,
        e.estado_envio,
        e.id_motorizado
      FROM pedido pe
      LEFT JOIN envio e ON e.id_pedido = pe.id_pedido
      WHERE pe.id_pedido = $1
      LIMIT 1
    `,
    [orderId],
  );
  return rows?.[0] || null;
}

async function assignShipmentTx(tx, { orderId, motorizadoId, assignedBy }) {
  await tx.query(
    `
      UPDATE envio
      SET id_motorizado = $2,
          asignado_por = $3,
          fecha_asignacion = NOW(),
          estado_envio = 'ASIGNADO'
      WHERE id_pedido = $1
    `,
    [orderId, motorizadoId, assignedBy],
  );
}

async function startRouteTx(tx, { orderId }) {
  await tx.query(
    `
      UPDATE envio
      SET estado_envio = 'EN_RUTA',
          fecha_inicio_ruta = COALESCE(fecha_inicio_ruta, NOW()),
          fecha_envio = COALESCE(fecha_envio, NOW())
      WHERE id_pedido = $1
    `,
    [orderId],
  );
}

async function markDeliveredTx(tx, { orderId }) {
  await tx.query(
    `
      UPDATE envio
      SET estado_envio = 'ENTREGADO',
          fecha_entrega = NOW(),
          motivo_no_entrega = NULL
      WHERE id_pedido = $1
    `,
    [orderId],
  );
}

async function markFailedTx(tx, { orderId, reason }) {
  await tx.query(
    `
      UPDATE envio
      SET estado_envio = 'NO_ENTREGADO',
          motivo_no_entrega = $2
      WHERE id_pedido = $1
    `,
    [orderId, reason],
  );
}

async function insertDeliveryEventTx(tx, { idEnvio, idPedido, tipoEvento, detalle, payloadJson, userId }) {
  await tx.query(
    `
      INSERT INTO delivery_event (id_envio, id_pedido, tipo_evento, detalle, payload_json, id_usuario)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [idEnvio, idPedido, tipoEvento, detalle || null, payloadJson || null, userId || null],
  );
}

async function insertDeliveryEvidenceTx(tx, { idEnvio, idPedido, nombreReceptor, dniReceptor, observacion, fotoUrl, lat, lng, userId }) {
  await tx.query(
    `
      INSERT INTO entrega_evidencia (
        id_envio,
        id_pedido,
        nombre_receptor,
        dni_receptor,
        observacion,
        foto_url,
        lat,
        lng,
        id_usuario
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [idEnvio, idPedido, nombreReceptor, dniReceptor || null, observacion || null, fotoUrl || null, lat ?? null, lng ?? null, userId || null],
  );
}

module.exports = {
  getPool: () => poolPromise,
  getMotorizadoByUserId,
  listRiders,
  listAssignableShipments,
  listMyShipments,
  getShipmentByOrderIdTx,
  assignShipmentTx,
  startRouteTx,
  markDeliveredTx,
  markFailedTx,
  insertDeliveryEventTx,
  insertDeliveryEvidenceTx,
};

export {};
