// backend/config/auth.config.js
// ------------------------------------------------------------
//  Configuración centralizada de autenticación (JWT)
// ------------------------------------------------------------

const dotenv = require("dotenv");
dotenv.config();

/**
 * Exporta la clave y la duración del token.
 *  - JWT_SECRET     : clave para firmar y verificar JWT
 *  - JWT_EXPIRES_IN : tiempo de vida (ej. "2h", "15m", "7d")
 *
 * Si las variables no existen en .env se usan valores seguros
 * por defecto para entorno de desarrollo.
 */
module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || "dev_secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "2h",
};
