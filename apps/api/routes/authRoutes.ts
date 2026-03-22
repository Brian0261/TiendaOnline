// backend/routes/authRoutes.js

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middlewares/authMiddleware");
const { createLoginLimiter, createRegisterLimiter, createForgotPasswordLimiter, createResetPasswordLimiter } = require("../middlewares/rateLimiters");
const { checkLoginLock } = require("../middlewares/bruteforceProtection");

const loginLimiter = createLoginLimiter();
const registerLimiter = createRegisterLimiter();
const forgotPasswordLimiter = createForgotPasswordLimiter();
const resetPasswordLimiter = createResetPasswordLimiter();

// Registro de nuevo cliente
router.post("/register", registerLimiter, authController.register);

// Inicio de sesión
router.post("/login", loginLimiter, checkLoginLock, authController.login);
router.post("/login/customer", loginLimiter, checkLoginLock, authController.loginCustomer);
router.post("/login/staff", loginLimiter, checkLoginLock, authController.loginStaff);

// Refrescar access token usando refresh token (cookie httpOnly)
router.post("/refresh", authController.refresh);

// Cerrar sesión (limpia cookie de refresh)
router.post("/logout", authController.logout);

// Recuperación / restablecimiento de contraseña
router.post("/forgot-password", forgotPasswordLimiter, authController.forgotPassword);
router.post("/reset-password", resetPasswordLimiter, authController.resetPassword);

// Verificación de email (doble opt-in)
router.post("/request-email-verification", registerLimiter, authController.requestEmailVerification);
router.post("/verify-email", authController.verifyEmail);

// Obtener perfil del usuario autenticado
router.get("/me", authenticateToken, authController.getProfile);

// Actualizar datos personales del usuario autenticado (nombre, apellido, teléfono, dirección)
router.put("/me", authenticateToken, authController.updateProfile);

// Ruta protegida por rol para redirección post-login
router.get("/dashboard", authenticateToken, authController.getDashboardByRole);

module.exports = router;

export {};
