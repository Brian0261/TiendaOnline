// backend/controllers/productController.js
// ────────────────────────────────────────────────────────────
//  Controlador de PRODUCTO – CRUD + catálogos + activación
//  (robustizado: timeouts, try/catch, consultas directas a SQL
//   para endpoints públicos de listado/lectura)
// ────────────────────────────────────────────────────────────
const productService = require("../services/productService");
const { PLACEHOLDER_PRODUCT } = require("../shared/image");
const historialRepository = require("../repositories/historialRepository");

function getPublicBaseUrl(req) {
  const envBase = String(process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (envBase) return envBase;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = req.get("host");
  return host ? `${proto}://${host}` : "";
}

function buildUploadImageUrl(req, filename) {
  const base = getPublicBaseUrl(req);
  const urlPath = `/api/uploads/images/${encodeURIComponent(filename)}`;
  return base ? `${base}${urlPath}` : urlPath;
}

/* Utilidades */
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

    if (!name || price == null || !categoryId || !brandId) {
      return res.status(400).json({ message: "Campos obligatorios faltantes." });
    }
    const priceN = toNum(price, NaN);
    const stockN = toInt(stock, 0);
    if (!Number.isFinite(priceN) || priceN <= 0 || stockN < 0) {
      return res.status(400).json({ message: "Precio y stock deben ser positivos." });
    }

    const imagePath = req.file ? buildUploadImageUrl(req, req.file.filename) : PLACEHOLDER_PRODUCT;

    const created = await productService.createProduct({
      name: String(name).trim(),
      description: String(description || ""),
      price: priceN,
      categoryId: toInt(categoryId, 0),
      brandId: toInt(brandId, 0),
      stock: stockN,
      imagePath,
    });

    // Auditoría (HISTORIAL)
    if (req.user?.id_usuario) {
      await historialRepository.insertHistorial({
        id_usuario: req.user.id_usuario,
        accion: "PRODUCTO_CREADO",
        descripcion: `Producto creado: id=${created?.id ?? "?"}, nombre=${String(created?.nombre || name).trim()}`,
      });
    }

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

    const imagePath = req.file ? buildUploadImageUrl(req, req.file.filename) : null;

    const updated = await productService.updateProduct(id, {
      name: String(name).trim(),
      description: String(description || ""),
      price: priceN,
      categoryId: toInt(categoryId, 0),
      brandId: toInt(brandId, 0),
      imagePath,
    });

    if (req.user?.id_usuario) {
      await historialRepository.insertHistorial({
        id_usuario: req.user.id_usuario,
        accion: "PRODUCTO_ACTUALIZADO",
        descripcion: `Producto actualizado: id=${id}, nombre=${String(updated?.nombre || name).trim()}`,
      });
    }

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

    await productService.deactivateProduct(id);

    if (req.user?.id_usuario) {
      await historialRepository.insertHistorial({
        id_usuario: req.user.id_usuario,
        accion: "PRODUCTO_DESACTIVADO",
        descripcion: `Producto desactivado: id=${id}`,
      });
    }
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

    await productService.activateProduct(id);

    if (req.user?.id_usuario) {
      await historialRepository.insertHistorial({
        id_usuario: req.user.id_usuario,
        accion: "PRODUCTO_ACTIVADO",
        descripcion: `Producto activado: id=${id}`,
      });
    }
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

    await productService.hardDeleteProduct(id);

    if (req.user?.id_usuario) {
      await historialRepository.insertHistorial({
        id_usuario: req.user.id_usuario,
        accion: "PRODUCTO_ELIMINADO",
        descripcion: `Producto eliminado (hard-delete): id=${id}`,
      });
    }
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
    const data = await productService.getCategories();
    res.json(data);
  } catch (err) {
    console.error("Error al obtener categorías:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getBrands = async (_req, res) => {
  try {
    const data = await productService.getBrands();
    res.json(data);
  } catch (err) {
    console.error("Error al obtener marcas:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/* =========================================================
   LISTADO PÚBLICO (GET /api/products)
   ========================================================= */
// LISTADO PÚBLICO (GET /api/products)
exports.getAllProducts = async (req, res) => {
  try {
    const data = await productService.listProducts({
      status: String(req.query.status || "active").toLowerCase(),
      category: req.query.category ? toInt(req.query.category, 0) : null,
      search: (req.query.search || "").trim(),
      limit: req.query.limit,
      page: req.query.page,
    });

    return res.json(data);
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

    const prod = await productService.getProductByIdPublic(id);
    if (!prod) return res.status(404).json({ message: "Producto no encontrado" });
    return res.json(prod);
  } catch (err) {
    console.error("Error al obtener el producto:", err?.message || err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export {};
