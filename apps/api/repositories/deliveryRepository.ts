const { poolPromise } = require("../config/db.config");

let hasEstadoColumnCache = null;

async function hasUsuarioEstadoColumn(pool) {
  if (hasEstadoColumnCache !== null) return hasEstadoColumnCache;
  const conn = pool || (await poolPromise);
  const result = await conn.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'usuario'
          AND column_name = 'estado'
      ) AS has_estado
    `,
  );
  hasEstadoColumnCache = Boolean(result.rows?.[0]?.has_estado);
  return hasEstadoColumnCache;
}

async function getDeliverySchemaHealth(pool) {
  const requiredColumns = [
    { table: "motorizado", column: "id_usuario" },
    { table: "envio", column: "id_motorizado" },
    { table: "envio", column: "asignado_por" },
    { table: "envio", column: "fecha_asignacion" },
    { table: "envio", column: "fecha_inicio_ruta" },
    { table: "envio", column: "fecha_entrega" },
    { table: "envio", column: "motivo_no_entrega" },
  ];

  const requiredTables = ["entrega_evidencia"];

  const { rows: columnRows } = await pool.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'motorizado' AND column_name = 'id_usuario') OR
          (table_name = 'envio' AND column_name IN ('id_motorizado', 'asignado_por', 'fecha_asignacion', 'fecha_inicio_ruta', 'fecha_entrega', 'motivo_no_entrega'))
        )
    `,
  );

  const { rows: tableRows } = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [requiredTables],
  );

  const columnSet = new Set((columnRows || []).map(r => `${r.table_name}.${r.column_name}`));
  const tableSet = new Set((tableRows || []).map(r => r.table_name));

  const missingColumns = requiredColumns.filter(c => !columnSet.has(`${c.table}.${c.column}`)).map(c => `${c.table}.${c.column}`);

  const missingTables = requiredTables.filter(t => !tableSet.has(t));

  return {
    ok: missingColumns.length === 0 && missingTables.length === 0,
    missingColumns,
    missingTables,
  };
}

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

async function getRiderUserById(pool, userId) {
  const hasEstado = await hasUsuarioEstadoColumn(pool);
  const estadoSelect = hasEstado ? "estado" : "NULL::text AS estado";
  const { rows } = await pool.query(
    `
      SELECT id_usuario, nombre, apellido, telefono, rol, ${estadoSelect}
      FROM usuario
      WHERE id_usuario = $1
      LIMIT 1
    `,
    [userId],
  );
  return rows?.[0] || null;
}

async function findOrphanMotorizadoCandidate(poolOrTx, { nombre, apellido, telefono }) {
  const conn = poolOrTx || (await poolPromise);
  const { rows } = await conn.query(
    `
      SELECT id_motorizado, licencia
      FROM motorizado
      WHERE id_usuario IS NULL
        AND LOWER(TRIM(nombre)) = LOWER(TRIM($1))
        AND LOWER(TRIM(apellido)) = LOWER(TRIM($2))
        AND COALESCE(TRIM(telefono), '') = $3
      ORDER BY id_motorizado ASC
      LIMIT 1
    `,
    [nombre, apellido, String(telefono || "").trim()],
  );
  return rows?.[0] || null;
}

async function relinkMotorizadoToUserTx(tx, { id_motorizado, id_usuario }) {
  await tx.query(
    `
      UPDATE motorizado
      SET id_usuario = $1
      WHERE id_motorizado = $2
    `,
    [id_usuario, id_motorizado],
  );
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

async function getRiderById(pool, riderId) {
  const { rows } = await pool.query(
    `
      SELECT id_motorizado, nombre, apellido, id_usuario
      FROM motorizado
      WHERE id_motorizado = $1
      LIMIT 1
    `,
    [riderId],
  );
  return rows?.[0] || null;
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

async function getDeliveryDetailByOrderId(pool, orderId) {
  const { rows } = await pool.query(
    `
      SELECT
        pe.id_pedido,
        pe.estado_pedido,
        pe.direccion_envio,
        e.id_envio,
        e.estado_envio,
        e.fecha_asignacion,
        e.fecha_inicio_ruta,
        e.fecha_entrega,
        e.motivo_no_entrega,
        c.nombre || ' ' || c.apellido AS cliente,
        c.telefono AS cliente_telefono,
        m.id_motorizado,
        CASE WHEN m.id_motorizado IS NULL THEN NULL ELSE m.nombre || ' ' || m.apellido END AS repartidor,
        u.email AS repartidor_email,
        ev.nombre_receptor,
        ev.dni_receptor,
        ev.observacion,
        ev.created_at AS evidencia_fecha
      FROM pedido pe
      LEFT JOIN envio e ON e.id_pedido = pe.id_pedido
      LEFT JOIN usuario c ON c.id_usuario = pe.id_usuario
      LEFT JOIN motorizado m ON m.id_motorizado = e.id_motorizado
      LEFT JOIN usuario u ON u.id_usuario = m.id_usuario
      LEFT JOIN LATERAL (
        SELECT nombre_receptor, dni_receptor, observacion, created_at
        FROM entrega_evidencia ee
        WHERE ee.id_pedido = pe.id_pedido
        ORDER BY ee.created_at DESC, ee.id_entrega_evidencia DESC
        LIMIT 1
      ) ev ON TRUE
      WHERE pe.id_pedido = $1
      LIMIT 1
    `,
    [orderId],
  );

  return rows?.[0] || null;
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

async function insertDeliveryEvidenceTx(tx, { idEnvio, idPedido, nombreReceptor, dniReceptor, observacion, userId }) {
  await tx.query(
    `
      INSERT INTO entrega_evidencia (
        id_envio,
        id_pedido,
        nombre_receptor,
        dni_receptor,
        observacion,
        id_usuario
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [idEnvio, idPedido, nombreReceptor, dniReceptor || null, observacion || null, userId || null],
  );
}

module.exports = {
  getPool: () => poolPromise,
  getDeliverySchemaHealth,
  getMotorizadoByUserId,
  getRiderUserById,
  findOrphanMotorizadoCandidate,
  relinkMotorizadoToUserTx,
  listRiders,
  getRiderById,
  listAssignableShipments,
  listMyShipments,
  getDeliveryDetailByOrderId,
  getShipmentByOrderIdTx,
  assignShipmentTx,
  startRouteTx,
  markDeliveredTx,
  markFailedTx,
  insertDeliveryEvidenceTx,
};

export {};
