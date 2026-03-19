// backend/middlewares/authMiddleware.js
// ──────────────────────────────────────
// Verifica JWT y controla acceso por rol

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/auth.config");
const authRepository = require("../repositories/authRepository");

/**
 * Comprueba que la petición incluya un token válido.
 * Formato esperado en la cabecera:  Authorization: Bearer <token>
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Acceso denegado. Token no proporcionado." });

  try {
    const userData = jwt.verify(token, JWT_SECRET);
    const userStatus = await authRepository.getUserStatusById(userData?.id_usuario);
    if (!userStatus) return res.status(401).json({ message: "Usuario no encontrado." });
    if (String(userStatus.estado || "").toUpperCase() !== "ACTIVO") {
      return res.status(403).json({ message: "Tu cuenta está inactiva. Contacta al administrador." });
    }

    req.user = { ...userData, estado: userStatus.estado };
    req.userId = userData.id_usuario;
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado." });
  }
};

/**
 * Intenta autenticar si llega token; si no llega, continúa como invitado.
 */
const optionalAuthenticateToken = async (req, _res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.user = null;
    req.userId = null;
    return next();
  }

  try {
    const userData = jwt.verify(token, JWT_SECRET);
    const userStatus = await authRepository.getUserStatusById(userData?.id_usuario);
    if (!userStatus || String(userStatus.estado || "").toUpperCase() !== "ACTIVO") {
      req.user = null;
      req.userId = null;
      return next();
    }

    req.user = { ...userData, estado: userStatus.estado };
    req.userId = userData.id_usuario;
    return next();
  } catch {
    req.user = null;
    req.userId = null;
    return next();
  }
};

/**
 * Restringe la ruta a los roles indicados.
 * Uso: authorizeRoles("ADMINISTRADOR", "EMPLEADO")
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ message: "No tienes permisos para acceder a este recurso." });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuthenticateToken,
  authorizeRoles,
};

export {};
