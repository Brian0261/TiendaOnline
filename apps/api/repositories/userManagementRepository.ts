const { poolPromise } = require("../config/db.config");

function normalizeRoleForFilter(rol) {
  const value = String(rol || "")
    .trim()
    .toUpperCase();
  if (["CLIENTE", "EMPLEADO", "REPARTIDOR"].includes(value)) return value;
  return "";
}

function normalizeStateForFilter(estado) {
  const value = String(estado || "")
    .trim()
    .toUpperCase();
  if (["ACTIVO", "INACTIVO"].includes(value)) return value;
  return "";
}

async function listUsersPaginated({ page = 1, pageSize = 20, rol = "", estado = "", search = "" } = {}) {
  const pool = await poolPromise;
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const safeOffset = (safePage - 1) * safePageSize;

  const params = [];
  const where = ["u.rol IN ('CLIENTE', 'EMPLEADO', 'REPARTIDOR')"];

  const rolFilter = normalizeRoleForFilter(rol);
  if (rolFilter) {
    params.push(rolFilter);
    where.push(`u.rol = $${params.length}`);
  }

  const estadoFilter = normalizeStateForFilter(estado);
  if (estadoFilter) {
    params.push(estadoFilter);
    where.push(`u.estado = $${params.length}`);
  }

  const searchValue = String(search || "").trim();
  if (searchValue) {
    params.push(`%${searchValue}%`);
    const p = `$${params.length}`;
    where.push(`(
      u.email ILIKE ${p}
      OR (u.nombre || ' ' || u.apellido) ILIKE ${p}
      OR u.nombre ILIKE ${p}
      OR u.apellido ILIKE ${p}
      OR COALESCE(u.telefono, '') ILIKE ${p}
      OR CAST(u.id_usuario AS TEXT) ILIKE ${p}
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM usuario u
      ${whereSql}
    `,
    params,
  );

  const queryParams = [...params, safePageSize, safeOffset];
  const rs = await pool.query(
    `
      SELECT
        u.id_usuario,
        u.nombre,
        u.apellido,
        u.email,
        u.telefono,
        u.direccion_principal,
        u.rol,
        u.estado,
        u.email_verificado,
        u.fecha_registro,
        m.id_motorizado,
        m.licencia
      FROM usuario u
      LEFT JOIN motorizado m ON m.id_usuario = u.id_usuario
      ${whereSql}
      ORDER BY u.fecha_registro DESC, u.id_usuario DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    queryParams,
  );

  const total = Number(totalResult.rows?.[0]?.total) || 0;
  const totalPages = Math.max(Math.ceil(total / safePageSize), 1);

  return {
    rows: rs.rows || [],
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

async function getUserById(poolOrTx, userId) {
  const conn = poolOrTx || (await poolPromise);
  const { rows } = await conn.query(
    `
      SELECT
        u.id_usuario,
        u.nombre,
        u.apellido,
        u.email,
        u.telefono,
        u.direccion_principal,
        u.rol,
        u.estado,
        u.email_verificado,
        u.fecha_registro,
        m.id_motorizado,
        m.licencia
      FROM usuario u
      LEFT JOIN motorizado m ON m.id_usuario = u.id_usuario
      WHERE u.id_usuario = $1
      LIMIT 1
    `,
    [userId],
  );
  return rows?.[0] || null;
}

async function getUserByEmail(poolOrTx, email) {
  const conn = poolOrTx || (await poolPromise);
  const { rows } = await conn.query(
    `
      SELECT id_usuario, email, rol, estado
      FROM usuario
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email],
  );
  return rows?.[0] || null;
}

async function createUserWithRoleTx(tx, { nombre, apellido, email, contrasena, telefono, direccion_principal, rol }) {
  const { rows } = await tx.query(
    `
      INSERT INTO usuario (nombre, apellido, email, contrasena, telefono, direccion_principal, rol, estado, email_verificado, email_verificado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVO', true, NOW())
      RETURNING id_usuario
    `,
    [nombre, apellido, email, contrasena, telefono || null, direccion_principal || null, rol],
  );
  return rows?.[0]?.id_usuario || null;
}

async function updateUserByIdTx(tx, userId, { nombre, apellido, email, telefono, direccion_principal }) {
  await tx.query(
    `
      UPDATE usuario
      SET nombre = $1,
          apellido = $2,
          email = $3,
          telefono = $4,
          direccion_principal = $5
      WHERE id_usuario = $6
    `,
    [nombre, apellido, email, telefono || null, direccion_principal || null, userId],
  );
}

async function setUserInactiveByIdTx(tx, userId) {
  await tx.query(
    `
      UPDATE usuario
      SET estado = 'INACTIVO'
      WHERE id_usuario = $1
    `,
    [userId],
  );
}

async function setUserActiveByIdTx(tx, userId) {
  await tx.query(
    `
      UPDATE usuario
      SET estado = 'ACTIVO'
      WHERE id_usuario = $1
    `,
    [userId],
  );
}

async function createMotorizadoForUserTx(tx, { id_usuario, nombre, apellido, telefono, licencia }) {
  const { rows } = await tx.query(
    `
      INSERT INTO motorizado (nombre, apellido, telefono, licencia, id_usuario)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id_motorizado
    `,
    [nombre, apellido, telefono, licencia, id_usuario],
  );
  return rows?.[0]?.id_motorizado || null;
}

async function findOrphanMotorizadoCandidateTx(tx, { nombre, apellido, telefono }) {
  const phone = String(telefono || "").trim();
  const { rows } = await tx.query(
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
    [nombre, apellido, phone],
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

async function updateMotorizadoByUserIdTx(tx, userId, { nombre, apellido, telefono, licencia }) {
  await tx.query(
    `
      UPDATE motorizado
      SET nombre = $1,
          apellido = $2,
          telefono = $3,
          licencia = $4
      WHERE id_usuario = $5
    `,
    [nombre, apellido, telefono, licencia, userId],
  );
}

async function unlinkMotorizadoByUserIdTx(tx, userId) {
  await tx.query(
    `
      UPDATE motorizado
      SET id_usuario = NULL
      WHERE id_usuario = $1
    `,
    [userId],
  );
}

module.exports = {
  getPool: () => poolPromise,
  listUsersPaginated,
  getUserById,
  getUserByEmail,
  createUserWithRoleTx,
  updateUserByIdTx,
  setUserInactiveByIdTx,
  setUserActiveByIdTx,
  createMotorizadoForUserTx,
  findOrphanMotorizadoCandidateTx,
  relinkMotorizadoToUserTx,
  updateMotorizadoByUserIdTx,
  unlinkMotorizadoByUserIdTx,
};

export {};
