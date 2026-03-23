// backend/routes/reportRoutes.js
const express = require("express");
const router = express.Router();
const { getSalesReport, exportSalesReportCsv, getDashboardOverview } = require("../controllers/reportController");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");

// Dashboard anual
router.get("/dashboard", authenticateToken, authorizeRoles("ADMINISTRADOR"), getDashboardOverview);

// Reporte por rango
router.get("/sales", authenticateToken, authorizeRoles("ADMINISTRADOR"), getSalesReport);

// Exportaciones
router.get("/sales/export/csv", authenticateToken, authorizeRoles("ADMINISTRADOR"), exportSalesReportCsv);

module.exports = router;

export {};
