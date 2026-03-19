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

exports.mercadoPagoWebhook = async (req, res) => {
  try {
    const result = await paymentService.handleMercadoPagoWebhook({
      headers: req.headers,
      query: req.query,
      body: req.body,
    });
    // Mercado Pago requiere 200 OK para considerar el webhook recibido.
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("mercadoPagoWebhook error:", err);
    // Para webhooks es mejor responder 200 si es duplicado/ya procesado,
    // pero aquí solo devolvemos error cuando realmente falló.
    if (err?.status) return res.status(err.status).json({ message: err.message, detail: err.detail });
    return res.status(500).json({ message: "Error procesando webhook de Mercado Pago" });
  }
};

export {};
