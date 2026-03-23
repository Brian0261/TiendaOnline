const paymentRepository = require("../repositories/paymentRepository");
const orderService = require("./orderService");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { JWT_SECRET } = require("../config/auth.config");

const MP_PROVIDER = "mercadopago";

function getWebBaseUrl() {
  return String(process.env.WEB_BASE_URL || process.env.PUBLIC_WEB_BASE_URL || process.env.PUBLIC_BASE_URL || "http://localhost:8080")
    .trim()
    .replace(/\/$/, "");
}

function isTestAccessToken(token) {
  return typeof token === "string" && /^TEST-/.test(token.trim());
}

function isRuntimeProduction() {
  return (
    String(process.env.NODE_ENV || "")
      .trim()
      .toLowerCase() === "production"
  );
}

function shouldUseSandbox() {
  const env = String(process.env.MP_ENV || "")
    .trim()
    .toLowerCase();
  if (env === "sandbox" || env === "test") return true;
  if (env === "prod" || env === "production" || env === "live") return false;
  if (String(process.env.MP_USE_SANDBOX || "").trim() === "1") return true;
  if (String(process.env.MP_USE_SANDBOX || "").trim() === "0") return false;
  if (isTestAccessToken(process.env.MP_ACCESS_TOKEN)) return true;
  // En dev, por defecto usamos sandbox para poder pagar con tarjetas/usuarios de prueba.
  return String(process.env.NODE_ENV || "").trim() !== "production";
}

function assertRealGatewayConfig() {
  const env = String(process.env.MP_ENV || "")
    .trim()
    .toLowerCase();
  const sandboxFlag = String(process.env.MP_USE_SANDBOX || "").trim();

  if (isRuntimeProduction() && (env === "sandbox" || env === "test" || sandboxFlag === "1")) {
    const err: any = new Error("Sandbox está deshabilitado con NODE_ENV=production. Ajusta MP_ENV=production y quita MP_USE_SANDBOX (o usa 0).");
    err.status = 500;
    throw err;
  }

  const accessToken = String(process.env.MP_ACCESS_TOKEN || "").trim();
  if (shouldUseSandbox()) return;

  if (!accessToken) {
    const err: any = new Error("Configura MP_ACCESS_TOKEN productivo para habilitar pagos reales.");
    err.status = 500;
    throw err;
  }

  if (isTestAccessToken(accessToken)) {
    const err: any = new Error("MP_ACCESS_TOKEN es de prueba. En producción debes usar credenciales reales de Mercado Pago.");
    err.status = 500;
    throw err;
  }

  // Si no estamos en sandbox, ya validamos token real. No se requieren más checks aquí.
}

function getHeaderValue(headers, headerName) {
  if (!headers || typeof headers !== "object") return "";
  const direct = headers[headerName];
  if (Array.isArray(direct)) return String(direct[0] || "").trim();
  if (direct != null) return String(direct).trim();

  const lowerKey = Object.keys(headers).find(key => key.toLowerCase() === headerName.toLowerCase());
  if (!lowerKey) return "";

  const value = headers[lowerKey];
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return value == null ? "" : String(value).trim();
}

function parseMercadoPagoSignature(signatureHeader) {
  return String(signatureHeader || "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce(
      (acc, entry) => {
        const [rawKey, rawValue] = entry.split("=", 2);
        const key = String(rawKey || "")
          .trim()
          .toLowerCase();
        const value = String(rawValue || "").trim();
        if (key) acc[key] = value;
        return acc;
      },
      {} as Record<string, string>,
    );
}

function getWebhookResourceId(query, body) {
  return query?.["data.id"] || query?.id || body?.data?.id || body?.id || null;
}

function secureCompareHex(left, right) {
  const leftBuffer = Buffer.from(
    String(left || "")
      .trim()
      .toLowerCase(),
    "utf8",
  );
  const rightBuffer = Buffer.from(
    String(right || "")
      .trim()
      .toLowerCase(),
    "utf8",
  );
  if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyMercadoPagoWebhookSignature({ headers, query, body }) {
  const secret = String(process.env.MP_WEBHOOK_SECRET || "").trim();
  const signatureHeader = getHeaderValue(headers, "x-signature");
  const requestId = getHeaderValue(headers, "x-request-id");

  if (!secret) {
    if (shouldUseSandbox()) return { verified: false, skipped: true, reason: "MP_WEBHOOK_SECRET no configurado" };
    const err: any = new Error("MP_WEBHOOK_SECRET no configurado para validar webhooks reales de Mercado Pago.");
    err.status = 500;
    throw err;
  }

  if (!signatureHeader || !requestId) {
    if (shouldUseSandbox()) return { verified: false, skipped: true, reason: "Webhook sin cabeceras de firma" };
    const err: any = new Error("Webhook de Mercado Pago sin cabeceras de firma requeridas.");
    err.status = 401;
    throw err;
  }

  const signature = parseMercadoPagoSignature(signatureHeader);
  const ts = signature.ts;
  const receivedV1 = signature.v1;
  const resourceId = getWebhookResourceId(query, body);

  if (!ts || !receivedV1 || !resourceId) {
    if (shouldUseSandbox()) return { verified: false, skipped: true, reason: "Webhook sin datos suficientes para firma" };
    const err: any = new Error("Webhook de Mercado Pago sin datos suficientes para validar la firma.");
    err.status = 401;
    throw err;
  }

  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
  const expectedV1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  if (!secureCompareHex(expectedV1, receivedV1)) {
    const err: any = new Error("Firma inválida en webhook de Mercado Pago.");
    err.status = 401;
    throw err;
  }

  return { verified: true, skipped: false };
}

async function validateApprovedPayment({ payment, orderId }) {
  const order = await paymentRepository.getOrderPaymentInfo(orderId);
  if (!order) {
    return { ok: true, skipped: true, reason: "Pedido ya no está pendiente" };
  }

  const transactionAmount = Number(payment?.transaction_amount || 0);
  const expectedAmount = Number(order.total_pedido || 0);
  if (!Number.isFinite(transactionAmount) || Math.abs(transactionAmount - expectedAmount) > 0.01) {
    return {
      ok: false,
      reason: "Monto aprobado distinto al total del pedido",
      detail: { expectedAmount, transactionAmount },
    };
  }

  const currency = String(payment?.currency_id || "")
    .trim()
    .toUpperCase();
  if (currency && currency !== "PEN") {
    return {
      ok: false,
      reason: "Moneda no permitida para el pedido",
      detail: { currency },
    };
  }

  if (!shouldUseSandbox() && payment?.live_mode === false) {
    return {
      ok: false,
      reason: "El pago recibido no corresponde a credenciales reales",
      detail: { live_mode: payment?.live_mode },
    };
  }

  return { ok: true };
}

function pickInitPoint(pref) {
  // Mercado Pago devuelve init_point (producción) y sandbox_init_point (sandbox)
  const prod = pref?.init_point;
  const sandbox = pref?.sandbox_init_point;

  const preferSandbox = shouldUseSandbox();
  const first = preferSandbox ? sandbox : prod;
  const second = preferSandbox ? prod : sandbox;

  return (typeof first === "string" && first) || (typeof second === "string" && second) || null;
}

async function mpCreatePreference({ orderId, items, notificationUrl, backUrls }) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    const err: any = new Error("MP_ACCESS_TOKEN no configurado");
    err.status = 500;
    throw err;
  }

  const body: any = {
    external_reference: String(orderId),
    items,
    back_urls: backUrls,
  };

  // Mercado Pago puede rechazar auto_return si back_urls.success no es https.
  const successUrl = backUrls?.success;
  if (typeof successUrl === "string" && successUrl.startsWith("https://")) {
    body.auto_return = "approved";
  }
  if (notificationUrl) body.notification_url = notificationUrl;

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || (typeof text === "string" && text.trim() ? text : null) || `HTTP ${res.status}`;
    const err: any = new Error(`Mercado Pago: ${msg}`);
    err.status = 502;
    err.detail = json;
    throw err;
  }

  return json;
}

async function mpGetPayment(paymentId) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    const err: any = new Error("MP_ACCESS_TOKEN no configurado");
    err.status = 500;
    throw err;
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || (typeof text === "string" && text.trim() ? text : null) || `HTTP ${res.status}`;
    const err: any = new Error(`Mercado Pago: ${msg}`);
    err.status = 502;
    err.detail = json;
    throw err;
  }

  return json;
}

async function mpGetMerchantOrder(merchantOrderId) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    const err: any = new Error("MP_ACCESS_TOKEN no configurado");
    err.status = 500;
    throw err;
  }

  const res = await fetch(`https://api.mercadopago.com/merchant_orders/${encodeURIComponent(String(merchantOrderId))}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || (typeof text === "string" && text.trim() ? text : null) || `HTTP ${res.status}`;
    const err: any = new Error(`Mercado Pago: ${msg}`);
    err.status = 502;
    err.detail = json;
    throw err;
  }

  return json;
}

async function initIzipay({ orderId, method }) {
  if (!orderId) {
    const err = new Error("orderId requerido");
    (err as any).status = 400;
    throw err;
  }

  const order = await paymentRepository.getOrderPaymentInfo(orderId);
  if (!order) {
    const err = new Error("Pedido no encontrado");
    (err as any).status = 404;
    throw err;
  }

  const hasCreds = !!(process.env.IZIPAY_API_KEY && process.env.IZIPAY_API_SECRET);
  if (!hasCreds || process.env.IZIPAY_ENV === "mock") {
    return { mode: "mock", orderId: order.id_pedido, total: order.total_pedido, method: method || "TARJETA" };
  }

  // TODO: integrar Izipay real (Hosted/Embedded) y devolver redirectUrl o token
  return { mode: "mock", orderId: order.id_pedido, total: order.total_pedido, method: method || "TARJETA" };
}

async function initMercadoPago({ userId, orderId, checkoutToken, receiptType, receiptData }) {
  assertRealGatewayConfig();

  if (!orderId) {
    const err: any = new Error("orderId requerido");
    err.status = 400;
    throw err;
  }

  const order = await paymentRepository.getOrderPaymentInfo(orderId);
  const numericOrderId = Number(orderId);
  const requesterUserId = Number(userId || 0);

  if (requesterUserId > 0) {
    if (Number(order.id_usuario) !== requesterUserId) {
      const err: any = new Error("No autorizado para iniciar pago de este pedido");
      err.status = 403;
      throw err;
    }
  } else {
    if (!checkoutToken) {
      const err: any = new Error("Se requiere token de checkout para pago invitado");
      err.status = 401;
      throw err;
    }

    let payload: any;
    try {
      payload = jwt.verify(String(checkoutToken), JWT_SECRET);
    } catch {
      const err: any = new Error("Token de checkout inválido o expirado");
      err.status = 401;
      throw err;
    }

    if (payload?.kind !== "guest_checkout" || Number(payload?.orderId) !== numericOrderId) {
      const err: any = new Error("Token de checkout no corresponde al pedido");
      err.status = 401;
      throw err;
    }
  }

  if (!order) {
    const err: any = new Error("Pedido no encontrado o no está en PENDIENTE_PAGO");
    err.status = 404;
    throw err;
  }

  const paymentMethodId = await paymentRepository.ensurePaymentMethodIdByName("Mercado Pago", "Checkout Pro (redirect)");
  if (!paymentMethodId) {
    const err: any = new Error("Método de pago 'Mercado Pago' no existe en BD");
    err.status = 500;
    throw err;
  }

  const webBase = getWebBaseUrl();
  const backUrls = {
    success: `${webBase}/dashboard/customer?tab=orders`,
    pending: `${webBase}/dashboard/customer?tab=orders`,
    failure: `${webBase}/checkout?error=payment`,
  };

  // Si estás en local con ngrok, define MP_WEBHOOK_URL con la URL pública completa.
  // Si no, puedes configurar el webhook desde el dashboard de Mercado Pago.
  const notificationUrl = process.env.MP_WEBHOOK_URL || null;

  const orderItems = await paymentRepository.getOrderItemsForPayment(orderId);
  const items = (orderItems?.length ? orderItems : [{ nombre: `Pedido #${orderId}`, cantidad: 1, precio: Number(order.total_pedido || 0) }])
    .filter(it => it && it.cantidad > 0)
    .map(it => ({
      title: String(it.nombre || `Pedido #${orderId}`).slice(0, 120),
      quantity: Number(it.cantidad || 1),
      unit_price: Number(it.precio || 0),
      currency_id: "PEN",
    }));

  if (!items.length) {
    const err: any = new Error("No se pudo construir items para Mercado Pago");
    err.status = 400;
    throw err;
  }

  const pref = await mpCreatePreference({
    orderId,
    items,
    notificationUrl,
    backUrls,
  });

  const initPoint = pickInitPoint(pref);
  if (!initPoint) {
    const err: any = new Error("Mercado Pago no devolvió init_point");
    err.status = 502;
    err.detail = pref;
    throw err;
  }

  await paymentRepository.upsertPaymentIntent({
    provider: MP_PROVIDER,
    orderId: Number(orderId),
    paymentMethodId,
    preferenceId: pref?.id ? String(pref.id) : null,
    initPoint,
    receiptType: receiptType === "FACTURA" ? "FACTURA" : "BOLETA",
    receiptData: receiptData || null,
  });

  return {
    mode: "redirect",
    provider: MP_PROVIDER,
    orderId: Number(orderId),
    preferenceId: pref?.id ? String(pref.id) : null,
    redirectUrl: initPoint,
  };
}

async function handleMercadoPagoWebhook({ headers, query, body }) {
  // Mercado Pago puede enviar: ?topic=payment&id=123 o body: { type, data: { id } }
  const topic = String(query?.topic || query?.type || body?.type || "payment");
  const paymentId = getWebhookResourceId(query, body);
  if (!paymentId) {
    // Responder 200 para no reintentar indefinidamente si vino sin payload útil.
    return { ok: true, ignored: true, reason: "Sin payment id" };
  }

  const signatureCheck = verifyMercadoPagoWebhookSignature({ headers, query, body });

  const eventId = `${topic}:${paymentId}`;
  const rawBody = (() => {
    try {
      return body ? JSON.stringify(body) : null;
    } catch {
      return null;
    }
  })();

  const inserted = await paymentRepository.insertWebhookEventIfNew({
    provider: MP_PROVIDER,
    eventId,
    paymentId: String(paymentId),
    rawBody,
  });

  if (!inserted.inserted) {
    const existing = await paymentRepository.getWebhookEvent(MP_PROVIDER, eventId);
    if (existing?.processedAt) {
      return { ok: true, duplicated: true };
    }
    // Si existe pero no está procesado, continuamos (reintento seguro).
  }

  // Checkout Pro a veces notifica primero como merchant_order. En ese caso debemos resolver el payment_id real.
  const isMerchantOrder = /merchant[_-]?order/i.test(topic);
  let resolvedPaymentId: any = paymentId;
  if (isMerchantOrder) {
    try {
      const merchantOrder = await mpGetMerchantOrder(paymentId);
      const payments = Array.isArray(merchantOrder?.payments) ? merchantOrder.payments : [];
      const approved = payments.find(p => String(p?.status || "").toLowerCase() === "approved" && p?.id);
      const fallback = payments.find(p => p?.id);
      resolvedPaymentId = (approved?.id ?? fallback?.id) || null;

      // Si todavía no hay pagos asociados, no marcamos el evento como procesado para permitir reintentos.
      if (!resolvedPaymentId) {
        return { ok: true, ignored: true, reason: "merchant_order sin payments" };
      }
    } catch (err: any) {
      const mpStatus = err?.detail?.status;
      const mpError = err?.detail?.error;
      // Si MP dice que no existe, lo ignoramos sin marcar procesado (puede llegar luego otro evento válido).
      if (mpStatus === 404 || mpError === "not_found") {
        return { ok: true, ignored: true, reason: "merchant_order not found" };
      }
      throw err;
    }
  }

  let payment: any;
  try {
    payment = await mpGetPayment(resolvedPaymentId);
  } catch (err: any) {
    // En el simulador de Mercado Pago suele venir un paymentId ficticio (p.ej. 123456) y MP responde 404.
    // Respondemos 200 para que MP no marque la URL como fallida ni reintente en bucle.
    const mpStatus = err?.detail?.status;
    const mpError = err?.detail?.error;
    if (mpStatus === 404 || mpError === "not_found") {
      await paymentRepository.markWebhookEventProcessed(MP_PROVIDER, eventId);
      return { ok: true, ignored: true, reason: "Payment not found" };
    }
    throw err;
  }
  const status = String(payment?.status || "");
  const externalRef = payment?.external_reference;
  const orderId = externalRef ? Number(externalRef) : NaN;

  if (!Number.isFinite(orderId) || orderId <= 0) {
    // Marcamos procesado para evitar loops si viene mal.
    await paymentRepository.markWebhookEventProcessed(MP_PROVIDER, eventId);
    return { ok: true, ignored: true, reason: "Sin external_reference" };
  }

  // Solo confirmamos cuando está aprobado.
  if (status !== "approved") {
    await paymentRepository.markWebhookEventProcessed(MP_PROVIDER, eventId);
    return { ok: true, status };
  }

  const paymentValidation = await validateApprovedPayment({ payment, orderId });
  if (!paymentValidation.ok) {
    await paymentRepository.markWebhookEventProcessed(MP_PROVIDER, eventId);
    return {
      ok: true,
      ignored: true,
      reason: paymentValidation.reason,
      detail: paymentValidation.detail || null,
    };
  }

  const intent = await paymentRepository.getPaymentIntentByOrder(MP_PROVIDER, orderId);
  const paymentMethodId = intent?.paymentMethodId || (await paymentRepository.ensurePaymentMethodIdByName("Mercado Pago", "Checkout Pro (redirect)"));

  const receiptType = intent?.receiptType || "BOLETA";
  const receiptData = intent?.receiptData || null;

  if (!paymentMethodId) {
    const err: any = new Error("No se encontró paymentMethodId para Mercado Pago");
    err.status = 500;
    throw err;
  }

  try {
    await orderService.finalizeOrderOnPayment(
      {
        orderId,
        receiptType,
        receiptData,
        paymentMethodId,
      },
      null,
      { emitToUser: null },
    );

    await paymentRepository.markPaymentIntentConfirmed({
      provider: MP_PROVIDER,
      orderId,
      providerPaymentId: String(resolvedPaymentId),
    });
  } catch (err) {
    // Idempotencia: si ya fue confirmado antes, lo tratamos como OK.
    if (err?.status === 409) {
      // ya no está PENDIENTE_PAGO
    } else {
      throw err;
    }
  } finally {
    await paymentRepository.markWebhookEventProcessed(MP_PROVIDER, eventId);
  }

  return { ok: true, status: "approved", orderId, signatureVerified: signatureCheck.verified };
}

async function mockConfirm({ userId, orderId, receiptType, receiptData, paymentMethodId, emitToUser }) {
  if (!orderId) {
    const err = new Error("orderId requerido");
    (err as any).status = 400;
    throw err;
  }

  const payload = {
    orderId,
    userId,
    receiptType,
    receiptData,
    paymentMethodId,
  };

  // orderService ya soporta SSE vía emitToUser
  return orderService.finalizeOrderOnPayment(payload, null, { emitToUser });
}

module.exports = {
  initIzipay,
  mockConfirm,
  initMercadoPago,
  handleMercadoPagoWebhook,
};

export {};
