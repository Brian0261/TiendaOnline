// backend/routes/dispatchRoutes.js
const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const { createDispatch, listOutbound, exportOutbound } = require("../controllers/dispatchController");

const router = express.Router();

router.post("/", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), createDispatch);
router.get("/outbound", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), listOutbound);
router.get("/outbound/export", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), exportOutbound);

module.exports = router;

export {};
