// backend/controllers/productController.js
// ────────────────────────────────────────────────────────────
//  Controlador de PRODUCTO – CRUD + catálogos + activación
//  (robustizado: timeouts, try/catch, consultas directas a SQL
//   para endpoints públicos de listado/lectura)
// ────────────────────────────────────────────────────────────
const { sql, getPool } = require("../config/db.config");
const Product = require("../models/Product");

/* Utilidades */
const SQL_TIMEOUT = parseInt(process.env.SQL_REQUEST_TIMEOUT || "15000", 10);
const toInt = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const toNum = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/** Normaliza cualquier valor de imagen a una URL válida del sitio.
 *  Acepta:
 *   - vacío/undefined -> placeholder
 *   - absoluta (http...) -> la deja igual
 *   - "lays-140g.webp" -> "/assets/images/lays-140g.webp"
 *   - "assets/images/lays-140g.webp" -> "/assets/images/lays-140g.webp"
 *   - "/views/products/assets/images/..." -> "/assets/images/..."
 */
const normalizeImage = raw => {
  if (!raw) return "/assets/images/placeholder-product.png";
  if (typeof raw !== "string") return "/assets/images/placeholder-product.png";
  if (raw.startsWith("http")) return raw;

  // Limpia prefijos accidentales y fuerza carpeta assets/images
  let cleaned = raw
    .trim()
    .replace(/^\/?views\/products\//, "") // quita /views/products/
    .replace(/^\/?assets\//, "assets/"); // normaliza "assets/..."

  // Si viene solo el nombre de archivo, anteponer carpeta
  if (!/^assets\/images\//.test(cleaned)) {
    // si ya venía "images/xxx", anteponer "assets/"
    if (/^images\//.test(cleaned)) cleaned = `assets/${cleaned}`;
    // si no tiene "images/", forzarla
    if (!/^assets\/images\//.test(cleaned)) cleaned = `assets/images/${cleaned}`;
  }

  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
};

/* =========================================================
   CREAR  (POST /api/products)
   ========================================================= */
exports.createProduct = async (req, res) => {
  try {
    const { name, description = "", price, categoryId, brandId, stock } = req.body;

    if (!name || price == null || !categoryId || !brandId) {
      return res.status(400).json({ message: "Campos obligatorios faltantes." });
    }
    const priceN = toNum(price, NaN);
    const stockN = toInt(stock, 0);
    if (!Number.isFinite(priceN) || priceN <= 0 || stockN < 0) {
      return res.status(400).json({ message: "Precio y stock deben ser positivos." });
    }

    // Guardamos bajo assets/images/ para que coincida con el frontend
    const imagePath = req.file ? `assets/images/${req.file.filename}` : "assets/images/placeholder-product.png";

    const newId = await Product.createProduct({
      name: String(name).trim(),
      description: String(description || ""),
      price: priceN,
      categoryId: toInt(categoryId, 0),
      brandId: toInt(brandId, 0),
      stock: stockN,
      imagePath,
    });

    const created = await Product.getProductById(newId);
    // Normalizamos imagen en la respuesta
    if (created) created.imagen = normalizeImage(created.imagen);
    return res.status(201).json(created);
  } catch (err) {
    console.error("Error al crear producto:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   ACTUALIZAR  (PUT /api/products/:id)
   ========================================================= */
exports.updateProduct = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ message: "ID inválido." });

    const { name, description = "", price, categoryId, brandId } = req.body;
    if (!name || price == null || !categoryId || !brandId) {
      return res.status(400).json({ message: "Campos obligatorios faltantes." });
    }

    const priceN = toNum(price, NaN);
    if (!Number.isFinite(priceN) || priceN <= 0) {
      return res.status(400).json({ message: "Precio inválido." });
    }

    const imagePath = req.file ? `assets/images/${req.file.filename}` : null;

    await Product.updateProduct(id, {
      name: String(name).trim(),
      description: String(description || ""),
      price: priceN,
      categoryId: toInt(categoryId, 0),
      brandId: toInt(brandId, 0),
      imagePath,
    });

    const updated = await Product.getProductById(id);
    if (updated) updated.imagen = normalizeImage(updated.imagen);
    res.json(updated);
  } catch (err) {
    console.error("Error al actualizar producto:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   DESACTIVAR (soft-delete)  (DELETE /api/products/:id)
   ========================================================= */
exports.deactivateProduct = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ message: "ID inválido." });

    await Product.deactivateProduct(id); // UPDATE activo = 0
    res.status(204).end();
  } catch (err) {
    console.error("Error al desactivar producto:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   ACTIVAR  (PUT /api/products/:id/activate)
   ========================================================= */
exports.activateProduct = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ message: "ID inválido." });

    await Product.activateProduct(id); // UPDATE activo = 1
    res.status(204).end();
  } catch (err) {
    console.error("Error al activar producto:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   ELIMINACIÓN DEFINITIVA  (DELETE /api/products/:id/hard)
   ========================================================= */
exports.hardDeleteProduct = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ message: "ID inválido." });

    await Product.hardDeleteProduct(id); // borra FK + producto
    res.status(204).end();
  } catch (err) {
    console.error("Error al eliminar:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   CATÁLOGOS  (GET /api/products/categories | brands)
   ========================================================= */
exports.getCategories = async (_req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.timeout = SQL_TIMEOUT;
    const result = await request.query(`
      SELECT id_categoria AS id, nombre_categoria AS name
      FROM   CATEGORIA
      ORDER  BY nombre_categoria;
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Error al obtener categorías:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getBrands = async (_req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.timeout = SQL_TIMEOUT;
    const result = await request.query(`
      SELECT id_marca AS id, nombre_marca AS name
      FROM   MARCA
      ORDER  BY nombre_marca;
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Error al obtener marcas:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/* =========================================================
   LISTADO PÚBLICO (GET /api/products)
   ========================================================= */
exports.getAllProducts = async (req, res) => {
  try {
    const status = String(req.query.status || "active").toLowerCase();
    const category = req.query.category ? toInt(req.query.category, 0) : null;
    const search = (req.query.search || "").trim();
    const limit = Math.max(1, Math.min(100, toInt(req.query.limit, 20)));
    const page = Math.max(1, toInt(req.query.page, 1));
    const offset = (page - 1) * limit;

    const pool = await getPool();
    const request = pool.request();
    request.timeout = SQL_TIMEOUT;

    // WHERE dinámico sobre PRODUCTO (no afectamos el LEFT JOIN)
    const whereParts = [];
    if (status === "active") whereParts.push("p.activo = 1");
    else if (status === "inactive") whereParts.push("p.activo = 0");

    if (category) {
      whereParts.push("p.id_categoria = @cat");
      request.input("cat", sql.Int, category);
    }
    if (search) {
      whereParts.push("(p.nombre_producto LIKE @q OR p.descripcion LIKE @q)");
      request.input("q", sql.VarChar, `%${search}%`);
    }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    request.input("limit", sql.Int, limit);
    request.input("offset", sql.Int, offset);

    // Calculamos stock desde INVENTARIO (suma de cantidad_disponible), agrupando
    const sqlText = `
      WITH P AS (
        SELECT
          p.id_producto     AS id,
          p.nombre_producto AS nombre,
          p.descripcion,
          p.precio,
          p.imagen,
          ISNULL(SUM(i.cantidad_disponible), 0) AS stock,
          p.activo,
          p.id_categoria,
          p.id_marca
        FROM PRODUCTO p
        LEFT JOIN INVENTARIO i
               ON i.id_producto = p.id_producto
              AND i.activo = 1
        ${whereSql}
        GROUP BY
          p.id_producto, p.nombre_producto, p.descripcion, p.precio,
          p.imagen, p.activo, p.id_categoria, p.id_marca
      )
      SELECT *
      FROM P
      ORDER BY id DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;

    const result = await request.query(sqlText);

    // Normaliza rutas de imagen
    const list = result.recordset.map(p => ({
      ...p,
      imagen: normalizeImage(p.imagen),
    }));

    return res.json(list);
  } catch (err) {
    console.error("Error al obtener productos:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/* =========================================================
   DETALLE PÚBLICO (GET /api/products/:id)
   ========================================================= */
exports.getProductById = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ message: "ID inválido" });

    const pool = await getPool();
    const request = pool.request();
    request.timeout = SQL_TIMEOUT;
    request.input("id", sql.Int, id);

    // Evitamos GROUP BY usando un subquery para el stock
    const result = await request.query(`
      SELECT
        p.id_producto     AS id,
        p.nombre_producto AS nombre,
        p.descripcion,
        p.precio,
        p.imagen,
        (
          SELECT ISNULL(SUM(i.cantidad_disponible), 0)
          FROM INVENTARIO i
          WHERE i.id_producto = p.id_producto AND i.activo = 1
        ) AS stock,
        p.activo,
        p.id_categoria,
        p.id_marca
      FROM PRODUCTO p
      WHERE p.id_producto = @id AND p.activo = 1;
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const prod = result.recordset[0];
    prod.imagen = normalizeImage(prod.imagen);
    return res.json(prod);
  } catch (err) {
    console.error("Error al obtener el producto:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
