const nodemailer = require("nodemailer");

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getMailtrapApiConfig() {
  const token = String(process.env.MAILTRAP_API_TOKEN || "").trim();
  const inboxId = String(process.env.MAILTRAP_INBOX_ID || "").trim();
  const timeoutMs = toPositiveInt(process.env.MAILTRAP_API_TIMEOUT_MS, 10_000);
  const fallbackEnabled = toBool(process.env.MAILTRAP_API_FALLBACK_ENABLED, true);

  return {
    token,
    inboxId,
    timeoutMs,
    fallbackEnabled,
  };
}

function hasMailtrapApiConfig() {
  const config = getMailtrapApiConfig();
  return Boolean(config.token && config.inboxId);
}

function getEmailMode() {
  const explicit = String(process.env.EMAIL_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (explicit === "smtp") return "smtp";
  if (explicit === "mailtrap_api") return "mailtrap_api";
  if (explicit === "console") return "console";

  const hasSmtpHost = Boolean(String(process.env.SMTP_HOST || "").trim());
  const hasSmtpPort = Number.isFinite(Number.parseInt(String(process.env.SMTP_PORT || ""), 10));
  if (hasSmtpHost && hasSmtpPort) return "smtp";
  if (hasMailtrapApiConfig()) return "mailtrap_api";
  return "console";
}

function getFromParts() {
  const email = String(process.env.MAIL_FROM || "no-reply@tiendaonline.local").trim();
  const name = String(process.env.MAIL_FROM_NAME || "TiendaOnline").trim();
  return { email, name };
}

function getFromAddress() {
  const { email, name } = getFromParts();
  return `${name} <${email}>`;
}

function getSmtpConfig() {
  const port = toPositiveInt(process.env.SMTP_PORT, 587);
  const secure = toBool(process.env.SMTP_SECURE, port === 465);
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const requireAuth = toBool(process.env.SMTP_REQUIRE_AUTH, Boolean(user || pass));
  const connectionTimeout = toPositiveInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10_000);

  const config = {
    host,
    port,
    secure,
    connectionTimeout,
  };

  if (requireAuth) {
    return {
      ...config,
      auth: { user, pass },
    };
  }

  return config;
}

function getSmtpFallbackPorts(primaryPort) {
  const parsed = String(process.env.SMTP_FALLBACK_PORTS || "")
    .split(",")
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(value => Number.isFinite(value) && value > 0);

  const defaults = [2525, 587, 465];
  const combined = [primaryPort, ...parsed, ...defaults];
  const unique = [];

  for (const port of combined) {
    if (!unique.includes(port)) unique.push(port);
  }

  return unique;
}

function isRecoverableSmtpError(err) {
  const code = String(err?.code || "").toUpperCase();
  return ["ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND", "ESOCKET", "ECONNECTION"].includes(code);
}

function toRecipientList(to) {
  if (Array.isArray(to)) {
    return to
      .map(value => String(value || "").trim())
      .filter(Boolean)
      .map(email => ({ email }));
  }

  return String(to || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .map(email => ({ email }));
}

async function sendViaMailtrapApi({ to, subject, text, html }) {
  const config = getMailtrapApiConfig();
  if (!config.token || !config.inboxId) {
    throw new Error("MAILTRAP_API_TOKEN/MAILTRAP_INBOX_ID no configurados para fallback por API.");
  }

  const from = getFromParts();
  const recipients = toRecipientList(to);
  if (!recipients.length) {
    throw new Error("No hay destinatarios válidos para envío por Mailtrap API.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`https://sandbox.api.mailtrap.io/api/send/${encodeURIComponent(config.inboxId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        text,
        html,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Mailtrap API respondió ${response.status}: ${errorBody}`);
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutError = new Error("Timeout en Mailtrap API");
      (timeoutError as any).code = "ETIMEDOUT";
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendViaSmtp(message) {
  const baseConfig = getSmtpConfig();
  const ports = getSmtpFallbackPorts(baseConfig.port);
  let lastError = null;

  for (const port of ports) {
    const transporter = nodemailer.createTransport({
      ...baseConfig,
      port,
      secure: port === 465 ? true : baseConfig.secure,
    });

    try {
      await transporter.sendMail(message);
      return;
    } catch (err) {
      lastError = err;
      if (!isRecoverableSmtpError(err)) {
        throw err;
      }
      console.warn(`[emailService] SMTP falló en puerto ${port}: ${err?.code || err?.message || "UNKNOWN"}`);
    }
  }

  throw lastError || new Error("No se pudo enviar email por SMTP.");
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

  if (mode === "mailtrap_api") {
    await sendViaMailtrapApi({ to, subject, text, html });

    if (canLogDevLinks() && debugLink) {
      console.log(`[DEV:${kind}] ${debugLink}`);
    }

    return { delivered: true, mode };
  }

  try {
    await sendViaSmtp({
      from: getFromAddress(),
      to,
      subject,
      text,
      html,
    });
  } catch (smtpErr) {
    const apiConfig = getMailtrapApiConfig();
    const shouldFallbackToApi = apiConfig.fallbackEnabled && hasMailtrapApiConfig();

    if (!shouldFallbackToApi || !isRecoverableSmtpError(smtpErr)) {
      throw smtpErr;
    }

    console.warn(`[emailService] SMTP agotado; intentando Mailtrap API fallback (${smtpErr?.code || smtpErr?.message || "UNKNOWN"}).`);
    await sendViaMailtrapApi({ to, subject, text, html });
  }

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
