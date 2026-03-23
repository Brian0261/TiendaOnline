const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN } = require("../config/auth.config");
const authRepository = require("../repositories/authRepository");
const securityTokenRepository = require("../repositories/securityTokenRepository");
const historialRepository = require("../repositories/historialRepository");
const emailService = require("./emailService");

const REFRESH_COOKIE_NAME = "refresh_token";

function createHttpError(status, message) {
  const err = new Error(message);
  (err as any).status = status;
  return err;
}

function isBcrypt(v) {
  return typeof v === "string" && /^\$2[aby]\$/.test(v);
}

function getBcryptSaltRounds() {
  const raw = process.env.BCRYPT_SALT_ROUNDS;
  const n = Number.parseInt(String(raw || ""), 10);
  // 10 es un default razonable para dev; en prod suele ser 10-12 según performance.
  return Number.isFinite(n) && n >= 8 && n <= 15 ? n : 10;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function getWebBaseUrl() {
  const raw = String(process.env.WEB_BASE_URL || process.env.PUBLIC_WEB_BASE_URL || process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const normalized = `https://${raw}`;
  console.warn(`[authService] WEB_BASE_URL sin esquema detectado. Se normaliza a: ${normalized}`);
  return normalized;
}

function getEmailVerificationTtlMs() {
  const raw = process.env.EMAIL_VERIFICATION_TTL_MINUTES;
  const n = Number.parseInt(String(raw || ""), 10);
  const minutes = Number.isFinite(n) && n >= 5 && n <= 7 * 24 * 60 ? n : 24 * 60;
  return minutes * 60 * 1000;
}

function getPasswordResetTtlMs() {
  const raw = process.env.PASSWORD_RESET_TTL_MINUTES;
  const n = Number.parseInt(String(raw || ""), 10);
  const minutes = Number.isFinite(n) && n >= 5 && n <= 24 * 60 ? n : 60;
  return minutes * 60 * 1000;
}

function getPasswordResetTtlMinutes() {
  return Math.round(getPasswordResetTtlMs() / (60 * 1000));
}

function getEmailVerificationTtlMinutes() {
  return Math.round(getEmailVerificationTtlMs() / (60 * 1000));
}

function logDevEmailLink(kind, urlOrToken) {
  // En dev imprimimos el link/token para poder probar sin proveedor real de email.
  // En producción, por defecto no lo hacemos.
  const force = String(process.env.DEV_EMAIL_LINKS || "").trim() === "1";
  if (process.env.NODE_ENV === "production" && !force) return;
  console.log(`[DEV:${kind}] ${urlOrToken}`);
}

function isStrongPassword(value) {
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(value || ""));
}

function toAuthUser(userRow) {
  return {
    id_usuario: userRow.id_usuario,
    nombre: userRow.nombre,
    apellido: userRow.apellido,
    email: userRow.email,
    rol: userRow.rol,
  };
}

function signToken(userRow) {
  return jwt.sign({ id_usuario: userRow.id_usuario, rol: userRow.rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function signRefreshToken(userRow) {
  return jwt.sign({ id_usuario: userRow.id_usuario, rol: userRow.rol }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

function parseDurationToMs(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^([0-9]+)\s*([smhd])$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  return null;
}

function getRefreshCookieOptions() {
  const maxAge = parseDurationToMs(JWT_REFRESH_EXPIRES_IN) ?? 7 * 24 * 60 * 60 * 1000;
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = isProd ? "none" : "lax";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite,
    path: "/api/auth",
    maxAge,
  };
}

function getRefreshTokenFromRequest(req) {
  return req?.cookies?.[REFRESH_COOKIE_NAME] || null;
}

async function issueTokensForUser(userRow) {
  const token = signToken(userRow);
  const refreshToken = signRefreshToken(userRow);
  return { token, refreshToken };
}

async function register({ nombre, apellido, email, plainPwd, telefono, direccion_principal }) {
  const exists = await authRepository.userExistsByEmail(email);
  if (exists) throw createHttpError(409, "Correo ya registrado.");

  // Guardar SIEMPRE hasheado.
  const passwordHash = await bcrypt.hash(plainPwd, getBcryptSaltRounds());
  await authRepository.createUser({
    nombre,
    apellido,
    email,
    contrasena: passwordHash,
    telefono,
    direccion_principal,
  });

  const userRow = await authRepository.findUserByEmail(email);
  if (!userRow) throw createHttpError(500, "No se pudo crear el usuario.");

  // Doble opt-in: generar token de verificación (en dev se loguea el link).
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const token_hash = sha256Hex(token);
    const expires_at = new Date(Date.now() + getEmailVerificationTtlMs());
    await securityTokenRepository.createEmailVerificationToken({
      id_usuario: userRow.id_usuario,
      token_hash,
      expires_at,
    });

    const base = getWebBaseUrl();
    const link = base ? `${base}/verify-email?token=${encodeURIComponent(token)}` : token;
    await emailService.sendEmailVerificationEmail({
      to: userRow.email,
      verifyLink: link,
      expiresMinutes: getEmailVerificationTtlMinutes(),
    });
  } catch {
    // Si falla la generación del token, no bloqueamos el registro.
  }

  return {
    message: "Registro exitoso. Revisa tu correo para verificar tu cuenta.",
    requiresEmailVerification: true,
  };
}

async function login({ email, plainPwd }) {
  const userRow = await authRepository.findUserByEmail(email);
  if (!userRow) throw createHttpError(401, "Credenciales incorrectas.");

  if (String(userRow.estado || "ACTIVO").toUpperCase() !== "ACTIVO") {
    throw createHttpError(403, "Tu cuenta está inactiva. Contacta al administrador.");
  }

  // Doble opt-in: no permitir login si el email no fue verificado.
  if (userRow.email_verificado === 0 || userRow.email_verificado === false) {
    throw createHttpError(403, "Debes verificar tu email antes de iniciar sesión.");
  }

  const stored = userRow.contrasena || userRow.password || userRow.password_hash || "";
  let ok = false;
  if (isBcrypt(stored)) {
    ok = await bcrypt.compare(plainPwd, stored);
  } else {
    ok = plainPwd === String(stored);
  }

  if (!ok) throw createHttpError(401, "Credenciales incorrectas.");

  // Migración perezosa (lazy migration): si la contraseña estaba en texto plano y el login fue correcto,
  // la convertimos a bcrypt y actualizamos la BD.
  if (!isBcrypt(stored)) {
    try {
      const newHash = await bcrypt.hash(plainPwd, getBcryptSaltRounds());
      await authRepository.updateUserPasswordHashById(userRow.id_usuario, newHash);
    } catch {
      // Si falla la migración, NO bloqueamos el login (pero idealmente lo loguearías en observabilidad).
    }
  }

  const { token, refreshToken } = await issueTokensForUser(userRow);
  return {
    message: "Inicio de sesión exitoso.",
    token,
    refreshToken,
    user: toAuthUser(userRow),
  };
}

async function requestEmailVerification({ id_usuario, email }) {
  const safeMessage = { message: "Si el correo es válido, recibirás un email de verificación." };

  let userRow = null;
  if (Number.isInteger(id_usuario) && id_usuario > 0) {
    userRow = await authRepository.findUserByIdForVerification(id_usuario);
  } else {
    const normalized = String(email || "")
      .trim()
      .toLowerCase();
    if (!normalized) return safeMessage;
    userRow = await authRepository.findUserByEmail(normalized);
  }

  if (!userRow) return safeMessage;
  if (userRow.email_verificado === 1 || userRow.email_verificado === true) return safeMessage;

  const token = crypto.randomBytes(32).toString("hex");
  const token_hash = sha256Hex(token);
  const expires_at = new Date(Date.now() + getEmailVerificationTtlMs());

  await securityTokenRepository.createEmailVerificationToken({ id_usuario: userRow.id_usuario, token_hash, expires_at });

  const base = getWebBaseUrl();
  const link = base ? `${base}/verify-email?token=${encodeURIComponent(token)}` : token;
  await emailService.sendEmailVerificationEmail({
    to: userRow.email,
    verifyLink: link,
    expiresMinutes: getEmailVerificationTtlMinutes(),
  });

  return safeMessage;
}

async function verifyEmail({ token }) {
  const raw = String(token || "").trim();
  if (!raw) throw createHttpError(400, "Token inválido.");

  const token_hash = sha256Hex(raw);
  const consumed = await securityTokenRepository.consumeEmailVerificationTokenAndVerifyUser({ token_hash });
  if (!consumed) throw createHttpError(400, "Token inválido o expirado.");

  if (consumed?.id_usuario) {
    try {
      await historialRepository.insertHistorial({
        id_usuario: consumed.id_usuario,
        accion: "EMAIL_VERIFICADO",
        descripcion: "Email verificado (doble opt-in).",
      });
    } catch {
      // ignore
    }
  }

  return { message: "Email verificado correctamente." };
}

async function forgotPassword({ email }) {
  const safeMessage = { message: "Si el correo existe, recibirás instrucciones para restablecer la contraseña." };
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) return safeMessage;

  const userRow = await authRepository.findUserByEmail(normalized);
  if (!userRow) return safeMessage;

  const token = crypto.randomBytes(32).toString("hex");
  const token_hash = sha256Hex(token);
  const expires_at = new Date(Date.now() + getPasswordResetTtlMs());

  await securityTokenRepository.invalidateActivePasswordResetTokensByUserId({
    id_usuario: userRow.id_usuario,
  });

  await securityTokenRepository.createPasswordResetToken({
    id_usuario: userRow.id_usuario,
    token_hash,
    expires_at,
  });

  const base = getWebBaseUrl();
  const link = base ? `${base}/reset-password?token=${encodeURIComponent(token)}` : token;
  try {
    await emailService.sendPasswordResetEmail({
      to: userRow.email,
      resetLink: link,
      expiresMinutes: getPasswordResetTtlMinutes(),
    });
  } catch (err) {
    console.error("[authService] Error enviando email de recuperación:", err?.message || err);
    return safeMessage;
  }

  return safeMessage;
}

async function resetPassword({ token, newPassword }) {
  const rawToken = String(token || "").trim();
  if (!rawToken) throw createHttpError(400, "Token inválido.");

  const plainPwd = String(newPassword || "").trim();
  if (!plainPwd) throw createHttpError(400, "Contraseña inválida.");
  if (!isStrongPassword(plainPwd)) {
    throw createHttpError(400, "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.");
  }

  const passwordHash = await bcrypt.hash(plainPwd, getBcryptSaltRounds());
  const token_hash = sha256Hex(rawToken);

  const consumed = await securityTokenRepository.consumePasswordResetTokenAndUpdatePassword({
    token_hash,
    password_hash: passwordHash,
  });

  if (!consumed) throw createHttpError(400, "Token inválido o expirado.");

  try {
    await historialRepository.insertHistorial({
      id_usuario: consumed.id_usuario,
      accion: "PASSWORD_RESET",
      descripcion: "Restablecimiento de contraseña realizado.",
    });
  } catch {
    // ignore
  }

  return { message: "Contraseña actualizada correctamente." };
}

async function refresh(req) {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) throw createHttpError(401, "Refresh token no proporcionado.");

  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch {
    throw createHttpError(401, "Refresh token inválido o expirado.");
  }

  const id_usuario = payload?.id_usuario;
  if (!id_usuario) throw createHttpError(401, "Refresh token inválido.");

  const userRow = await authRepository.getUserProfileById(Number(id_usuario));
  if (!userRow) throw createHttpError(401, "Usuario no encontrado.");
  if (String(userRow.estado || "ACTIVO").toUpperCase() !== "ACTIVO") {
    throw createHttpError(403, "Tu cuenta está inactiva. Contacta al administrador.");
  }

  const { token, refreshToken: newRefreshToken } = await issueTokensForUser(userRow);
  return {
    message: "Token refrescado.",
    token,
    refreshToken: newRefreshToken,
    user: toAuthUser(userRow),
  };
}

function getRefreshCookieName() {
  return REFRESH_COOKIE_NAME;
}

async function getProfile(id_usuario) {
  const user = await authRepository.getUserProfileById(id_usuario);
  return { user };
}

async function updateProfile(id_usuario, { nombre, apellido, telefono, direccion_principal }) {
  await authRepository.updateUserProfile(id_usuario, { nombre, apellido, telefono, direccion_principal });
  const user = await authRepository.getUserProfileById(id_usuario);
  return { user };
}

module.exports = {
  register,
  login,
  refresh,
  requestEmailVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  getRefreshCookieOptions,
  getRefreshCookieName,
};

export {};
