const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const deliveryController = require("../controllers/deliveryController");

const router = express.Router();

router.get("/riders", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), deliveryController.listRiders);
router.get("/queue", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), deliveryController.listAssignable);
router.patch("/assign", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), deliveryController.assignShipment);

router.get("/my-shipments", authenticateToken, authorizeRoles("REPARTIDOR"), deliveryController.listMyShipments);
router.patch("/:orderId/start-route", authenticateToken, authorizeRoles("REPARTIDOR"), deliveryController.startRoute);
router.patch("/:orderId/deliver", authenticateToken, authorizeRoles("REPARTIDOR"), deliveryController.markDelivered);
router.patch("/:orderId/fail", authenticateToken, authorizeRoles("REPARTIDOR"), deliveryController.markFailed);

module.exports = router;

export {};
