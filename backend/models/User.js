// backend/models/User.js
const sql = require("mssql");
const bcrypt = require("bcrypt");

// Objeto de acceso al modelo de usuario
const UserModel = {
  // Registrar un nuevo usuario
  async register(userData) {
    const pool = await sql.connect();
    const {
      nombre,
      apellido,
      email,
      contrasena,
      telefono,
      direccion_principal,
      rol = "CLIENTE",
    } = userData;

    const hashedPassword = contrasena;

    try {
      const result = await pool
        .request()
        .input("nombre", sql.VarChar(50), nombre)
        .input("apellido", sql.VarChar(50), apellido)
        .input("email", sql.VarChar(100), email)
        .input("contrasena", sql.VarChar(255), hashedPassword)
        .input("telefono", sql.VarChar(20), telefono || null)
        .input("direccion", sql.VarChar(255), direccion_principal || null)
        .input("rol", sql.VarChar(15), rol).query(`
          INSERT INTO USUARIO (nombre, apellido, email, contrasena, telefono, direccion_principal, rol)
          VALUES (@nombre, @apellido, @email, @contrasena, @telefono, @direccion, @rol)
        `);

      return { success: true };
    } catch (err) {
      if (err.originalError?.info?.number === 2627) {
        return { success: false, message: "Correo ya registrado" };
      }
      throw err;
    }
  },

  // Buscar usuario por correo
  async findByEmail(email) {
    const pool = await sql.connect();
    const result = await pool
      .request()
      .input("email", sql.VarChar(100), email)
      .query(`SELECT * FROM USUARIO WHERE email = @email`);

    return result.recordset[0];
  },

  // Verificar contraseña
  async validatePassword(inputPassword, storedHash) {
    return inputPassword === storedHash;
  },
};

module.exports = UserModel;
