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
  // lecturas (públicas)
  getAllProducts,
  getProductById,
  getCategories,
  getBrands,
  // altas / ediciones (admin)
  createProduct,
  updateProduct,
  // cambios de estado (admin)
  deactivateProduct, // DELETE   /products/:id          → inactiva (soft-delete)
  activateProduct, // PUT      /products/:id/activate → reactiva
  hardDeleteProduct, // DELETE   /products/:id/hard     → borra definitivo
} = require("../controllers/productController");

const router = express.Router();

/* ────────────────────────── Helper: wrap async ─────────────────────────
   Garantiza que cualquier error asíncrono pase al error handler global,
   evitando cuelgues (504 del ingress) por promesas no atrapadas.
------------------------------------------------------------------------ */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ────────────────────────── Multer (subidas) ───────────────────────── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, "..", "..", "frontend", "assets", "images");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  // Acepta solo imágenes comunes
  const ok = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"].includes(file.mimetype);
  if (!ok) return cb(new Error("Tipo de archivo no permitido. Sube una imagen (jpg, png, webp, gif)."));
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB
  fileFilter,
});

/* ────────────────────────── Catálogos públicos ─────────────────────── */
router.get("/categories", wrap(getCategories));
router.get("/brands", wrap(getBrands));

/* ────────────────────────── /api/products (público GET) ────────────── */
router
  .route("/")
  .get(wrap(getAllProducts)) // listado público
  .post(authenticateToken, authorizeRoles("ADMINISTRADOR"), upload.single("image"), wrap(createProduct));

/* ────────────────────────── /api/products/:id ──────────────────────── */
router
  .route("/:id")
  .get(wrap(getProductById)) // detalle público
  .put(authenticateToken, authorizeRoles("ADMINISTRADOR"), upload.single("image"), wrap(updateProduct))
  .delete(authenticateToken, authorizeRoles("ADMINISTRADOR"), wrap(deactivateProduct));

/* ───────────── activar nuevamente ───────────── */
router.put("/:id/activate", authenticateToken, authorizeRoles("ADMINISTRADOR"), wrap(activateProduct));

/* ───────────── eliminación definitiva ───────────── */
router.delete("/:id/hard", authenticateToken, authorizeRoles("ADMINISTRADOR"), wrap(hardDeleteProduct));

module.exports = router;
