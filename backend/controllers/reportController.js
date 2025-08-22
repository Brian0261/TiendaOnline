// backend/controllers/reportController.js
const { sql, poolPromise } = require("../config/db.config");

// YYYY-MM-DD
const toDate = d => new Date(d).toISOString().slice(0, 10);

/* ======================= DASHBOARD (YTD + 12m) ======================= */
/* GET /api/reports/dashboard?year=2025 */
exports.getDashboardOverview = async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const f1 = toDate(new Date(year, 0, 1));
    const f2 = toDate(now.getFullYear() === year ? now : new Date(year, 11, 31));

    const pool = await poolPromise;

    // Serie últimos 12 meses (ventas S/ y pedidos ENTREGADO)
    const qMonthly = `
      WITH N(n) AS (
        SELECT 0 UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
        SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL
        SELECT 10 UNION ALL SELECT 11
      ),
      Series AS (
        SELECT
          DATEFROMPARTS(YEAR(DATEADD(MONTH, -n, GETDATE())), MONTH(DATEADD(MONTH, -n, GETDATE())), 1) AS MesIni,
          DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(DATEADD(MONTH, -n, GETDATE())), MONTH(DATEADD(MONTH, -n, GETDATE())), 1)) AS MesFin
        FROM N
      )
      SELECT
        YEAR(S.MesIni) y, MONTH(S.MesIni) m,
        ISNULL(SUM(CASE WHEN P.estado_pedido='ENTREGADO' THEN P.total_pedido END),0) totalVentas,
        ISNULL(COUNT(CASE WHEN P.estado_pedido='ENTREGADO' THEN 1 END),0) pedidos
      FROM Series S
      LEFT JOIN PEDIDO P
        ON CAST(P.fecha_creacion AS DATE) >= CAST(S.MesIni AS DATE)
       AND CAST(P.fecha_creacion AS DATE) <  CAST(S.MesFin AS DATE)
      GROUP BY S.MesIni
      ORDER BY S.MesIni ASC;
    `;
    const monthly = await pool.request().query(qMonthly);
    const rowsMonthly = monthly.recordset || [];

    // KPIs YTD (rango del año)
    const qKpis = `
      SELECT
        ISNULL(SUM(CASE WHEN estado_pedido='ENTREGADO' THEN total_pedido END),0) AS salesYear,
        ISNULL(COUNT(CASE WHEN estado_pedido='ENTREGADO' THEN 1 END),0) AS ordersDelivered,
        ISNULL(COUNT(*),0) AS ordersTotal
      FROM PEDIDO
      WHERE CAST(fecha_creacion AS DATE) BETWEEN @f1 AND @f2;
    `;
    const k = await pool.request().input("f1", sql.Date, f1).input("f2", sql.Date, f2).query(qKpis);
    const { salesYear, ordersDelivered, ordersTotal } = k.recordset[0] || { salesYear: 0, ordersDelivered: 0, ordersTotal: 0 };

    // Unidades y clientes únicos (por id_usuario)
    const qUnitsCustomers = `
      SELECT
        ISNULL(SUM(DP.cantidad),0) AS units,
        ISNULL(COUNT(DISTINCT PE.id_usuario),0) AS customers
      FROM DETALLE_PEDIDO DP
      INNER JOIN PEDIDO PE ON PE.id_pedido = DP.id_pedido
      WHERE PE.estado_pedido='ENTREGADO'
        AND CAST(PE.fecha_creacion AS DATE) BETWEEN @f1 AND @f2;
    `;
    const uc = await pool.request().input("f1", sql.Date, f1).input("f2", sql.Date, f2).query(qUnitsCustomers);
    const { units, customers } = uc.recordset[0] || { units: 0, customers: 0 };

    // Top categorías del año (S/)
    const qTopCats = `
      SELECT TOP 5
        ISNULL(CA.nombre_categoria, 'Sin categoría') AS name,
        ISNULL(SUM(DP.subtotal),0) AS total
      FROM DETALLE_PEDIDO DP
      INNER JOIN PEDIDO PE   ON PE.id_pedido = DP.id_pedido
      INNER JOIN PRODUCTO PR ON PR.id_producto = DP.id_producto
      LEFT  JOIN CATEGORIA CA ON CA.id_categoria = PR.id_categoria
      WHERE PE.estado_pedido='ENTREGADO'
        AND CAST(PE.fecha_creacion AS DATE) BETWEEN @f1 AND @f2
      GROUP BY CA.nombre_categoria
      ORDER BY total DESC;
    `;
    const topCats = await pool.request().input("f1", sql.Date, f1).input("f2", sql.Date, f2).query(qTopCats);

    // Actividad reciente (últimos 8 pedidos del año) — unir con USUARIO
    const qRecent = `
      SELECT TOP 8
        PE.id_pedido AS id,
        PE.fecha_creacion AS fecha,
        PE.estado_pedido AS estado,
        ISNULL(PE.total_pedido,0) AS total,
        CONCAT(U.nombre,' ',U.apellido) AS cliente,
        U.email
      FROM PEDIDO PE
      INNER JOIN USUARIO U ON U.id_usuario = PE.id_usuario
      WHERE CAST(PE.fecha_creacion AS DATE) BETWEEN @f1 AND @f2
      ORDER BY PE.fecha_creacion DESC;
    `;
    const recent = await pool.request().input("f1", sql.Date, f1).input("f2", sql.Date, f2).query(qRecent);

    const avgTicket = ordersDelivered > 0 ? salesYear / ordersDelivered : 0;
    const deliveredRate = ordersTotal > 0 ? (ordersDelivered * 100.0) / ordersTotal : 0;

    return res.json({
      year,
      kpis: {
        salesYear: Number(salesYear || 0),
        ordersYear: Number(ordersDelivered || 0),
        avgTicket: Number(avgTicket.toFixed(2)),
        units: Number(units || 0),
        customers: Number(customers || 0),
        deliveredRate: Number(deliveredRate.toFixed(2)),
      },
      monthly: {
        sales: rowsMonthly.map(r => ({ y: r.y, m: r.m, total: Number(r.totalVentas || 0) })),
        orders: rowsMonthly.map(r => ({ y: r.y, m: r.m, count: Number(r.pedidos || 0) })),
      },
      topCategories: (topCats.recordset || []).map(r => ({ name: r.name, total: Number(r.total || 0) })),
      recent: (recent.recordset || []).map(r => ({
        id: r.id,
        fecha: r.fecha,
        cliente: r.cliente || r.email || "",
        estado: r.estado,
        total: Number(r.total || 0),
      })),
    });
  } catch (err) {
    console.error("Error en getDashboardOverview:", err);
    return res.status(500).json({ message: "Error al generar el dashboard." });
  }
};

/* =================== REPORTE POR RANGO (ya lo tenías) =================== */
exports.getSalesReport = async (req, res) => {
  try {
    let { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: "Debes indicar el rango de fechas." });
    }
    fechaInicio = toDate(fechaInicio);
    fechaFin = toDate(fechaFin);

    const pool = await poolPromise;

    const ventas = await pool.request().input("fechaInicio", sql.Date, fechaInicio).input("fechaFin", sql.Date, fechaFin).query(`
        SELECT
          ISNULL(SUM(total_pedido),0) AS totalVentas,
          COUNT(*) AS cantidadPedidos
        FROM PEDIDO
        WHERE estado_pedido='ENTREGADO'
          AND CAST(fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin
      `);
    const { totalVentas, cantidadPedidos } = ventas.recordset[0];

    const topProductos = await pool.request().input("fechaInicio", sql.Date, fechaInicio).input("fechaFin", sql.Date, fechaFin).query(`
        SELECT TOP 5
          P.nombre_producto AS nombre,
          SUM(DP.cantidad) AS cantidad,
          SUM(DP.subtotal) AS total
        FROM DETALLE_PEDIDO DP
        INNER JOIN PEDIDO PE ON DP.id_pedido = PE.id_pedido
        INNER JOIN PRODUCTO P ON DP.id_producto = P.id_producto
        WHERE PE.estado_pedido='ENTREGADO'
          AND CAST(PE.fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin
        GROUP BY P.nombre_producto
        ORDER BY cantidad DESC, total DESC
      `);

    const metodosPago = await pool.request().input("fechaInicio", sql.Date, fechaInicio).input("fechaFin", sql.Date, fechaFin).query(`
        SELECT MP.tipo_metodo AS metodo, COUNT(*) AS cantidad
        FROM PEDIDO PE
        INNER JOIN METODOS_DE_PAGO MP ON PE.id_metodo_pago = MP.id_metodo_pago
        WHERE PE.estado_pedido='ENTREGADO'
          AND CAST(PE.fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin
        GROUP BY MP.tipo_metodo
        ORDER BY cantidad DESC
      `);

    res.json({
      totalVentas: Number(totalVentas),
      pedidosCompletados: Number(cantidadPedidos),
      topProductos: topProductos.recordset.map(r => ({
        nombre: r.nombre,
        cantidad: Number(r.cantidad),
        total: Number(r.total),
      })),
      topMetodosPago: metodosPago.recordset.map(r => ({
        nombre: r.metodo,
        cantidad: Number(r.cantidad),
      })),
    });
  } catch (err) {
    console.error("Error en getSalesReport:", err);
    res.status(500).json({ message: "Error al generar el reporte de ventas." });
  }
};

/* =========================================================
   Exportaciones existentes (Excel/PDF)
========================================================= */
exports.exportSalesReportExcel = async (req, res) => {
  try {
    let { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: "Debes indicar el rango de fechas." });
    }
    fechaInicio = formatDate(fechaInicio);
    fechaFin = formatDate(fechaFin);

    // Reusar la lógica base
    req.query = { fechaInicio, fechaFin };
    const fakeRes = {
      json: data => data,
      status: () => ({ json: d => d }),
    };
    const datos = await exports.getSalesReport({ query: req.query }, fakeRes);

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
    res.status(500).json({ message: "Error al exportar el reporte." });
  }
};

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
