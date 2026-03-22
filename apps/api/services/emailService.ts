const nodemailer = require("nodemailer");

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function getEmailMode() {
  const explicit = String(process.env.EMAIL_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (explicit === "smtp") return "smtp";
  if (explicit === "console") return "console";

  const hasSmtpHost = Boolean(String(process.env.SMTP_HOST || "").trim());
  const hasSmtpPort = Number.isFinite(Number.parseInt(String(process.env.SMTP_PORT || ""), 10));
  if (hasSmtpHost && hasSmtpPort) return "smtp";
  return "console";
}

function getFromAddress() {
  const email = String(process.env.MAIL_FROM || "no-reply@tiendaonline.local").trim();
  const name = String(process.env.MAIL_FROM_NAME || "TiendaOnline").trim();
  return `${name} <${email}>`;
}

function getSmtpConfig() {
  const port = Number.parseInt(String(process.env.SMTP_PORT || "587"), 10);
  const secure = toBool(process.env.SMTP_SECURE, port === 465);
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const requireAuth = toBool(process.env.SMTP_REQUIRE_AUTH, Boolean(user || pass));

  const config = {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    connectionTimeout: 10_000,
  };

  if (requireAuth) {
    return {
      ...config,
      auth: { user, pass },
    };
  }

  return config;
}

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport(getSmtpConfig());
  return cachedTransporter;
}

function canLogDevLinks() {
  return toBool(process.env.DEV_EMAIL_LINKS, process.env.NODE_ENV !== "production");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createPasswordResetTemplate({ resetLink, expiresMinutes }) {
  const safeLink = escapeHtml(resetLink);
  return {
    subject: "Restablece tu contraseña",
    text: [
      "Recibimos una solicitud para restablecer tu contraseña.",
      `Usa este enlace: ${resetLink}`,
      `Este enlace expira en ${expiresMinutes} minutos.`,
      "Si no solicitaste este cambio, ignora este mensaje.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.4;">
        <h2>Restablece tu contraseña</h2>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>
          <a href="${safeLink}" style="display:inline-block;padding:10px 16px;background:#dc3545;color:#fff;text-decoration:none;border-radius:4px;">Restablecer contraseña</a>
        </p>
        <p>Este enlace expira en <strong>${expiresMinutes} minutos</strong>.</p>
        <p>Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
    `,
  };
}

function createEmailVerificationTemplate({ verifyLink, expiresMinutes }) {
  const safeLink = escapeHtml(verifyLink);
  return {
    subject: "Verifica tu correo",
    text: [
      "Gracias por registrarte. Verifica tu correo para activar tu cuenta.",
      `Usa este enlace: ${verifyLink}`,
      `Este enlace expira en ${expiresMinutes} minutos.`,
      "Si no creaste una cuenta, ignora este mensaje.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.4;">
        <h2>Verifica tu correo</h2>
        <p>Gracias por registrarte. Verifica tu correo para activar tu cuenta.</p>
        <p>
          <a href="${safeLink}" style="display:inline-block;padding:10px 16px;background:#198754;color:#fff;text-decoration:none;border-radius:4px;">Verificar correo</a>
        </p>
        <p>Este enlace expira en <strong>${expiresMinutes} minutos</strong>.</p>
        <p>Si no creaste una cuenta, ignora este mensaje.</p>
      </div>
    `,
  };
}

async function sendEmail({ to, subject, text, html, kind, debugLink }) {
  const mode = getEmailMode();

  if (mode === "console") {
    if (canLogDevLinks() && debugLink) {
      console.log(`[DEV:${kind}] ${debugLink}`);
    }
    return { delivered: false, mode };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });

  if (canLogDevLinks() && debugLink) {
    console.log(`[DEV:${kind}] ${debugLink}`);
  }

  return { delivered: true, mode };
}

async function sendPasswordResetEmail({ to, resetLink, expiresMinutes }) {
  const template = createPasswordResetTemplate({ resetLink, expiresMinutes });
  return sendEmail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
    kind: "reset-password",
    debugLink: resetLink,
  });
}

async function sendEmailVerificationEmail({ to, verifyLink, expiresMinutes }) {
  const template = createEmailVerificationTemplate({ verifyLink, expiresMinutes });
  return sendEmail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
    kind: "verify-email",
    debugLink: verifyLink,
  });
}

module.exports = {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
};

export {};
