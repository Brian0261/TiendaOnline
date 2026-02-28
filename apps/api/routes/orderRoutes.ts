// backend/routes/orderRoutes.js

const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const orderController = require("../controllers/orderController");

const router = express.Router();

/* ──────────────────────────────────────────────────────────────
   BLOQUE: Rutas de lectura (estáticas / específicas)
   ────────────────────────────────────────────────────────────── */

// Historial de pedidos SOLO del cliente logueado
router.get("/my", authenticateToken, orderController.getMyOrders);

/* ──────────────────────────────────────────────────────────────
   BLOQUE: Checkout (cliente)  ► NUEVO
   ────────────────────────────────────────────────────────────── */

// Crear pedido (borrador) desde el carrito del usuario
// Body: { deliveryType, address, shippingCost, receiptType, receiptData, paymentMethodId }
router.post("/", authenticateToken, orderController.createDraftOrder);

// Cancelar pedido no pagado (cliente/admin)
router.patch("/:id/cancel", authenticateToken, orderController.cancelDraftOrder);

// Reembolsar pedido (solo admin)
router.patch("/:id/refund", authenticateToken, authorizeRoles("ADMINISTRADOR"), orderController.refundOrder);

/* ──────────────────────────────────────────────────────────────
   BLOQUE: Exportaciones para EMPLEADO/ADMIN
   ────────────────────────────────────────────────────────────── */
router.get("/pending/export", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.exportPendingOrders);
router.get("/status-log/export", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.exportStatusLog);

// Lista de pedidos pendientes (EMPLEADO o ADMIN)
router.get("/pending", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.getPendingOrders);

// Pedidos que pueden cambiar de estado (PREPARADO / EN CAMINO)
router.get("/transitionable", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.getTransitionable);

router.get("/status-log", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.getStatusLog);

router.get("/kpis", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.getEmployeeKpis);

// Todas las rutas protegidas SOLO para ADMINISTRADOR
router.get("/", authenticateToken, authorizeRoles("ADMINISTRADOR"), orderController.getOrders);
router.get("/export", authenticateToken, authorizeRoles("ADMINISTRADOR"), orderController.exportOrders);

/* ──────────────────────────────────────────────────────────────
   BLOQUE: Acciones masivas
   ────────────────────────────────────────────────────────────── */
router.patch("/prepare-bulk", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.markOrdersPreparedBulk);

/* ──────────────────────────────────────────────────────────────
   BLOQUE: Acciones por pedido (ESPECÍFICAS)  ► antes de "/:id"
   ────────────────────────────────────────────────────────────── */
router.patch("/:id/prepare", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.markOrderPrepared);

// 👇 AÑADIDA AQUÍ: más específica que "/:id"
router.patch("/:id/transition", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.transitionOrder);

// Finalizar pedido tras pago (webhook/mock); el controller devuelve una promesa
router.post("/:id/finalize", authenticateToken, async (req, res) => {
  try {
    const result = await orderController.finalizeOrderOnPayment({
      orderId: +req.params.id,
      userId: req.user?.id_usuario || req.userId,
      receiptType: req.body.receiptType,
      receiptData: req.body.receiptData,
      paymentMethodId: req.body.paymentMethodId,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "No se pudo finalizar el pedido" });
  }
});

/* ──────────────────────────────────────────────────────────────
   BLOQUE: Lectura por id (GENÉRICA)  ► al final
   ────────────────────────────────────────────────────────────── */
router.get("/:id", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), orderController.getOrderById);

module.exports = router;

export {};
