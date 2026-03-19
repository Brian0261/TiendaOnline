// backend/controllers/reportController.js
const reportService = require("../services/reportService");

/* ======================= DASHBOARD (YTD + 12m) ======================= */
/* GET /api/reports/dashboard?year=2025 */
exports.getDashboardOverview = async (req, res) => {
  try {
    const data = await reportService.getDashboardOverview({ year: req.query.year });
    return res.json(data);
  } catch (err) {
    console.error("Error en getDashboardOverview:", err);
    return res.status(500).json({ message: "Error al generar el dashboard." });
  }
};

/* =================== REPORTE POR RANGO (ya lo tenías) =================== */
exports.getSalesReport = async (req, res) => {
  try {
    const data = await reportService.getSalesReport({
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
    });

    return res.json({
      totalVentas: data.totalVentas,
      pedidosCompletados: data.pedidosCompletados,
      topProductos: data.topProductos,
      topMetodosPago: data.topMetodosPago,
    });
  } catch (err) {
    console.error("Error en getSalesReport:", err);
    if (err?.status) {
      return res.status(err.status).json({ message: err.message || "Error al generar el reporte de ventas." });
    }
    return res.status(500).json({ message: "Error al generar el reporte de ventas." });
  }
};

/* =========================================================
   Exportación CSV del reporte de ventas
========================================================= */
exports.exportSalesReportCsv = async (req, res) => {
  try {
    const { filename, csv } = await reportService.exportSalesReportCsv({
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
    });
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    console.error("exportSalesReportCsv:", err);
    const status = (err as any)?.status || 500;
    return res.status(status).json({ message: (err as any)?.message || "Error al exportar el reporte." });
  }
};

export {};
