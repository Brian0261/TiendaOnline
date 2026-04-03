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

  // --- Tolerante: si no hay secret, aceptar con warning (necesario antes de obtener la clave) ---
  if (!secret) {
    console.warn("[MP-WEBHOOK] MP_WEBHOOK_SECRET no configurado – firma no verificada (aceptando temporalmente)");
    return { verified: false, skipped: true, reason: "MP_WEBHOOK_SECRET no configurado" };
  }

  if (!signatureHeader || !requestId) {
    console.warn("[MP-WEBHOOK] Webhook sin cabeceras de firma (x-signature / x-request-id) – aceptando sin verificar");
    return { verified: false, skipped: true, reason: "Webhook sin cabeceras de firma" };
  }

  const signature = parseMercadoPagoSignature(signatureHeader);
  const ts = signature.ts;
  const receivedV1 = signature.v1;
  const resourceId = getWebhookResourceId(query, body);

  if (!ts || !receivedV1 || !resourceId) {
    console.warn("[MP-WEBHOOK] Datos insuficientes para verificar firma – aceptando sin verificar", { ts: !!ts, v1: !!receivedV1, resourceId });
    return { verified: false, skipped: true, reason: "Webhook sin datos suficientes para firma" };
  }

  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
  const expectedV1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  if (!secureCompareHex(expectedV1, receivedV1)) {
    console.warn("[MP-WEBHOOK] Firma HMAC inválida – rechazando evento", { resourceId, requestId });
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

/**
 * Detecta si la petición es un ping de prueba que Mercado Pago envía al
 * registrar/validar la URL del webhook en su dashboard.
 * Estos pings usan IDs sintéticos y no deben procesarse contra la API real.
 */
function isMpTestPing({ query, body, paymentId }) {
  // IDs sintéticos conocidos que MP usa en sus pings de validación
  const syntheticId = String(paymentId || "").trim();
  if (/^(0|test|12345|123456|1234567890?|123456789)$/i.test(syntheticId)) return true;

  // Body vacío o explícitamente de prueba
  if (!body || (typeof body === "object" && Object.keys(body).length === 0)) return true;
  if (body?.type === "test" || body?.action === "test") return true;

  // Query params de prueba
  const qTopic = String(query?.topic || "")
    .trim()
    .toLowerCase();
  const qType = String(query?.type || "")
    .trim()
    .toLowerCase();
  if (qTopic === "test" || qType === "test") return true;

  return false;
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
  const topic = String(query?.topic || query?.type || body?.type || "payment");
  const paymentId = getWebhookResourceId(query, body);
  const hasBody = body && typeof body === "object" && Object.keys(body).length > 0;
  const hasSignature = !!getHeaderValue(headers, "x-signature");

  console.log("[MP-WEBHOOK] Webhook recibido", { topic, paymentId, hasSignature, hasBody });

  // --- Detección de ping de prueba de Mercado Pago ---
  // MP envía peticiones con IDs sintéticos (123456, 12345, etc.) al registrar la URL.
  // Debemos responder 200 inmediatamente sin tocar BD ni API de MP.
  if (isMpTestPing({ query, body, paymentId })) {
    console.log("[MP-WEBHOOK] Ping de prueba detectado – respondiendo 200 OK", { paymentId, topic });
    return { ok: true, ping: true };
  }

  if (!paymentId) {
    console.log("[MP-WEBHOOK] Ignorado: sin payment id");
    return { ok: true, ignored: true, reason: "Sin payment id" };
  }

  let signatureCheck: { verified: boolean; skipped: boolean; reason?: string };
  try {
    signatureCheck = verifyMercadoPagoWebhookSignature({ headers, query, body });
  } catch (sigErr: any) {
    // Firma inválida: logueamos pero devolvemos estructura para que el controller devuelva 200
    console.warn("[MP-WEBHOOK] Verificación de firma falló:", sigErr?.message);
    throw sigErr;
  }
  console.log("[MP-WEBHOOK] Firma:", { verified: signatureCheck.verified, skipped: signatureCheck.skipped, reason: signatureCheck.reason });

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
      console.log("[MP-WEBHOOK] Evento duplicado ya procesado", { eventId });
      return { ok: true, duplicated: true };
    }
    console.log("[MP-WEBHOOK] Evento existente pero no procesado – reintentando", { eventId });
  } else {
    console.log("[MP-WEBHOOK] Evento registrado", { eventId, id: inserted.id });
  }

  // Checkout Pro a veces notifica primero como merchant_order.
  const isMerchantOrder = /merchant[_-]?order/i.test(topic);
  let resolvedPaymentId: any = paymentId;
  if (isMerchantOrder) {
    try {
      const merchantOrder = await mpGetMerchantOrder(paymentId);
      const payments = Array.isArray(merchantOrder?.payments) ? merchantOrder.payments : [];
      const approved = payments.find(p => String(p?.status || "").toLowerCase() === "approved" && p?.id);
      const fallback = payments.find(p => p?.id);
      resolvedPaymentId = (approved?.id ?? fallback?.id) || null;

      if (!resolvedPaymentId) {
        console.log("[MP-WEBHOOK] merchant_order sin payments asociados", { paymentId });
        return { ok: true, ignored: true, reason: "merchant_order sin payments" };
      }
    } catch (err: any) {
      const mpStatus = err?.detail?.status;
      const mpError = err?.detail?.error;
      if (mpStatus === 404 || mpError === "not_found") {
        console.log("[MP-WEBHOOK] merchant_order no encontrada en MP API", { paymentId });
        return { ok: true, ignored: true, reason: "merchant_order not found" };
      }
      throw err;
    }
  }

  console.log("[MP-WEBHOOK] Consultando pago en MP API", { resolvedPaymentId });
  let payment: any;
  try {
    payment = await mpGetPayment(resolvedPaymentId);
  } catch (err: any) {
    const mpStatus = err?.detail?.status;
    const mpError = err?.detail?.error;
    if (mpStatus === 404 || mpError === "not_found") {
      console.log("[MP-WEBHOOK] Payment no encontrado en MP API – posible ID ficticio", { resolvedPaymentId });
      await paymentRepository.markWebhookEventProcessed(MP_PROVIDER, eventId);
      return { ok: true, ignored: true, reason: "Payment not found" };
    }
    throw err;
  }

  const status = String(payment?.status || "");
  const externalRef = payment?.external_reference;
  const orderId = externalRef ? Number(externalRef) : NaN;

  console.log("[MP-WEBHOOK] Pago consultado", { status, externalRef, orderId, resolvedPaymentId });

  if (!Number.isFinite(orderId) || orderId <= 0) {
    console.log("[MP-WEBHOOK] Sin external_reference válido – ignorando", { externalRef });
    await paymentRepository.markWebhookEventProcessed(MP_PROVIDER, eventId);
    return { ok: true, ignored: true, reason: "Sin external_reference" };
  }

  if (status !== "approved") {
    console.log("[MP-WEBHOOK] Pago no aprobado – registrando estado", { status, orderId });
    await paymentRepository.markWebhookEventProcessed(MP_PROVIDER, eventId);
    return { ok: true, status };
  }

  const paymentValidation = await validateApprovedPayment({ payment, orderId });
  if (!paymentValidation.ok) {
    console.warn("[MP-WEBHOOK] Validación del pago falló", { reason: paymentValidation.reason, detail: paymentValidation.detail });
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

  console.log("[MP-WEBHOOK] Finalizando orden", { orderId, paymentMethodId, receiptType });

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

    console.log("[MP-WEBHOOK] Orden finalizada exitosamente", { orderId });
  } catch (err) {
    if (err?.status === 409) {
      console.log("[MP-WEBHOOK] Orden ya confirmada previamente (409) – idempotente OK", { orderId });
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

/* ──────────────────────────────────────────────────────────────
   Fase 2: Reembolso programático (QA en producción)
────────────────────────────────────────────────────────────── */

async function refundPayment({ orderId }) {
  if (!orderId || !Number.isFinite(Number(orderId)) || Number(orderId) <= 0) {
    const err: any = new Error("orderId válido requerido");
    err.status = 400;
    throw err;
  }

  const intent = await paymentRepository.getPaymentIntentByOrder(MP_PROVIDER, Number(orderId));
  if (!intent || intent.status !== "CONFIRMED" || !intent.providerPaymentId) {
    const err: any = new Error("No hay pago confirmado para reembolsar en este pedido");
    err.status = 404;
    throw err;
  }

  const accessToken = String(process.env.MP_ACCESS_TOKEN || "").trim();
  if (!accessToken) {
    const err: any = new Error("MP_ACCESS_TOKEN no configurado");
    err.status = 500;
    throw err;
  }

  console.log("[MP-REFUND] Solicitando reembolso a MP API", { orderId, providerPaymentId: intent.providerPaymentId });

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(intent.providerPaymentId)}/refunds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
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
    const msg = json?.message || json?.error || `HTTP ${res.status}`;
    console.error("[MP-REFUND] Error de MP API:", msg, json);
    const err: any = new Error(`Mercado Pago refund: ${msg}`);
    err.status = 502;
    err.detail = json;
    throw err;
  }

  console.log("[MP-REFUND] Reembolso exitoso", { orderId, refundId: json?.id, status: json?.status });

  await paymentRepository.markPaymentIntentRefunded({
    provider: MP_PROVIDER,
    orderId: Number(orderId),
  });

  return {
    ok: true,
    orderId: Number(orderId),
    refundId: json?.id || null,
    refundStatus: json?.status || null,
    amount: json?.amount || null,
  };
}

/* ──────────────────────────────────────────────────────────────
   Fase 3: Reconciliación front-to-back (fallback si webhook falla)
────────────────────────────────────────────────────────────── */

async function mpSearchPayments(externalReference) {
  const accessToken = String(process.env.MP_ACCESS_TOKEN || "").trim();
  if (!accessToken) {
    const err: any = new Error("MP_ACCESS_TOKEN no configurado");
    err.status = 500;
    throw err;
  }

  const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(String(externalReference))}&sort=date_created&criteria=desc&limit=5`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || `HTTP ${res.status}`;
    const err: any = new Error(`Mercado Pago search: ${msg}`);
    err.status = 502;
    err.detail = json;
    throw err;
  }

  return json;
}

async function checkPaymentStatus({ orderId, userId, checkoutToken }) {
  if (!orderId || !Number.isFinite(Number(orderId)) || Number(orderId) <= 0) {
    const err: any = new Error("orderId válido requerido");
    err.status = 400;
    throw err;
  }

  const numericOrderId = Number(orderId);

  // Verificar que el solicitante tiene derecho a consultar este pedido
  const numericUserId = Number(userId || 0);
  if (numericUserId > 0) {
    const order = await paymentRepository.getOrderPaymentInfo(numericOrderId);
    // Si la orden ya no está en PENDIENTE_PAGO, y el intent está CONFIRMED, devolvemos directamente
    if (!order) {
      const intent = await paymentRepository.getPaymentIntentByOrder(MP_PROVIDER, numericOrderId);
      if (intent?.status === "CONFIRMED") {
        console.log("[MP-RECONCILE] Orden ya confirmada previamente", { orderId: numericOrderId });
        return { status: "confirmed", orderId: numericOrderId };
      }
    }
    if (order && Number(order.id_usuario) !== numericUserId) {
      const err: any = new Error("No autorizado para consultar este pedido");
      err.status = 403;
      throw err;
    }
  } else {
    // Invitado: verificar checkoutToken
    if (!checkoutToken) {
      const err: any = new Error("Se requiere autenticación o token de checkout");
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

  // Verificar si ya está confirmado en payment_intent
  const intent = await paymentRepository.getPaymentIntentByOrder(MP_PROVIDER, numericOrderId);
  if (intent?.status === "CONFIRMED") {
    console.log("[MP-RECONCILE] Orden ya confirmada", { orderId: numericOrderId });
    return { status: "confirmed", orderId: numericOrderId };
  }

  // Buscar pagos aprobados en MP para esta referencia externa
  console.log("[MP-RECONCILE] Buscando pagos aprobados en MP API", { orderId: numericOrderId });
  const searchResult = await mpSearchPayments(String(numericOrderId));
  const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
  const approvedPayment = results.find(p => String(p?.status || "").toLowerCase() === "approved");

  if (!approvedPayment) {
    console.log("[MP-RECONCILE] No se encontró pago aprobado en MP", { orderId: numericOrderId, totalResults: results.length });
    return { status: "pending", orderId: numericOrderId };
  }

  console.log("[MP-RECONCILE] Pago aprobado encontrado – finalizando orden", {
    orderId: numericOrderId,
    mpPaymentId: approvedPayment.id,
    amount: approvedPayment.transaction_amount,
  });

  // Validar y finalizar como si fuera un webhook
  const paymentValidation = await validateApprovedPayment({ payment: approvedPayment, orderId: numericOrderId });
  if (!paymentValidation.ok) {
    console.warn("[MP-RECONCILE] Validación falló", { reason: paymentValidation.reason });
    return {
      status: "validation_failed",
      orderId: numericOrderId,
      reason: paymentValidation.reason,
    };
  }

  const paymentMethodId = intent?.paymentMethodId || (await paymentRepository.ensurePaymentMethodIdByName("Mercado Pago", "Checkout Pro (redirect)"));
  const receiptType = intent?.receiptType || "BOLETA";
  const receiptData = intent?.receiptData || null;

  if (!paymentMethodId) {
    const err: any = new Error("No se encontró paymentMethodId para Mercado Pago");
    err.status = 500;
    throw err;
  }

  try {
    await orderService.finalizeOrderOnPayment({ orderId: numericOrderId, receiptType, receiptData, paymentMethodId }, null, { emitToUser: null });

    await paymentRepository.markPaymentIntentConfirmed({
      provider: MP_PROVIDER,
      orderId: numericOrderId,
      providerPaymentId: String(approvedPayment.id),
    });

    console.log("[MP-RECONCILE] Orden finalizada por reconciliación", { orderId: numericOrderId });
  } catch (err) {
    if (err?.status === 409) {
      console.log("[MP-RECONCILE] Orden ya confirmada (409) – idempotente OK", { orderId: numericOrderId });
      return { status: "confirmed", orderId: numericOrderId };
    }
    throw err;
  }

  return { status: "confirmed", orderId: numericOrderId, reconciledFrom: "mp_search" };
}

module.exports = {
  initIzipay,
  mockConfirm,
  initMercadoPago,
  handleMercadoPagoWebhook,
  refundPayment,
  checkPaymentStatus,
};

export {};
