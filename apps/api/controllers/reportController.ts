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
   Exportaciones existentes (Excel/PDF)
========================================================= */
exports.exportSalesReportExcel = async (req, res) => {
  try {
    const datos = await reportService.getSalesReport({
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
    });
    const { fechaInicio, fechaFin } = datos;

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Reporte de Ventas");

    ws.addRow([`Reporte de Ventas (${fechaInicio} a ${fechaFin})`]);
    ws.addRow([]);
    ws.addRow(["Total Ventas", datos?.totalVentas ?? 0]);
    ws.addRow(["Pedidos Completados", datos?.pedidosCompletados ?? 0]);
    ws.addRow([]);

    ws.addRow(["Top 5 Productos"]);
    ws.addRow(["Nombre", "Cantidad", "Total"]);
    (datos?.topProductos || []).forEach(p => ws.addRow([p.nombre, p.cantidad, p.total]));
    ws.addRow([]);

    ws.addRow(["Métodos de Pago"]);
    ws.addRow(["Método", "Cantidad"]);
    (datos?.topMetodosPago || []).forEach(m => ws.addRow([m.nombre, m.cantidad]));

    res.setHeader("Content-Disposition", `attachment; filename="reporte-ventas-${fechaInicio}_a_${fechaFin}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error exportando reporte Excel:", err);
    if (err?.status) {
      return res.status(err.status).json({ message: err.message || "Error al exportar el reporte." });
    }
    return res.status(500).json({ message: "Error al exportar el reporte." });
  }
};

exports.exportSalesReportPDF = async (req, res) => {
  try {
    const datos = await reportService.getSalesReport({
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
    });
    const { fechaInicio, fechaFin } = datos;

    const PDFDocument = require("pdfkit-table");
    const doc = new PDFDocument();

    res.setHeader("Content-Disposition", `attachment; filename="reporte-ventas-${fechaInicio}_a_${fechaFin}.pdf"`);
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    doc.fontSize(16).text(`Reporte de Ventas`, { align: "center" });
    doc.fontSize(10).text(`Desde: ${fechaInicio}  Hasta: ${fechaFin}\n\n`);

    doc.fontSize(12).text(`Total Ventas: S/ ${datos?.totalVentas ?? 0}`);
    doc.fontSize(12).text(`Pedidos Completados: ${datos?.pedidosCompletados ?? 0}`);
    doc.moveDown();

    doc.fontSize(12).text("Top 5 Productos");
    doc.table(
      {
        headers: ["Nombre", "Cantidad", "Total"],
        rows: (datos?.topProductos || []).map(p => [p.nombre, p.cantidad, "S/ " + p.total]),
      },
      { width: 500 }
    );
    doc.moveDown();

    doc.fontSize(12).text("Métodos de Pago");
    doc.table(
      {
        headers: ["Método", "Cantidad"],
        rows: (datos?.topMetodosPago || []).map(m => [m.nombre, m.cantidad]),
      },
      { width: 300 }
    );
    doc.end();
  } catch (err) {
    console.error("Error exportando reporte PDF:", err);
    if (err?.status) {
      return res.status(err.status).json({ message: err.message || "Error al exportar el reporte." });
    }
    return res.status(500).json({ message: "Error al exportar el reporte." });
  }
};

export {};
