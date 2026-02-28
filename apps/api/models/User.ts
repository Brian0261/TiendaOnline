// backend/models/User.js
const { poolPromise } = require("../config/db.config");
const bcrypt = require("bcrypt");

// Objeto de acceso al modelo de usuario
const UserModel = {
  // Registrar un nuevo usuario
  async register(userData) {
    const pool = await poolPromise;
    const { nombre, apellido, email, contrasena, telefono, direccion_principal, rol = "CLIENTE" } = userData;

    const hashedPassword = contrasena;

    try {
      await pool.query(
        `
          INSERT INTO usuario (nombre, apellido, email, contrasena, telefono, direccion_principal, rol)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [nombre, apellido, email, hashedPassword, telefono || null, direccion_principal || null, rol],
      );

      return { success: true };
    } catch (err) {
      if (err?.code === "23505") {
        return { success: false, message: "Correo ya registrado" };
      }
      throw err;
    }
  },

  // Buscar usuario por correo
  async findByEmail(email) {
    const pool = await poolPromise;
    const result = await pool.query(`SELECT * FROM usuario WHERE email = $1`, [email]);

    return result.rows[0];
  },

  // Verificar contraseña
  async validatePassword(inputPassword, storedHash) {
    return inputPassword === storedHash;
  },
};

module.exports = UserModel;

export {};
