const { poolPromise } = require("../config/db.config");

function toInt(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

async function getCategories() {
  const pool = await poolPromise;
  const result = await pool.query(`
    SELECT id_categoria AS id, nombre_categoria AS name
    FROM   categoria
    ORDER  BY nombre_categoria;
  `);
  return result.rows || [];
}

async function getBrands() {
  const pool = await poolPromise;
  const result = await pool.query(`
    SELECT id_marca AS id, nombre_marca AS name
    FROM   marca
    ORDER  BY nombre_marca;
  `);
  return result.rows || [];
}

async function listProducts({ status = "active", category = null, search = "", limit = 20, page = 1 }) {
  const st = String(status || "active").toLowerCase();
  const cat = category ? toInt(category, 0) : null;
  const q = String(search || "").trim();

  const lim = Math.max(1, Math.min(100, toInt(limit, 20)));
  const pg = Math.max(1, toInt(page, 1));
  const offset = (pg - 1) * lim;

  const pool = await poolPromise;
  const where = [];
  const params = [];
  if (st === "active") where.push("p.activo = true");
  else if (st === "inactive") where.push("p.activo = false");

  if (cat) {
    params.push(cat);
    where.push(`p.id_categoria = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.nombre_producto ILIKE $${params.length} OR p.descripcion ILIKE $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  params.push(lim, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const sqlText = `
    SELECT
      p.id_producto      AS id,
      p.nombre_producto  AS nombre,
      p.descripcion,
      p.precio,
      p.imagen,
      COALESCE(s.stock, 0) AS stock,
      p.activo,
      p.id_categoria,
      c.nombre_categoria AS "categoryName",
      p.id_marca,
      m.nombre_marca     AS "brandName"
    FROM producto p
    LEFT JOIN (
      SELECT id_producto, SUM(cantidad_disponible) AS stock
      FROM inventario
      GROUP BY id_producto
    ) s ON s.id_producto = p.id_producto
    LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
    LEFT JOIN marca     m ON m.id_marca     = p.id_marca
    ${whereSql}
    ORDER BY p.id_producto DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const result = await pool.query(sqlText, params);
  return result.rows || [];
}

async function getProductByIdPublic(id) {
  const pool = await poolPromise;
  const result = await pool.query(
    `
      SELECT
        p.id_producto      AS id,
        p.nombre_producto  AS nombre,
        p.descripcion,
        p.precio,
        p.imagen,
        (
          SELECT COALESCE(SUM(i.cantidad_disponible), 0)
          FROM inventario i WHERE i.id_producto = p.id_producto
        ) AS stock,
        p.activo,
        p.id_categoria,
        c.nombre_categoria AS "categoryName",
        p.id_marca,
        m.nombre_marca     AS "brandName"
      FROM producto p
      LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
      LEFT JOIN marca     m ON m.id_marca     = p.id_marca
      WHERE p.id_producto = $1 AND p.activo = true;
    `,
    [id],
  );

  return result.rows[0] || null;
}

module.exports = {
  getCategories,
  getBrands,
  listProducts,
  getProductByIdPublic,
};

export {};
