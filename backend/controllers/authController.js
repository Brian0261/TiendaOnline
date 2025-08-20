// backend/controllers/authController.js
// ────────────────────────────────────────
//  REGISTRO, LOGIN y utilidades de usuario
//  (acepta contrasena/password y correo/email)
// ────────────────────────────────────────

const { sql, poolPromise } = require("../config/db.config");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, JWT_EXPIRES_IN } = require("../config/auth.config");
const bcrypt = require("bcryptjs");

// Helpers
const normStr = v => (v == null ? "" : String(v).trim());
const isBcrypt = v => typeof v === "string" && /^\$2[aby]\$/.test(v);

// ============== REGISTRO ==============
const register = async (req, res) => {
  try {
    // Acepta correo|email y contrasena|password
    const nombre = normStr(req.body.nombre);
    const apellido = normStr(req.body.apellido);
    const email = normStr(req.body.email || req.body.correo).toLowerCase();
    const plainPwd = normStr(req.body.contrasena ?? req.body.password);
    const telefono = normStr(req.body.telefono) || null;
    const direccion_principal = normStr(req.body.direccion_principal) || null;

    if (!nombre || !apellido || !email || !plainPwd) {
      return res.status(400).json({ message: "Faltan campos obligatorios." });
    }

    // Reglas básicas
    const regexPassword = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!regexPassword.test(plainPwd)) {
      return res.status(400).json({
        message: "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.",
      });
    }

    const pool = await poolPromise;

    // ¿Existe email?
    const exists = await pool.request().input("email", sql.VarChar, email).query("SELECT 1 FROM USUARIO WHERE email = @email");

    if (exists.recordset.length) {
      return res.status(409).json({ message: "Correo ya registrado." });
    }

    // ⚠️ Para compatibilidad con tus datos actuales, guardamos en texto plano.
    // Si quieres hash, descomenta las 2 líneas de abajo y cambia el INSERT:
    // const hashed = await bcrypt.hash(plainPwd, 10);
    // .input("contrasena", sql.VarChar, hashed)
    await pool
      .request()
      .input("nombre", sql.VarChar, nombre)
      .input("apellido", sql.VarChar, apellido)
      .input("email", sql.VarChar, email)
      .input("contrasena", sql.VarChar, plainPwd) // texto plano por compatibilidad
      .input("telefono", sql.VarChar, telefono)
      .input("direccion_principal", sql.VarChar, direccion_principal).query(`
        INSERT INTO USUARIO (nombre, apellido, email, contrasena, telefono, direccion_principal)
        VALUES (@nombre, @apellido, @email, @contrasena, @telefono, @direccion_principal)
      `);

    const usuario = await pool.request().input("email", sql.VarChar, email).query("SELECT * FROM USUARIO WHERE email = @email");

    const user = usuario.recordset[0];

    const token = jwt.sign({ id_usuario: user.id_usuario, rol: user.rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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

// ============== LOGIN ==============
const login = async (req, res) => {
  try {
    const email = normStr(req.body.email || req.body.correo).toLowerCase();
    // acepta contrasena o password
    const plainPwd = normStr(req.body.contrasena ?? req.body.password);

    if (!email || !plainPwd) {
      return res.status(400).json({ message: "Faltan email y/o contraseña." });
    }

    const pool = await poolPromise;

    const result = await pool.request().input("email", sql.VarChar, email).query("SELECT TOP 1 * FROM USUARIO WHERE email = @email");

    if (!result.recordset.length) {
      return res.status(401).json({ message: "Credenciales incorrectas." });
    }

    const user = result.recordset[0];

    // Soporta:
    //  - contrasena en texto plano (tu esquema actual)
    //  - contrasena almacenada como hash bcrypt (por si migras)
    const stored = user.contrasena || user.password || user.password_hash || "";

    let ok = false;
    if (isBcrypt(stored)) {
      ok = await bcrypt.compare(plainPwd, stored);
    } else {
      ok = plainPwd === String(stored);
    }

    if (!ok) {
      return res.status(401).json({ message: "Credenciales incorrectas." });
    }

    const token = jwt.sign({ id_usuario: user.id_usuario, rol: user.rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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

// ============== PERFIL / UPDATE / DASHBOARD ==============
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

const updateProfile = async (req, res) => {
  try {
    const id_usuario = req.user.id_usuario;
    const nombre = normStr(req.body.nombre);
    const apellido = normStr(req.body.apellido);
    const telefono = normStr(req.body.telefono) || null;
    const direccion_principal = normStr(req.body.direccion_principal) || null;

    const pool = await poolPromise;

    await pool
      .request()
      .input("nombre", sql.VarChar, nombre)
      .input("apellido", sql.VarChar, apellido)
      .input("telefono", sql.VarChar, telefono)
      .input("direccion_principal", sql.VarChar, direccion_principal)
      .input("id_usuario", sql.Int, id_usuario).query(`
        UPDATE USUARIO
        SET nombre = @nombre, apellido = @apellido,
            telefono = @telefono, direccion_principal = @direccion_principal
        WHERE id_usuario = @id_usuario
      `);

    const result = await pool.request().input("id_usuario", sql.Int, id_usuario).query(`
        SELECT id_usuario, nombre, apellido, email,
               telefono, direccion_principal, rol
        FROM USUARIO WHERE id_usuario = @id_usuario
      `);

    return res.json({ user: result.recordset[0] });
  } catch (err) {
    console.error("Error al actualizar perfil:", err);
    return res.status(500).json({ message: "Error interno al actualizar perfil." });
  }
};

const getDashboardByRole = (req, res) => {
  const { rol } = req.user || {};
  if (rol === "ADMINISTRADOR") return res.redirect("/dashboard/admin.html");
  if (rol === "EMPLEADO") return res.redirect("/dashboard/employee.html");
  return res.redirect("/dashboard/customer.html");
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  getDashboardByRole,
};
