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
  // Access token: vida corta (recomendado). En dev puedes subirlo vía .env.
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",

  // Refresh token: vida más larga. Idealmente se guarda en cookie httpOnly.
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "dev_refresh_secret",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
};

export {};
