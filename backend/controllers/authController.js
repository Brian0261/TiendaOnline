// backend/controllers/authController.js
// ────────────────────────────────────────
//  REGISTRO, LOGIN y utilidades de usuario
// ────────────────────────────────────────

const { sql, poolPromise } = require("../config/db.config");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, JWT_EXPIRES_IN } = require("../config/auth.config");

/* ════════════════════════════════════════
   REGISTRO DE USUARIO
   ════════════════════════════════════════ */
const register = async (req, res) => {
  try {
    const { nombre, apellido, email, contrasena, telefono, direccion_principal } = req.body;

    // Validación básica
    if (!nombre || !apellido || !email || !contrasena) {
      return res.status(400).json({ message: "Faltan campos obligatorios." });
    }

    // Reglas de contraseña (mínimo 8, una mayúscula, un número)
    const regexPassword = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!regexPassword.test(contrasena)) {
      return res.status(400).json({
        message: "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.",
      });
    }

    const pool = await poolPromise;

    // Verificar si el email ya existe
    const emailExist = await pool.request().input("email", sql.VarChar, email).query("SELECT 1 FROM USUARIO WHERE email = @email");

    if (emailExist.recordset.length) {
      return res.status(409).json({ message: "Correo ya registrado." });
    }

    // Insertar usuario (⚠️ contraseña sin hash para demo)
    await pool
      .request()
      .input("nombre", sql.VarChar, nombre)
      .input("apellido", sql.VarChar, apellido)
      .input("email", sql.VarChar, email)
      .input("contrasena", sql.VarChar, contrasena)
      .input("telefono", sql.VarChar, telefono || null)
      .input("direccion_principal", sql.VarChar, direccion_principal || null).query(`
        INSERT INTO USUARIO (nombre, apellido, email, contrasena, telefono, direccion_principal)
        VALUES (@nombre, @apellido, @email, @contrasena, @telefono, @direccion_principal)
      `);

    // Traer el usuario recién creado
    const usuario = await pool.request().input("email", sql.VarChar, email).query("SELECT * FROM USUARIO WHERE email = @email");
    const user = usuario.recordset[0];

    // Generar JWT
    const token = jwt.sign({ id_usuario: user.id_usuario, rol: user.rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Respuesta
    return res.status(201).json({
      message: "Registro exitoso.",
      token,
      user: {
        id_usuario: user.id_usuario,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol,
      },
    });
  } catch (err) {
    console.error("Error en registro:", err);
    return res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* ════════════════════════════════════════
   LOGIN DE USUARIO
   ════════════════════════════════════════ */
const login = async (req, res) => {
  try {
    const { email, contrasena } = req.body;

    const pool = await poolPromise;

    // Buscar por email
    const result = await pool.request().input("email", sql.VarChar, email).query("SELECT * FROM USUARIO WHERE email = @email");

    if (!result.recordset.length) {
      return res.status(401).json({ message: "Credenciales incorrectas." });
    }

    const user = result.recordset[0];

    // Comparar contraseña (texto plano – demo)
    if (contrasena !== user.contrasena) {
      return res.status(401).json({ message: "Credenciales incorrectas." });
    }

    // Generar JWT
    const token = jwt.sign({ id_usuario: user.id_usuario, rol: user.rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Respuesta
    return res.status(200).json({
      message: "Inicio de sesión exitoso.",
      token,
      user: {
        id_usuario: user.id_usuario,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol,
      },
    });
  } catch (err) {
    console.error("Error en login:", err);
    return res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* ════════════════════════════════════════
   PERFIL DEL USUARIO LOGUEADO (GET)
   ════════════════════════════════════════ */
const getProfile = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input("id_usuario", sql.Int, req.user.id_usuario).query(`
        SELECT id_usuario, nombre, apellido, email,
               telefono, direccion_principal, rol
        FROM   USUARIO
        WHERE  id_usuario = @id_usuario
      `);

    return res.json({ user: result.recordset[0] });
  } catch (err) {
    console.error("Error al obtener perfil:", err);
    return res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* ════════════════════════════════════════
   ACTUALIZAR PERFIL DEL USUARIO (PUT)
   ════════════════════════════════════════ */
const updateProfile = async (req, res) => {
  try {
    const id_usuario = req.user.id_usuario;
    const { nombre, apellido, telefono, direccion_principal } = req.body;
    const pool = await poolPromise;

    // Actualiza solo campos editables
    await pool
      .request()
      .input("nombre", sql.VarChar, nombre)
      .input("apellido", sql.VarChar, apellido)
      .input("telefono", sql.VarChar, telefono || null)
      .input("direccion_principal", sql.VarChar, direccion_principal || null)
      .input("id_usuario", sql.Int, id_usuario).query(`
        UPDATE USUARIO
        SET nombre = @nombre, apellido = @apellido, telefono = @telefono, direccion_principal = @direccion_principal
        WHERE id_usuario = @id_usuario
      `);

    // Devuelve los datos actualizados
    const result = await pool
      .request()
      .input("id_usuario", sql.Int, id_usuario)
      .query("SELECT id_usuario, nombre, apellido, email, telefono, direccion_principal, rol FROM USUARIO WHERE id_usuario = @id_usuario");

    return res.json({ user: result.recordset[0] });
  } catch (err) {
    console.error("Error al actualizar perfil:", err);
    return res.status(500).json({ message: "Error interno al actualizar perfil." });
  }
};

/* ════════════════════════════════════════
   REDIRECCIÓN DE DASHBOARD SEGÚN ROL
   ════════════════════════════════════════ */
const getDashboardByRole = (req, res) => {
  const { rol } = req.user;
  if (rol === "ADMINISTRADOR") return res.redirect("/dashboard/admin.html");
  if (rol === "EMPLEADO") return res.redirect("/dashboard/employee.html");
  return res.redirect("/dashboard/customer.html");
};

/* ════════════════════════════════════════
   EXPORTS
   ════════════════════════════════════════ */
module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  getDashboardByRole,
};
