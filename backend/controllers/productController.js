// backend/controllers/productController.js
// ────────────────────────────────────────────────────────────
//  Controlador de PRODUCTO – CRUD + catálogos + activación
//  (robustecido: timeouts, try/catch, consultas directas a SQL
//   para los endpoints públicos que listan/leen productos)
// ────────────────────────────────────────────────────────────
const { sql, poolPromise } = require("../config/db.config");
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

/* =========================================================
   CREAR  (POST /api/products)
   ========================================================= */
exports.createProduct = async (req, res) => {
  try {
    const { name, description = "", price, categoryId, brandId, stock } = req.body;

    // Validaciones mínimas
    if (!name || price == null || !categoryId || !brandId) {
      return res.status(400).json({ message: "Campos obligatorios faltantes." });
    }
    const priceN = toNum(price, NaN);
    const stockN = toInt(stock, 0);
    if (!Number.isFinite(priceN) || priceN <= 0 || stockN < 0) {
      return res.status(400).json({ message: "Precio y stock deben ser positivos." });
    }

    const imagePath = req.file ? `assets/images/products/${req.file.filename}` : "assets/images/placeholder-product.png";

    const newId = await Product.createProduct({
      name: String(name).trim(),
      description: String(description || ""),
      price: priceN,
      categoryId: toInt(categoryId, 0),
      brandId: toInt(brandId, 0),
      stock: stockN,
      imagePath,
    });

    // Devuelve el creado
    const created = await Product.getProductById(newId);
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

    const imagePath = req.file ? `assets/images/products/${req.file.filename}` : null;

    await Product.updateProduct(id, {
      name: String(name).trim(),
      description: String(description || ""),
      price: priceN,
      categoryId: toInt(categoryId, 0),
      brandId: toInt(brandId, 0),
      imagePath,
    });

    const updated = await Product.getProductById(id);
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
    const pool = await poolPromise;
    const result = await pool.request().timeout(SQL_TIMEOUT).query(`
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
    const pool = await poolPromise;
    const result = await pool.request().timeout(SQL_TIMEOUT).query(`
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
   - Soporta filtros y pagina/limita
   - Consulta directa a SQL con timeout (evita colgados/504)
   Parámetros:
     status: active | inactive | all   (default: active)
     category: id_categoria             (opcional)
     search: texto                      (opcional)
     limit: 1..100 (default 20)
     page: 1..n   (default 1)
   ========================================================= */
exports.getAllProducts = async (req, res) => {
  try {
    const status = String(req.query.status || "active").toLowerCase();
    const category = req.query.category ? toInt(req.query.category, 0) : null;
    const search = (req.query.search || "").trim();
    const limit = Math.max(1, Math.min(100, toInt(req.query.limit, 20)));
    const page = Math.max(1, toInt(req.query.page, 1));
    const offset = (page - 1) * limit;

    const pool = await poolPromise;
    const request = pool.request().timeout(SQL_TIMEOUT);

    let where = "1=1";
    if (status === "active") where += " AND p.activo = 1";
    else if (status === "inactive") where += " AND p.activo = 0";
    // 'all' -> sin filtro de activo

    if (category) {
      where += " AND p.id_categoria = @cat";
      request.input("cat", sql.Int, category);
    }
    if (search) {
      where += " AND (p.nombre_producto LIKE @q OR p.descripcion LIKE @q)";
      request.input("q", sql.VarChar, `%${search}%`);
    }

    request.input("limit", sql.Int, limit);
    request.input("offset", sql.Int, offset);

    // Usa OFFSET/FETCH para paginar en Azure SQL
    const sqlText = `
      SELECT
        p.id_producto      AS id,
        p.nombre_producto  AS nombre,
        p.descripcion,
        p.precio,
        p.imagen,
        p.activo,
        p.id_categoria,
        p.id_marca
      FROM PRODUCTO p
      WHERE ${where}
      ORDER BY p.id_producto DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;

    const result = await request.query(sqlText);
    // Para compatibilidad con front existentes, devolvemos el array simple
    return res.json(result.recordset);
  } catch (err) {
    console.error("Error al obtener productos:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/* =========================================================
   DETALLE PÚBLICO (GET /api/products/:id)
   - Consulta directa a SQL con timeout (evita colgados/504)
   ========================================================= */
exports.getProductById = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ message: "ID inválido" });

    const pool = await poolPromise;
    const result = await pool.request().timeout(SQL_TIMEOUT).input("id", sql.Int, id).query(`
        SELECT
          p.id_producto      AS id,
          p.nombre_producto  AS nombre,
          p.descripcion,
          p.precio,
          p.imagen,
          p.activo,
          p.id_categoria,
          p.id_marca
        FROM PRODUCTO p
        WHERE p.id_producto = @id AND p.activo = 1;
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    return res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error al obtener el producto:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
