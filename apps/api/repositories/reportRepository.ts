const { poolPromise } = require("../config/db.config");

async function getMonthlySalesAndOrdersLast12Months() {
  const pool = await poolPromise;
  const qMonthly = `
    WITH series AS (
      SELECT date_trunc('month', CURRENT_DATE - (n || ' months')::interval) AS mesini
      FROM generate_series(0, 11) AS n
    )
    SELECT
      EXTRACT(YEAR FROM s.mesini) y, EXTRACT(MONTH FROM s.mesini) m,
      COALESCE(SUM(CASE WHEN p.estado_pedido='ENTREGADO' THEN p.total_pedido END),0) AS "totalVentas",
      COALESCE(COUNT(CASE WHEN p.estado_pedido='ENTREGADO' THEN 1 END),0) AS pedidos
    FROM series s
    LEFT JOIN pedido p
      ON p.fecha_creacion::date >= s.mesini::date
     AND p.fecha_creacion::date < (s.mesini + interval '1 month')::date
    GROUP BY s.mesini
    ORDER BY s.mesini ASC;
  `;

  const monthly = await pool.query(qMonthly);
  return monthly.rows || [];
}

async function getKpisBetweenDates({ f1, f2 }) {
  const pool = await poolPromise;

  const qKpis = `
    SELECT
      COALESCE(SUM(CASE WHEN estado_pedido='ENTREGADO' THEN total_pedido END),0) AS "salesYear",
      COALESCE(COUNT(CASE WHEN estado_pedido='ENTREGADO' THEN 1 END),0) AS "ordersDelivered",
      COALESCE(COUNT(*),0) AS "ordersTotal"
    FROM pedido
    WHERE fecha_creacion::date BETWEEN $1 AND $2;
  `;

  const k = await pool.query(qKpis, [f1, f2]);
  return k.rows?.[0] || { salesYear: 0, ordersDelivered: 0, ordersTotal: 0 };
}

async function getUnitsAndCustomersBetweenDates({ f1, f2 }) {
  const pool = await poolPromise;
  const qUnitsCustomers = `
    SELECT
      COALESCE(SUM(dp.cantidad),0) AS units,
      COALESCE(COUNT(DISTINCT pe.id_usuario),0) AS customers
    FROM detalle_pedido dp
    INNER JOIN pedido pe ON pe.id_pedido = dp.id_pedido
    WHERE pe.estado_pedido='ENTREGADO'
      AND pe.fecha_creacion::date BETWEEN $1 AND $2;
  `;
  const uc = await pool.query(qUnitsCustomers, [f1, f2]);
  return uc.rows?.[0] || { units: 0, customers: 0 };
}

async function getTopCategoriesBetweenDates({ f1, f2 }) {
  const pool = await poolPromise;
  const qTopCats = `
    SELECT
      COALESCE(ca.nombre_categoria, 'Sin categoría') AS name,
      COALESCE(SUM(dp.subtotal),0) AS total
    FROM detalle_pedido dp
    INNER JOIN pedido pe   ON pe.id_pedido = dp.id_pedido
    INNER JOIN producto pr ON pr.id_producto = dp.id_producto
    LEFT  JOIN categoria ca ON ca.id_categoria = pr.id_categoria
    WHERE pe.estado_pedido='ENTREGADO'
      AND pe.fecha_creacion::date BETWEEN $1 AND $2
    GROUP BY ca.nombre_categoria
    ORDER BY total DESC
    LIMIT 5;
  `;
  const topCats = await pool.query(qTopCats, [f1, f2]);
  return topCats.rows || [];
}

async function getRecentOrdersBetweenDates({ f1, f2, limit = 8 }) {
  const pool = await poolPromise;
  const qRecent = `
    SELECT
      pe.id_pedido AS id,
      pe.fecha_creacion AS fecha,
      pe.estado_pedido AS estado,
      COALESCE(pe.total_pedido,0) AS total,
      (u.nombre || ' ' || u.apellido) AS cliente,
      u.email
    FROM pedido pe
    INNER JOIN usuario u ON u.id_usuario = pe.id_usuario
    WHERE pe.fecha_creacion::date BETWEEN $1 AND $2
    ORDER BY pe.fecha_creacion DESC
    LIMIT $3;
  `;

  const recent = await pool.query(qRecent, [f1, f2, Number(limit) || 8]);
  return recent.rows || [];
}

async function getSalesTotalsBetweenDates({ fechaInicio, fechaFin }) {
  const pool = await poolPromise;
  const ventas = await pool.query(
    `
      SELECT
        COALESCE(SUM(total_pedido),0) AS "totalVentas",
        COUNT(*) AS "cantidadPedidos"
      FROM pedido
      WHERE estado_pedido='ENTREGADO'
        AND fecha_creacion::date BETWEEN $1 AND $2
    `,
    [fechaInicio, fechaFin],
  );

  return ventas.rows?.[0] || { totalVentas: 0, cantidadPedidos: 0 };
}

async function getTopProductsBetweenDates({ fechaInicio, fechaFin }) {
  const pool = await poolPromise;
  const topProductos = await pool.query(
    `
      SELECT
        p.nombre_producto AS nombre,
        SUM(dp.cantidad) AS cantidad,
        SUM(dp.subtotal) AS total
      FROM detalle_pedido dp
      INNER JOIN pedido pe ON dp.id_pedido = pe.id_pedido
      INNER JOIN producto p ON dp.id_producto = p.id_producto
      WHERE pe.estado_pedido='ENTREGADO'
        AND pe.fecha_creacion::date BETWEEN $1 AND $2
      GROUP BY p.nombre_producto
      ORDER BY cantidad DESC, total DESC
      LIMIT 5
    `,
    [fechaInicio, fechaFin],
  );

  return topProductos.rows || [];
}

async function getPaymentMethodsBetweenDates({ fechaInicio, fechaFin }) {
  const pool = await poolPromise;
  const metodosPago = await pool.query(
    `
      SELECT mp.tipo_metodo AS metodo, COUNT(*) AS cantidad
      FROM pedido pe
      INNER JOIN metodos_de_pago mp ON pe.id_metodo_pago = mp.id_metodo_pago
      WHERE pe.estado_pedido='ENTREGADO'
        AND pe.fecha_creacion::date BETWEEN $1 AND $2
      GROUP BY mp.tipo_metodo
      ORDER BY cantidad DESC
    `,
    [fechaInicio, fechaFin],
  );

  return metodosPago.rows || [];
}

module.exports = {
  getMonthlySalesAndOrdersLast12Months,
  getKpisBetweenDates,
  getUnitsAndCustomersBetweenDates,
  getTopCategoriesBetweenDates,
  getRecentOrdersBetweenDates,
  getSalesTotalsBetweenDates,
  getTopProductsBetweenDates,
  getPaymentMethodsBetweenDates,
};

export {};
