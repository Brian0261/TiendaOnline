const { poolPromise } = require("../config/db.config");

let hasEstadoColumnCache = null;

async function hasUsuarioEstadoColumn() {
  if (hasEstadoColumnCache !== null) return hasEstadoColumnCache;
  const pool = await poolPromise;
  const result = await pool.query(
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

async function userExistsByEmail(email) {
  const pool = await poolPromise;
  const exists = await pool.query("SELECT 1 FROM usuario WHERE email = $1", [email]);
  return exists.rows.length > 0;
}

async function findUserByEmail(email) {
  const pool = await poolPromise;
  const result = await pool.query("SELECT * FROM usuario WHERE email = $1 LIMIT 1", [email]);
  return result.rows[0] || null;
}

async function createUser({ nombre, apellido, email, contrasena, telefono, direccion_principal }) {
  const pool = await poolPromise;
  await pool.query(
    `
      INSERT INTO usuario (nombre, apellido, email, contrasena, telefono, direccion_principal)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [nombre, apellido, email, contrasena, telefono, direccion_principal],
  );
}

async function getUserProfileById(id_usuario) {
  const pool = await poolPromise;
  const hasEstado = await hasUsuarioEstadoColumn();
  const estadoSelect = hasEstado ? "estado" : "NULL::text AS estado";
  const result = await pool.query(
    `
      SELECT id_usuario, nombre, apellido, email,
             telefono, direccion_principal, rol, ${estadoSelect}
      FROM   usuario
      WHERE  id_usuario = $1
    `,
    [id_usuario],
  );
  return result.rows[0] || null;
}

async function findUserByIdForVerification(id_usuario) {
  const pool = await poolPromise;
  const result = await pool.query(
    `
      SELECT id_usuario, email, email_verificado
      FROM usuario
      WHERE id_usuario = $1
      LIMIT 1
    `,
    [id_usuario],
  );
  return result.rows[0] || null;
}

async function updateUserProfile(id_usuario, { nombre, apellido, telefono, direccion_principal }) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE usuario
      SET nombre = $1, apellido = $2,
          telefono = $3, direccion_principal = $4
      WHERE id_usuario = $5
    `,
    [nombre, apellido, telefono, direccion_principal, id_usuario],
  );
}

async function updateUserPasswordHashById(id_usuario, passwordHash) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE usuario
      SET contrasena = $1
      WHERE id_usuario = $2
    `,
    [passwordHash, id_usuario],
  );
}

async function getUserStatusById(id_usuario) {
  const pool = await poolPromise;
  const hasEstado = await hasUsuarioEstadoColumn();
  const estadoSelect = hasEstado ? "estado" : "NULL::text AS estado";
  const result = await pool.query(
    `
      SELECT id_usuario, rol, ${estadoSelect}
      FROM usuario
      WHERE id_usuario = $1
      LIMIT 1
    `,
    [id_usuario],
  );
  return result.rows[0] || null;
}

module.exports = {
  userExistsByEmail,
  findUserByEmail,
  createUser,
  getUserProfileById,
  findUserByIdForVerification,
  updateUserProfile,
  updateUserPasswordHashById,
  getUserStatusById,
};

export {};
