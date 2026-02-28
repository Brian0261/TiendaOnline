// backend/controllers/cartController.js
// ──────────────────────────────────────
//  Controlador de carrito (HU5 – HU6)
//  Usa la conexión global poolPromise
// ──────────────────────────────────────

const cartService = require("../services/cartService");

/* ───────── helpers internos ───────── */
// extrae el id según dónde lo hayas guardado en el middleware
const getUserId = req => req.userId || req.user?.id_usuario;

// ─────────────────────────────────────
//  Obtener productos del carrito (con imagen y descripción)
// ─────────────────────────────────────
exports.getCartByUserId = async (req, res) => {
  const userId = req.user?.id_usuario || req.userId;
  if (!userId) return res.status(401).json({ success: false, message: "No autenticado" });

  try {
    const data = await cartService.getCartByUserId(userId);
    return res.json(data);
  } catch (err) {
    console.error("getCartByUserId error:", err);
    return res.status(500).json({ success: false, message: "No se pudo cargar el carrito" });
  }
};

/* ─────────────────────────────────────
   Agregar producto al carrito
───────────────────────────────────── */
exports.addToCart = async (req, res) => {
  const userId = getUserId(req);
  const { id_producto, cantidad } = req.body;

  if (!id_producto || !cantidad || cantidad <= 0) {
    return res.status(400).json({ success: false, message: "Datos inválidos" });
  }

  try {
    const data = await cartService.addToCart(userId, { id_producto, cantidad });
    res.json(data);
  } catch (err) {
    console.error("Error al agregar al carrito:", err);
    if (err?.status) return res.status(err.status).json({ success: false, message: err.message, detail: err.detail });
    res.status(500).json({ success: false, message: "Error al agregar al carrito" });
  }
};

/* ─────────────────────────────────────
   Actualizar cantidad / eliminar ítem
───────────────────────────────────── */
exports.updateCartItem = async (req, res) => {
  const userId = getUserId(req);
  const { id_producto, cantidad } = req.body;

  if (!id_producto || cantidad < 0) {
    return res.status(400).json({ success: false, message: "Datos inválidos" });
  }

  try {
    const data = await cartService.updateCartItem(userId, { id_producto, cantidad });
    res.json(data);
  } catch (err) {
    console.error("Error al actualizar carrito:", err);
    if (err?.status) return res.status(err.status).json({ success: false, message: err.message, detail: err.detail });
    res.status(500).json({ success: false, message: "Error al actualizar carrito" });
  }
};

/* ─────────────────────────────────────
   Vaciar carrito
───────────────────────────────────── */
exports.clearCart = async (req, res) => {
  const userId = getUserId(req);

  try {
    const data = await cartService.clearCart(userId);
    res.json(data);
  } catch (err) {
    console.error("Error al vaciar carrito:", err);
    res.status(500).json({ success: false, message: "Error al vaciar carrito" });
  }
};

/* ─────────────────────────────────────
   Eliminar un ítem por id_carrito
───────────────────────────────────── */
exports.removeCartItem = async (req, res) => {
  const userId = getUserId(req);
  const { id_carrito } = req.params;

  try {
    const data = await cartService.removeCartItem(userId, Number(id_carrito));
    res.json(data);
  } catch (err) {
    console.error("Error al eliminar del carrito:", err);
    res.status(500).json({ success: false, message: "Error al eliminar del carrito" });
  }
};

/* ─────────────────────────────────────
   Contador de productos en carrito
───────────────────────────────────── */
exports.getCartCount = async (req, res) => {
  try {
    const userId = req.user?.id_usuario || req.userId;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const data = await cartService.getCartCount(userId);
    res.json(data);
  } catch (err) {
    console.error("getCartCount error:", err);
    res.status(500).json({ message: "No se pudo obtener el contador" });
  }
};

export {};
