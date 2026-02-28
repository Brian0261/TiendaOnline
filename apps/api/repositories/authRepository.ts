const { poolPromise } = require("../config/db.config");

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
  const result = await pool.query(
    `
      SELECT id_usuario, nombre, apellido, email,
             telefono, direccion_principal, rol
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

module.exports = {
  userExistsByEmail,
  findUserByEmail,
  createUser,
  getUserProfileById,
  findUserByIdForVerification,
  updateUserProfile,
  updateUserPasswordHashById,
};

export {};
