// backend/middlewares/authMiddleware.js
// ──────────────────────────────────────
// Verifica JWT y controla acceso por rol

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/auth.config");

/**
 * Comprueba que la petición incluya un token válido.
 * Formato esperado en la cabecera:  Authorization: Bearer <token>
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Acceso denegado. Token no proporcionado." });

  jwt.verify(token, JWT_SECRET, (err, userData) => {
    if (err) return res.status(403).json({ message: "Token inválido o expirado." });

    req.user = userData; // payload: { id_usuario, rol, iat, exp }
    req.userId = userData.id_usuario;
    next();
  });
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
  authorizeRoles,
};
