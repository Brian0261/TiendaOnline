function minutes(n) {
  return n * 60 * 1000;
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nowMs() {
  return Date.now();
}

// Estado en memoria (demo). En prod, mover a Redis.
const state = new Map();

function getConfig() {
  return {
    windowMs: minutes(toInt(process.env.LOGIN_BRUTEFORCE_WINDOW_MINUTES, 15)),
    maxAttempts: toInt(process.env.LOGIN_BRUTEFORCE_MAX_ATTEMPTS, 5),
    lockMs: minutes(toInt(process.env.LOGIN_BRUTEFORCE_LOCK_MINUTES, 15)),
  };
}

function getKey(req, email) {
  const ip = req.ip || req.connection?.remoteAddress || "";
  return `${ip}|${String(email || "").toLowerCase()}`;
}

function getEntry(key) {
  const e = state.get(key);
  if (!e) return null;
  return e;
}

function reset(key) {
  state.delete(key);
}

function registerFailure(key) {
  const cfg = getConfig();
  const t = nowMs();

  const existing = getEntry(key);
  let entry;
  if (!existing) {
    entry = { firstFailAt: t, fails: 1, lockedUntil: 0 };
  } else {
    entry = { ...existing };

    if (entry.firstFailAt && t - entry.firstFailAt > cfg.windowMs) {
      entry.firstFailAt = t;
      entry.fails = 0;
    }

    entry.fails = (entry.fails || 0) + 1;
  }

  if (entry.fails >= cfg.maxAttempts) {
    entry.lockedUntil = t + cfg.lockMs;
  }

  state.set(key, entry);
  return entry;
}

function isLocked(key) {
  const t = nowMs();
  const entry = getEntry(key);
  if (!entry) return { locked: false, retryAfterMs: 0 };

  if (entry.lockedUntil && entry.lockedUntil > t) {
    return { locked: true, retryAfterMs: entry.lockedUntil - t };
  }

  // Si ya pasó el lock, resetea para no acumular para siempre.
  if (entry.lockedUntil && entry.lockedUntil <= t) {
    reset(key);
  }

  return { locked: false, retryAfterMs: 0 };
}

function onLoginSuccess(req, email) {
  const key = getKey(req, email);
  reset(key);
}

function onLoginFailure(req, email) {
  const key = getKey(req, email);
  return registerFailure(key);
}

function checkLoginLock(req, res, next) {
  const email = (req.body?.email || req.body?.correo || "").toString().trim().toLowerCase();
  const key = getKey(req, email);
  const { locked, retryAfterMs } = isLocked(key);

  if (!locked) return next();

  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({ message: "Demasiados intentos. Intenta más tarde." });
}

module.exports = {
  checkLoginLock,
  onLoginSuccess,
  onLoginFailure,
};

export {};
