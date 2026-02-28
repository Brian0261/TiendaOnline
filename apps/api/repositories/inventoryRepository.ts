const { poolPromise } = require("../config/db.config");

async function getAvailableStockByProductId(productId) {
  const pool = await poolPromise;
  const stockRes = await pool.query(
    `
      SELECT COALESCE(SUM(i.cantidad_disponible), 0) AS stock_total
      FROM inventario i
      WHERE i.id_producto = $1
    `,
    [productId],
  );

  const reservedRes = await pool.query(
    `
      SELECT COALESCE(SUM(rsi.cantidad), 0) AS reservado
      FROM reserva_stock_item rsi
      INNER JOIN reserva_stock rs ON rs.id_reserva_stock = rsi.id_reserva_stock
      WHERE rsi.id_producto = $1
        AND rs.estado = 'ACTIVA'
        AND rs.expires_at > NOW()
    `,
    [productId],
  );

  const stockTotal = Number(stockRes.rows?.[0]?.stock_total || 0);
  const reservado = Number(reservedRes.rows?.[0]?.reservado || 0);
  const disponible = Math.max(stockTotal - reservado, 0);
  return { stockTotal, reservado, disponible };
}

async function listInventory({ search = "", almacen = "" }) {
  const pool = await poolPromise;
  const filters = [];
  const params = [];

  if (almacen) {
    params.push(Number(almacen));
    filters.push(`i.id_almacen = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(p.nombre_producto ILIKE $${params.length})`);
  }

  const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

  const q = `
    SELECT
      i.id_inventario,
      i.id_producto,
      i.id_almacen,
      a.nombre_almacen,
      p.nombre_producto,
      i.cantidad_disponible AS stock
    FROM inventario i
    INNER JOIN producto p ON p.id_producto = i.id_producto
    INNER JOIN almacen  a ON a.id_almacen  = i.id_almacen
    ${where}
    ORDER BY p.nombre_producto ASC
  `;

  const result = await pool.query(q, params);
  return result.rows || [];
}

async function listInventoryForExport({ search = "", almacen = "" }) {
  const pool = await poolPromise;
  const filters = [];
  const params = [];
  if (almacen) {
    params.push(Number(almacen));
    filters.push(`i.id_almacen = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(p.nombre_producto ILIKE $${params.length})`);
  }

  const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

  const rs = await pool.query(
    `
      SELECT i.id_inventario,
             p.nombre_producto AS producto,
             a.nombre_almacen  AS almacen,
             i.cantidad_disponible AS stock
      FROM inventario i
      INNER JOIN producto p ON p.id_producto = i.id_producto
      INNER JOIN almacen  a ON a.id_almacen  = i.id_almacen
      ${where}
      ORDER BY p.nombre_producto ASC
    `,
    params,
  );

  return rs.rows || [];
}

module.exports = {
  listInventory,
  listInventoryForExport,
  getAvailableStockByProductId,
};

export {};
