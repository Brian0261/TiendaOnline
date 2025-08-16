// backend/routes/authRoutes.js

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middlewares/authMiddleware");

// Registro de nuevo cliente
router.post("/register", authController.register);

// Inicio de sesión
router.post("/login", authController.login);

// Obtener perfil del usuario autenticado
router.get("/me", authenticateToken, authController.getProfile);

// Actualizar datos personales del usuario autenticado (nombre, apellido, teléfono, dirección)
router.put("/me", authenticateToken, authController.updateProfile);

// Ruta protegida por rol para redirección post-login
router.get("/dashboard", authenticateToken, authController.getDashboardByRole);

module.exports = router;
