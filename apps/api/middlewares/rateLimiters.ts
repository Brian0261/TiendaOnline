const rateLimit = require("express-rate-limit");

function minutes(n) {
  return n * 60 * 1000;
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function createLoginLimiter() {
  const windowMinutes = toInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15);
  const max = toInt(process.env.LOGIN_RATE_LIMIT_MAX, 20);

  return rateLimit({
    windowMs: minutes(windowMinutes),
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos. Intenta más tarde." },
  });
}

function createRegisterLimiter() {
  const windowMinutes = toInt(process.env.REGISTER_RATE_LIMIT_WINDOW_MINUTES, 60);
  const max = toInt(process.env.REGISTER_RATE_LIMIT_MAX, 10);

  return rateLimit({
    windowMs: minutes(windowMinutes),
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos de registro. Intenta más tarde." },
  });
}

module.exports = {
  createLoginLimiter,
  createRegisterLimiter,
};

export {};
