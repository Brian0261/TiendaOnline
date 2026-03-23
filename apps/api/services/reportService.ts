const reportRepository = require("../repositories/reportRepository");

// YYYY-MM-DD
function toDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

async function getDashboardOverview({ year }) {
  const now = new Date();
  const y = Number(year) || now.getFullYear();
  const f1 = toDate(new Date(y, 0, 1));
  const f2 = toDate(now.getFullYear() === y ? now : new Date(y, 11, 31));

  const rowsMonthly = await reportRepository.getMonthlySalesAndOrdersLast12Months();
  const { salesYear, ordersDelivered, ordersTotal } = await reportRepository.getKpisBetweenDates({ f1, f2 });
  const { units, customers } = await reportRepository.getUnitsAndCustomersBetweenDates({ f1, f2 });
  const topCats = await reportRepository.getTopCategoriesBetweenDates({ f1, f2 });
  const recent = await reportRepository.getRecentOrdersBetweenDates({ f1, f2, limit: 8 });

  const avgTicket = Number(ordersDelivered || 0) > 0 ? Number(salesYear || 0) / Number(ordersDelivered || 0) : 0;
  const deliveredRate = Number(ordersTotal || 0) > 0 ? (Number(ordersDelivered || 0) * 100.0) / Number(ordersTotal || 0) : 0;

  return {
    year: y,
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
    topCategories: topCats.map(r => ({ name: r.name, total: Number(r.total || 0) })),
    recent: recent.map(r => ({
      id: r.id,
      fecha: r.fecha,
      cliente: r.cliente || r.email || "",
      estado: r.estado,
      total: Number(r.total || 0),
    })),
  };
}

async function getSalesReport({ fechaInicio, fechaFin }) {
  if (!fechaInicio || !fechaFin) {
    const err = new Error("Debes indicar el rango de fechas.");
    (err as any).status = 400;
    throw err;
  }

  const fi = toDate(fechaInicio);
  const ff = toDate(fechaFin);

  const { totalVentas, cantidadPedidos } = await reportRepository.getSalesTotalsBetweenDates({ fechaInicio: fi, fechaFin: ff });
  const topProductos = await reportRepository.getTopProductsBetweenDates({ fechaInicio: fi, fechaFin: ff });
  const metodosPago = await reportRepository.getPaymentMethodsBetweenDates({ fechaInicio: fi, fechaFin: ff });

  return {
    fechaInicio: fi,
    fechaFin: ff,
    totalVentas: Number(totalVentas || 0),
    pedidosCompletados: Number(cantidadPedidos || 0),
    topProductos: topProductos.map(r => ({
      nombre: r.nombre,
      cantidad: Number(r.cantidad),
      total: Number(r.total),
    })),
    topMetodosPago: metodosPago.map(r => ({
      nombre: r.metodo,
      cantidad: Number(r.cantidad),
    })),
  };
}

async function exportSalesReportCsv({ fechaInicio, fechaFin }) {
  if (!fechaInicio || !fechaFin) {
    const err = new Error("Debes indicar el rango de fechas.");
    (err as any).status = 400;
    throw err;
  }

  const fi = toDate(fechaInicio);
  const ff = toDate(fechaFin);

  const { totalVentas, cantidadPedidos } = await reportRepository.getSalesTotalsBetweenDates({ fechaInicio: fi, fechaFin: ff });
  const topProductos = await reportRepository.getTopProductsBetweenDates({ fechaInicio: fi, fechaFin: ff });
  const metodosPago = await reportRepository.getPaymentMethodsBetweenDates({ fechaInicio: fi, fechaFin: ff });

  const lines: string[] = [];

  lines.push("Reporte de Ventas");
  lines.push(`Periodo,${fi},${ff}`);
  lines.push(`Total Ventas (S/),${Number(totalVentas || 0).toFixed(2)}`);
  lines.push(`Pedidos Completados,${Number(cantidadPedidos || 0)}`);
  lines.push("");

  lines.push("Top Productos");
  lines.push("Producto,Cantidad,Total (S/)");
  (topProductos || []).forEach(p => {
    lines.push(`"${String(p.nombre || "").replace(/"/g, '""')}",${Number(p.cantidad)},${Number(p.total).toFixed(2)}`);
  });
  lines.push("");

  lines.push("Metodos de Pago");
  lines.push("Metodo,Cantidad");
  (metodosPago || []).forEach(m => {
    lines.push(`"${String(m.metodo || "").replace(/"/g, '""')}",${Number(m.cantidad)}`);
  });

  const csv = lines.join("\n");
  const filename = `reporte-ventas-${fi}_a_${ff}.csv`;
  return { filename, csv };
}

module.exports = {
  toDate,
  getDashboardOverview,
  getSalesReport,
  exportSalesReportCsv,
};

export {};
