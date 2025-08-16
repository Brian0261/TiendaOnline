// backend/controllers/productController.js
// ────────────────────────────────────────────────────────────
//  Controlador de PRODUCTO – CRUD + catálogos + activación
// ────────────────────────────────────────────────────────────
const { sql, poolPromise } = require("../config/db.config");
const Product = require("../models/Product");

/* =========================================================
   CREAR  (POST /api/products)
   ========================================================= */
exports.createProduct = async (req, res) => {
  try {
    const { name, description = "", price, categoryId, brandId, stock } = req.body;

    /* Validaciones mínimas */
    if (!name || !price || !categoryId || !brandId) {
      return res.status(400).json({ message: "Campos obligatorios faltantes." });
    }
    if (+price <= 0 || +stock < 0) {
      return res.status(400).json({ message: "Precio y stock deben ser positivos." });
    }

    const imagePath = req.file ? `assets/images/products/${req.file.filename}` : "assets/images/placeholder-product.png";

    const newId = await Product.createProduct({
      name,
      description,
      price: +price,
      categoryId: +categoryId,
      brandId: +brandId,
      stock: +stock,
      imagePath,
    });

    const created = await Product.getProductById(newId);
    return res.status(201).json(created);
  } catch (err) {
    console.error("Error al crear producto:", err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   ACTUALIZAR  (PUT /api/products/:id)
   ========================================================= */
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description = "", price, categoryId, brandId } = req.body;

    if (!name || !price || !categoryId || !brandId) {
      return res.status(400).json({ message: "Campos obligatorios faltantes." });
    }

    const imagePath = req.file ? `assets/images/products/${req.file.filename}` : null;

    await Product.updateProduct(+id, {
      name,
      description,
      price: +price,
      categoryId: +categoryId,
      brandId: +brandId,
      imagePath,
    });

    const updated = await Product.getProductById(+id);
    res.json(updated);
  } catch (err) {
    console.error("Error al actualizar producto:", err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   DESACTIVAR (soft-delete)  (DELETE /api/products/:id)
   ========================================================= */
exports.deactivateProduct = async (req, res) => {
  try {
    await Product.deactivateProduct(+req.params.id); // UPDATE activo = 0
    res.status(204).end();
  } catch (err) {
    console.error("Error al desactivar producto:", err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   ACTIVAR  (PUT /api/products/:id/activate)
   ========================================================= */
exports.activateProduct = async (req, res) => {
  try {
    await Product.activateProduct(+req.params.id); // UPDATE activo = 1
    res.status(204).end();
  } catch (err) {
    console.error("Error al activar producto:", err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   ELIMINACIÓN DEFINITIVA  (DELETE /api/products/:id/hard)
   ========================================================= */
exports.hardDeleteProduct = async (req, res) => {
  try {
    await Product.hardDeleteProduct(+req.params.id); // borra FK + producto
    res.status(204).end();
  } catch (err) {
    console.error("Error al eliminar:", err);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

/* =========================================================
   CATÁLOGOS  (GET /api/products/categories | brands)
   ========================================================= */
exports.getCategories = async (_req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request().query(`
      SELECT id_categoria AS id, nombre_categoria AS name
      FROM   CATEGORIA
      ORDER  BY nombre_categoria;
    `);
    res.json(recordset);
  } catch (err) {
    console.error("Error al obtener categorías:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getBrands = async (_req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request().query(`
      SELECT id_marca AS id, nombre_marca AS name
      FROM   MARCA
      ORDER  BY nombre_marca;
    `);
    res.json(recordset);
  } catch (err) {
    console.error("Error al obtener marcas:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/* =========================================================
   LISTADO (GET /api/products?status=…)
   ========================================================= */
exports.getAllProducts = async (req, res) => {
  try {
    // status = active | inactive | all (default: active)
    // 👇 Nuevo: lee parámetros
    const { status, category, search } = req.query;

    // Pásalos a Product.getAllProducts
    const prods = await Product.getAllProducts({
      status,
      category,
      search,
    });

    res.json(prods);
  } catch (err) {
    console.error("Error al obtener productos:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
/* =========================================================
   DETALLE (GET /api/products/:id)
   ========================================================= */
exports.getProductById = async (req, res) => {
  try {
    const prod = await Product.getProductById(+req.params.id);
    if (!prod) return res.status(404).json({ message: "Producto no encontrado" });
    res.json(prod);
  } catch (err) {
    console.error("Error al obtener el producto:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
