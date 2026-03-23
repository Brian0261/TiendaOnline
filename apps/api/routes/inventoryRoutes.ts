// backend/routes/inventoryRoutes.js
const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const inventoryController = require("../controllers/inventoryController");

const router = express.Router();

router.get("/kpis", authenticateToken, authorizeRoles("ADMINISTRADOR"), inventoryController.getInventoryKpis);
router.get("/paginated", authenticateToken, authorizeRoles("ADMINISTRADOR"), inventoryController.getInventoryPaginated);
router.get("/inbound", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), inventoryController.getInboundInventoryPaginated);
router.post("/inbound", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), inventoryController.createInboundInventory);
router.get("/export/admin", authenticateToken, authorizeRoles("ADMINISTRADOR"), inventoryController.exportInventoryAdmin);

// Empleado o Admin pueden ver inventario
router.get("/", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), inventoryController.getInventory);
router.get("/search-dispatch", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), inventoryController.searchDispatchInventory);
router.get("/export", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), inventoryController.exportInventory);

module.exports = router;

export {};
