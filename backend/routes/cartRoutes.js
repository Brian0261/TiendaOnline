const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const { authenticateToken } = require("../middlewares/authMiddleware");

router.get("/", authenticateToken, cartController.getCartByUserId);
router.get("/count", authenticateToken, cartController.getCartCount); // NUEVA RUTA
router.post("/add", authenticateToken, cartController.addToCart);
router.put("/update/:id_carrito", authenticateToken, cartController.updateCartItem);
router.delete("/remove/:id_carrito", authenticateToken, cartController.removeCartItem);
router.delete("/clear", authenticateToken, cartController.clearCart);
router.get("/count", authenticateToken, cartController.getCartCount);

module.exports = router;
