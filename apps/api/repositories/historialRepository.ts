const { poolPromise } = require("../config/db.config");

async function insertHistorial({ descripcion, accion, id_usuario, id_pedido = null, id_reclamo = null }) {
  const pool = await poolPromise;
  await pool.query(
    `
      INSERT INTO historial (descripcion, accion, id_reclamo, id_pedido, id_usuario)
      VALUES ($1, $2, $3, $4, $5);
    `,
    [String(descripcion || ""), String(accion || ""), id_reclamo ?? null, id_pedido ?? null, id_usuario],
  );
}

async function listRecent({ limit = 50 }) {
  const pool = await poolPromise;
  const safeLimit = Math.min(Number(limit) || 50, 200);
  const rs = await pool.query(
    `
      SELECT
        h.id_historial,
        h.accion,
        h.descripcion,
        h.fecha_accion,
        h.id_pedido,
        h.id_reclamo,
        h.id_usuario,
        COALESCE(u.nombre || ' ' || u.apellido, u.email, '-') AS usuario
      FROM historial h
      LEFT JOIN usuario u ON u.id_usuario = h.id_usuario
      ORDER BY h.fecha_accion DESC, h.id_historial DESC
      LIMIT $1;
    `,
    [safeLimit],
  );
  return rs.rows || [];
}

module.exports = {
  insertHistorial,
  listRecent,
};

export {};
