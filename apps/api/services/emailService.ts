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

function getBrandName() {
  return String(process.env.MAIL_FROM_NAME || "TiendaOnline").trim();
}

function getRequestTimestamp() {
  const now = new Date();
  return now.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createEmailCard({ preheader, title, intro, ctaLabel, ctaLink, ctaColor, expiresMinutes, securityText }) {
  const brand = escapeHtml(getBrandName());
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeLabel = escapeHtml(ctaLabel);
  const safeLink = escapeHtml(ctaLink);
  const safePreheader = escapeHtml(preheader);
  const safeSecurity = escapeHtml(securityText);

  return `
    <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${safePreheader}</div>
    <div style="background:#f3f5f7;padding:20px 12px;font-family:Arial,sans-serif;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e7ebef;border-radius:10px;overflow:hidden;">
        <div style="background:#111827;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:700;">${brand}</div>
        <div style="padding:22px 20px 10px;">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#111827;">${safeTitle}</h1>
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.55;">${safeIntro}</p>
          <div style="margin:18px 0 14px;">
            <a href="${safeLink}" style="display:inline-block;background:${ctaColor};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:15px;">${safeLabel}</a>
          </div>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;line-height:1.5;">Este enlace expira en <strong>${expiresMinutes} minutos</strong>.</p>
          <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.5;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
          <div style="background:#f8fafc;border:1px solid #dbe4ee;border-radius:6px;padding:10px 12px;margin:0 0 16px;word-break:break-all;font-size:13px;line-height:1.5;color:#0f172a;">
            ${safeLink}
          </div>
          <p style="margin:0;color:#475569;font-size:13px;line-height:1.5;">${safeSecurity}</p>
        </div>
        <div style="border-top:1px solid #e7ebef;padding:12px 20px 16px;color:#64748b;font-size:12px;line-height:1.5;">
          Correo automático de ${brand}. No respondas a este mensaje.
        </div>
      </div>
    </div>
  `;
}

function createPasswordResetTemplate({ resetLink, expiresMinutes }) {
  const requestedAt = getRequestTimestamp();
  return {
    subject: `${getBrandName()} | Restablece tu contraseña`,
    text: [
      `${getBrandName()} - Restablece tu contraseña`,
      "",
      "Recibimos una solicitud para restablecer tu contraseña.",
      `Fecha de solicitud: ${requestedAt} (GMT-5).`,
      "",
      "Usa este enlace:",
      `${resetLink}`,
      "",
      `Este enlace expira en ${expiresMinutes} minutos.`,
      "Si no solicitaste este cambio, ignora este mensaje y revisa la seguridad de tu cuenta.",
      "",
      `Correo automático de ${getBrandName()}.`,
    ].join("\n"),
    html: createEmailCard({
      preheader: `Usa este enlace para restablecer tu contraseña. Expira en ${expiresMinutes} minutos.`,
      title: "Restablece tu contraseña",
      intro: `Recibimos una solicitud para restablecer tu contraseña el ${requestedAt} (GMT-5).`,
      ctaLabel: "Restablecer contraseña",
      ctaLink: resetLink,
      ctaColor: "#dc3545",
      expiresMinutes,
      securityText: "Si no solicitaste este cambio, ignora este mensaje y considera actualizar tu contraseña actual.",
    }),
  };
}

function createEmailVerificationTemplate({ verifyLink, expiresMinutes }) {
  const requestedAt = getRequestTimestamp();
  return {
    subject: `${getBrandName()} | Verifica tu correo`,
    text: [
      `${getBrandName()} - Verificación de correo`,
      "",
      "Gracias por registrarte. Verifica tu correo para activar tu cuenta.",
      `Fecha de solicitud: ${requestedAt} (GMT-5).`,
      "",
      "Usa este enlace:",
      `${verifyLink}`,
      "",
      `Este enlace expira en ${expiresMinutes} minutos.`,
      "Si no creaste una cuenta, ignora este mensaje.",
      "",
      `Correo automático de ${getBrandName()}.`,
    ].join("\n"),
    html: createEmailCard({
      preheader: `Verifica tu correo para activar tu cuenta. Expira en ${expiresMinutes} minutos.`,
      title: "Verifica tu correo",
      intro: `Gracias por registrarte. Solicitud generada el ${requestedAt} (GMT-5).`,
      ctaLabel: "Verificar correo",
      ctaLink: verifyLink,
      ctaColor: "#198754",
      expiresMinutes,
      securityText: "Si no creaste una cuenta, ignora este mensaje sin hacer clic en el enlace.",
    }),
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
