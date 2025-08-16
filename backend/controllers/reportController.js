// backend/controllers/reportController.js

const { sql, poolPromise } = require("../config/db.config");

// Formatea fechas a 'YYYY-MM-DD'
function formatDate(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

/**
 * Dashboard de ventas (ADMIN)
 * Devuelve:
 * - totalVentas: Monto total vendido
 * - pedidosCompletados: Número de pedidos completados
 * - topProductos: Top 5 productos más vendidos [{nombre, cantidad, total}]
 * - topMetodosPago: Métodos de pago usados [{nombre, cantidad}]
 * Requiere: fechaInicio, fechaFin en query
 */
exports.getSalesReport = async (req, res) => {
  try {
    let { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: "Debes indicar el rango de fechas." });
    }

    fechaInicio = formatDate(fechaInicio);
    fechaFin = formatDate(fechaFin);

    const pool = await poolPromise;

    // 1. Total de ventas y pedidos completados (estado ENTREGADO)
    const ventas = await pool.request().input("fechaInicio", sql.Date, fechaInicio).input("fechaFin", sql.Date, fechaFin).query(`
        SELECT
          ISNULL(SUM(total_pedido), 0) AS totalVentas,
          COUNT(*) AS cantidadPedidos
        FROM PEDIDO
        WHERE estado_pedido = 'ENTREGADO'
          AND CAST(fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin
      `);
    const { totalVentas, cantidadPedidos } = ventas.recordset[0];

    // 2. Top 5 productos más vendidos (por cantidad)
    const topProductos = await pool.request().input("fechaInicio", sql.Date, fechaInicio).input("fechaFin", sql.Date, fechaFin).query(`
        SELECT TOP 5
          P.nombre_producto AS nombre,
          SUM(DP.cantidad) AS cantidad,
          SUM(DP.subtotal) AS total
        FROM DETALLE_PEDIDO DP
        INNER JOIN PEDIDO PE ON DP.id_pedido = PE.id_pedido
        INNER JOIN PRODUCTO P ON DP.id_producto = P.id_producto
        WHERE PE.estado_pedido = 'ENTREGADO'
          AND CAST(PE.fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin
        GROUP BY P.nombre_producto
        ORDER BY cantidad DESC, total DESC
      `);

    // 3. Métodos de pago usados en pedidos completados
    const metodosPago = await pool.request().input("fechaInicio", sql.Date, fechaInicio).input("fechaFin", sql.Date, fechaFin).query(`
        SELECT
          MP.tipo_metodo AS metodo,
          COUNT(*) AS cantidad
        FROM PEDIDO PE
        INNER JOIN METODOS_DE_PAGO MP ON PE.id_metodo_pago = MP.id_metodo_pago
        WHERE PE.estado_pedido = 'ENTREGADO'
          AND CAST(PE.fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin
        GROUP BY MP.tipo_metodo
        ORDER BY cantidad DESC
      `);

    // Respuesta adaptada al frontend (admin.js)
    res.json({
      totalVentas: parseFloat(totalVentas),
      pedidosCompletados: parseInt(cantidadPedidos),
      topProductos: topProductos.recordset.map(r => ({
        nombre: r.nombre,
        cantidad: parseInt(r.cantidad),
        total: parseFloat(r.total),
      })),
      topMetodosPago: metodosPago.recordset.map(r => ({
        nombre: r.metodo,
        cantidad: parseInt(r.cantidad),
      })),
    });
  } catch (err) {
    console.error("Error en getSalesReport:", err);
    res.status(500).json({ message: "Error al generar el reporte de ventas." });
  }
};

/**
 * Exporta el reporte a Excel (xlsx)
 * npm install exceljs
 */
exports.exportSalesReportExcel = async (req, res) => {
  try {
    let { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: "Debes indicar el rango de fechas." });
    }
    fechaInicio = formatDate(fechaInicio);
    fechaFin = formatDate(fechaFin);

    // Reutiliza la lógica del dashboard
    req.query = { fechaInicio, fechaFin };
    const fakeRes = {
      json: data => data,
      status: () => ({ json: d => d }),
    };
    const datos = await exports.getSalesReport({ query: req.query }, fakeRes);

    // Crea el archivo Excel
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Reporte de Ventas");

    // Cabecera
    ws.addRow([`Reporte de Ventas (${fechaInicio} a ${fechaFin})`]);
    ws.addRow([]);
    ws.addRow(["Total Ventas", datos?.totalVentas ?? 0]);
    ws.addRow(["Pedidos Completados", datos?.pedidosCompletados ?? 0]);
    ws.addRow([]);

    // Productos más vendidos
    ws.addRow(["Top 5 Productos"]);
    ws.addRow(["Nombre", "Cantidad", "Total"]);
    (datos?.topProductos || []).forEach(p => {
      ws.addRow([p.nombre, p.cantidad, p.total]);
    });
    ws.addRow([]);

    // Métodos de pago
    ws.addRow(["Métodos de Pago"]);
    ws.addRow(["Método", "Cantidad"]);
    (datos?.topMetodosPago || []).forEach(m => {
      ws.addRow([m.nombre, m.cantidad]);
    });

    // Enviar como descarga
    res.setHeader("Content-Disposition", `attachment; filename="reporte-ventas-${fechaInicio}_a_${fechaFin}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error exportando reporte Excel:", err);
    res.status(500).json({ message: "Error al exportar el reporte." });
  }
};

/**
 * Exporta el reporte a PDF (npm install pdfkit pdfkit-table)
 */
exports.exportSalesReportPDF = async (req, res) => {
  try {
    let { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: "Debes indicar el rango de fechas." });
    }
    fechaInicio = formatDate(fechaInicio);
    fechaFin = formatDate(fechaFin);

    req.query = { fechaInicio, fechaFin };
    const fakeRes = {
      json: data => data,
      status: () => ({ json: d => d }),
    };
    const datos = await exports.getSalesReport({ query: req.query }, fakeRes);

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
    res.status(500).json({ message: "Error al exportar el reporte." });
  }
};
