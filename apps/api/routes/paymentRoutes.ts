// backend/routes/paymentRoutes.js
const express = require("express");
const { authenticateToken, optionalAuthenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const paymentCtrl = require("../controllers/paymentController");

const router = express.Router();

router.post("/izipay/init", authenticateToken, paymentCtrl.initIzipay);
router.post("/izipay/mock-confirm", authenticateToken, paymentCtrl.mockConfirm);

// Mercado Pago (Checkout Pro)
router.post("/mercadopago/init", optionalAuthenticateToken, paymentCtrl.initMercadoPago);

// Webhook: GET + POST para aceptar pings de validación de MP y notificaciones reales
router.get("/mercadopago/webhook", paymentCtrl.mercadoPagoWebhook);
router.post("/mercadopago/webhook", paymentCtrl.mercadoPagoWebhook);

// Reconciliación: el frontend consulta si un pago fue aprobado cuando el webhook no llegó
router.get("/mercadopago/status", optionalAuthenticateToken, paymentCtrl.checkMercadoPagoStatus);

// Reembolso programático (solo admin, para QA en producción)
router.post("/mercadopago/refund", authenticateToken, authorizeRoles("ADMINISTRADOR"), paymentCtrl.refundMercadoPago);

module.exports = router;

export {};
