// backend/routes/reportRoutes.js
// Rutas REST para reportes de ventas (dashboard, exportar Excel/PDF)

const express = require("express");
const router = express.Router();
const { getSalesReport, exportSalesReportExcel, exportSalesReportPDF } = require("../controllers/reportController");

// Solo usuarios administradores pueden ver y exportar reportes
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");

// Dashboard de ventas (JSON)
router.get("/sales", authenticateToken, authorizeRoles("ADMINISTRADOR"), getSalesReport);

// Exportar a Excel
router.get("/sales/export/excel", authenticateToken, authorizeRoles("ADMINISTRADOR"), exportSalesReportExcel);

// Exportar a PDF
router.get("/sales/export/pdf", authenticateToken, authorizeRoles("ADMINISTRADOR"), exportSalesReportPDF);

module.exports = router;
