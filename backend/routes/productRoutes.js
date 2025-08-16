// backend/routes/productRoutes.js
// ────────────────────────────────────────────────────────────────
//  Rutas REST para PRODUCTO  (CRUD + catálogos + activar / hard-delete)
// ────────────────────────────────────────────────────────────────
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");

const {
  /* lecturas */
  getAllProducts,
  getProductById,
  getCategories,
  getBrands,

  /* altas / ediciones */
  createProduct,
  updateProduct,

  /* cambios de estado */
  deactivateProduct, //  DELETE  /products/:id              → inactiva
  activateProduct, //  PUT     /products/:id/activate     → reactiva
  hardDeleteProduct, //  DELETE  /products/:id/hard         → borra definitivo
} = require("../controllers/productController");

const router = express.Router();

/* ────────────────────────── Multer (subidas) ───────────────────────── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, "..", "..", "frontend", "assets", "images", "products");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB
});

/* ────────────────────────── Catálogos públicos ─────────────────────── */
router.get("/categories", getCategories);
router.get("/brands", getBrands);

/* ────────────────────────── /api/products ──────────────────────────── */
router
  .route("/")
  /* listado con filtros */
  .get(getAllProducts)
  /* creación (sólo ADMINISTRADOR) */
  .post(authenticateToken, authorizeRoles("ADMINISTRADOR"), upload.single("image"), createProduct);

/* ────────────────────────── /api/products/:id ──────────────────────── */
router
  .route("/:id")
  /* detalle */
  .get(getProductById)
  /* actualización */
  .put(authenticateToken, authorizeRoles("ADMINISTRADOR"), upload.single("image"), updateProduct)
  /* inactivar (soft-delete) */
  .delete(authenticateToken, authorizeRoles("ADMINISTRADOR"), deactivateProduct);

/* ───────────── activar nuevamente ───────────── */
router.put("/:id/activate", authenticateToken, authorizeRoles("ADMINISTRADOR"), activateProduct);

/* ───────────── eliminación definitiva ───────────── */
router.delete("/:id/hard", authenticateToken, authorizeRoles("ADMINISTRADOR"), hardDeleteProduct);

module.exports = router;
