// backend/controllers/authController.js
// ────────────────────────────────────────
//  REGISTRO, LOGIN y utilidades de usuario
//  (acepta contrasena/password y correo/email)
// ────────────────────────────────────────

const authService = require("../services/authService");
const { onLoginFailure, onLoginSuccess } = require("../middlewares/bruteforceProtection");

// Helpers
const normStr = v => (v == null ? "" : String(v).trim());
function getStatus(err) {
  return typeof err?.status === "number" ? err.status : 500;
}

const regexPassword = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

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

    // Anti-bot simple (captcha/honeypot): si este campo oculto viene lleno, es muy probable que sea un bot.
    const honeypot = normStr(req.body.website || req.body._website || req.body.hp);
    if (honeypot) {
      return res.status(400).json({ message: "Validación anti-bots fallida." });
    }

    // Anti-bot simple adicional: exige que hayan pasado al menos ~2s desde que se cargó el formulario.
    const startedAtRaw = req.body.form_started_at ?? req.body.formStartedAt;
    const startedAt = Number.parseInt(String(startedAtRaw || ""), 10);
    if (!Number.isFinite(startedAt)) {
      return res.status(400).json({ message: "Validación anti-bots fallida." });
    }
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs < 2000 || elapsedMs > 60 * 60 * 1000) {
      return res.status(400).json({ message: "Validación anti-bots fallida." });
    }

    if (!nombre || !apellido || !email || !plainPwd) {
      return res.status(400).json({ message: "Faltan campos obligatorios." });
    }

    // Reglas básicas
    if (!regexPassword.test(plainPwd)) {
      return res.status(400).json({
        message: "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.",
      });
    }

    const result = await authService.register({
      nombre,
      apellido,
      email,
      plainPwd,
      telefono,
      direccion_principal,
    });

    if (result?.refreshToken) {
      res.cookie(authService.getRefreshCookieName(), result.refreshToken, authService.getRefreshCookieOptions());
    }

    const { refreshToken, ...safe } = result;
    return res.status(201).json(safe);
  } catch (err) {
    console.error("Error en registro:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
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

    const result = await authService.login({ email, plainPwd });

    // Éxito: resetea contador de brute-force.
    onLoginSuccess(req, email);

    if (result?.refreshToken) {
      res.cookie(authService.getRefreshCookieName(), result.refreshToken, authService.getRefreshCookieOptions());
    }

    const { refreshToken, ...safe } = result;
    return res.status(200).json(safe);
  } catch (err) {
    // Fallo de credenciales: registra intento para bloqueo temporal.
    if (getStatus(err) === 401) {
      onLoginFailure(req, req.body?.email || req.body?.correo);
    }
    console.error("Error en login:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
  }
};

// ============== REFRESH TOKEN ==============
const refresh = async (req, res) => {
  try {
    const result = await authService.refresh(req);

    if (result?.refreshToken) {
      res.cookie(authService.getRefreshCookieName(), result.refreshToken, authService.getRefreshCookieOptions());
    }

    const { refreshToken, ...safe } = result;
    return res.status(200).json(safe);
  } catch (err) {
    console.error("Error en refresh:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
  }
};

// ============== LOGOUT ==============
const logout = async (_req, res) => {
  try {
    res.clearCookie(authService.getRefreshCookieName(), authService.getRefreshCookieOptions());
    return res.status(200).json({ message: "Sesión cerrada." });
  } catch (err) {
    console.error("Error en logout:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
  }
};

// ============== PERFIL / UPDATE / DASHBOARD ==============
const getProfile = async (req, res) => {
  try {
    const result = await authService.getProfile(req.user.id_usuario);
    return res.json(result);
  } catch (err) {
    console.error("Error al obtener perfil:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
  }
};

const updateProfile = async (req, res) => {
  try {
    const id_usuario = req.user.id_usuario;
    const nombre = normStr(req.body.nombre);
    const apellido = normStr(req.body.apellido);
    const telefono = normStr(req.body.telefono) || null;
    const direccion_principal = normStr(req.body.direccion_principal) || null;

    const result = await authService.updateProfile(id_usuario, {
      nombre,
      apellido,
      telefono,
      direccion_principal,
    });
    return res.json(result);
  } catch (err) {
    console.error("Error al actualizar perfil:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno al actualizar perfil." });
  }
};

const getDashboardByRole = (req, res) => {
  const { rol } = req.user || {};
  if (rol === "ADMINISTRADOR") return res.redirect("/dashboard/admin.html");
  if (rol === "EMPLEADO") return res.redirect("/dashboard/employee.html");
  return res.redirect("/dashboard/customer.html");
};

// ============== FORGOT / RESET PASSWORD ==============
const forgotPassword = async (req, res) => {
  try {
    const email = normStr(req.body.email || req.body.correo).toLowerCase();
    const result = await authService.forgotPassword({ email });
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error en forgotPassword:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
  }
};

const resetPassword = async (req, res) => {
  try {
    const token = normStr(req.body.token);
    const newPassword = normStr(req.body.newPassword ?? req.body.nuevaContrasena ?? req.body.password);

    if (!regexPassword.test(newPassword)) {
      return res.status(400).json({
        message: "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.",
      });
    }

    const result = await authService.resetPassword({ token, newPassword });
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error en resetPassword:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
  }
};

// ============== EMAIL VERIFICATION (DOBLE OPT-IN) ==============
const requestEmailVerification = async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;
    const email = normStr(req.body.email || req.body.correo).toLowerCase();
    const result = await authService.requestEmailVerification({ id_usuario, email });
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error en requestEmailVerification:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const token = normStr(req.body.token ?? req.query?.token);
    const result = await authService.verifyEmail({ token });
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error en verifyEmail:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error interno del servidor." });
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  getProfile,
  updateProfile,
  getDashboardByRole,
  forgotPassword,
  resetPassword,
  requestEmailVerification,
  verifyEmail,
};

export {};
