// backend/routes/auditRoutes.js
const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const auditController = require("../controllers/auditController");

const router = express.Router();

// Admin/Empleado pueden ver auditoría
router.get("/historial", authenticateToken, authorizeRoles("ADMINISTRADOR", "EMPLEADO"), auditController.getHistorial);

module.exports = router;

export {};
