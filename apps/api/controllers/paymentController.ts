// backend/controllers/paymentController.js
const paymentService = require("../services/paymentService");
const { emitToUser } = require("../utils/sse");

exports.initIzipay = async (req, res) => {
  try {
    const data = await paymentService.initIzipay({
      orderId: req.body?.orderId,
      method: req.body?.method,
    });
    return res.json(data);
  } catch (err) {
    console.error("initIzipay error:", err);
    if (err?.status) return res.status(err.status).json({ message: err.message });
    return res.status(500).json({ message: "Error inicializando el pago" });
  }
};

exports.mockConfirm = async (req, res) => {
  try {
    const userId = req.user?.id_usuario || req.userId;
    const { orderId, receiptType, receiptData, paymentMethodId } = req.body || {};

    const result = await paymentService.mockConfirm({
      userId,
      orderId,
      receiptType,
      receiptData,
      paymentMethodId,
      emitToUser,
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("mockConfirm error:", err);
    if (err?.status) return res.status(err.status).json({ message: err.message });
    return res.status(500).json({ message: "No se pudo confirmar el pago (mock)" });
  }
};

exports.initMercadoPago = async (req, res) => {
  try {
    const data = await paymentService.initMercadoPago({
      userId: req.user?.id_usuario || req.userId || null,
      orderId: req.body?.orderId,
      checkoutToken: req.body?.checkoutToken,
      receiptType: req.body?.receiptType,
      receiptData: req.body?.receiptData,
    });
    return res.json(data);
  } catch (err) {
    console.error("initMercadoPago error:", err);
    if (err?.status) return res.status(err.status).json({ message: err.message, detail: err.detail });
    return res.status(500).json({ message: "Error inicializando Mercado Pago" });
  }
};

/**
 * Webhook de Mercado Pago — blindado: NUNCA devuelve 500.
 * MP penaliza URLs que acumulan errores 5xx; toda excepción se atrapa y se
 * responde 200 con { ok: false } para que MP no marque la URL como muerta.
 */
exports.mercadoPagoWebhook = async (req, res) => {
  try {
    const result = await paymentService.handleMercadoPagoWebhook({
      headers: req.headers,
      query: req.query,
      body: req.body,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[MP-WEBHOOK] Error no controlado en webhook:", err?.message, err?.status, err?.detail);
    // NUNCA 500 — respondemos 200 para proteger la URL ante MP.
    return res.status(200).json({ ok: false, reason: "internal_error" });
  }
};

/**
 * Reconciliación: el frontend consulta si un pago fue aprobado en MP
 * cuando el webhook no llegó o se perdió.
 */
exports.checkMercadoPagoStatus = async (req, res) => {
  try {
    const orderId = Number(req.query?.orderId);
    const userId = req.user?.id_usuario || req.userId || null;
    const checkoutToken = String(req.query?.checkoutToken || req.headers["x-checkout-token"] || "").trim() || null;

    const result = await paymentService.checkPaymentStatus({ orderId, userId, checkoutToken });
    return res.json(result);
  } catch (err) {
    console.error("[MP-RECONCILE] Error:", err?.message);
    if (err?.status) return res.status(err.status).json({ message: err.message });
    return res.status(500).json({ message: "Error consultando estado de pago" });
  }
};

/**
 * Reembolso programático (solo admin) — para QA en producción.
 */
exports.refundMercadoPago = async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const result = await paymentService.refundPayment({ orderId });
    return res.json(result);
  } catch (err) {
    console.error("[MP-REFUND] Error:", err?.message);
    if (err?.status) return res.status(err.status).json({ message: err.message, detail: err.detail });
    return res.status(500).json({ message: "Error procesando reembolso" });
  }
};

export {};
