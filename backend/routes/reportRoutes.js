// backend/routes/reportRoutes.js
const express = require("express");
const router = express.Router();
const {
  getSalesReport,
  exportSalesReportExcel,
  exportSalesReportPDF,
  getDashboardOverview, // 👈 nuevo
} = require("../controllers/reportController");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");

// Dashboard anual
router.get("/dashboard", authenticateToken, authorizeRoles("ADMINISTRADOR"), getDashboardOverview);

// Reporte por rango
router.get("/sales", authenticateToken, authorizeRoles("ADMINISTRADOR"), getSalesReport);

// Exportaciones
router.get("/sales/export/excel", authenticateToken, authorizeRoles("ADMINISTRADOR"), exportSalesReportExcel);
router.get("/sales/export/pdf",   authenticateToken, authorizeRoles("ADMINISTRADOR"), exportSalesReportPDF);

module.exports = router;
