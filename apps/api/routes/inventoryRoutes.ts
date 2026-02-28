// backend/routes/inventoryRoutes.js
const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const inventoryController = require("../controllers/inventoryController");

const router = express.Router();

// Empleado o Admin pueden ver inventario
router.get("/", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), inventoryController.getInventory);
router.get("/export", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), inventoryController.exportInventory);

module.exports = router;

export {};
