// backend/routes/categoryRoutes.js
const router = require("express").Router();
const ctrl = require("../controllers/categoryController");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");

// Solo admin puede gestionar categorías (ajusta roles si corresponde)
router.get("/", authenticateToken, authorizeRoles("ADMINISTRADOR"), ctrl.list);
router.post("/", authenticateToken, authorizeRoles("ADMINISTRADOR"), ctrl.create);
router.put("/:id", authenticateToken, authorizeRoles("ADMINISTRADOR"), ctrl.update);
router.delete("/:id", authenticateToken, authorizeRoles("ADMINISTRADOR"), ctrl.remove);

module.exports = router;
