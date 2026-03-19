// backend/routes/dispatchRoutes.js
const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const { createDispatch, listOutbound, exportOutbound } = require("../controllers/dispatchController");

const router = express.Router();

const allowAdminDispatchCreate =
  String(process.env.DISPATCH_ADMIN_CONTINGENCY || "")
    .trim()
    .toLowerCase() === "1";
const dispatchCreateRoles = allowAdminDispatchCreate ? ["EMPLEADO", "ADMINISTRADOR"] : ["EMPLEADO"];

router.post("/", authenticateToken, authorizeRoles(...dispatchCreateRoles), createDispatch);
router.get("/outbound", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), listOutbound);
router.get("/outbound/export", authenticateToken, authorizeRoles("EMPLEADO", "ADMINISTRADOR"), exportOutbound);

module.exports = router;

export {};
