// backend/controllers/paymentController.js
const { sql, poolPromise } = require("../config/db.config");
const orderCtrl = require("./orderController");

function getUserId(req) {
  return req.user?.id_usuario || req.userId;
}

exports.initIzipay = async (req, res) => {
  try {
    const { orderId, method } = req.body;
    if (!orderId) return res.status(400).json({ message: "orderId requerido" });

    const pool = await poolPromise;
    const orderRes = await pool.request().input("id", sql.Int, orderId).query(`SELECT id_pedido, total_pedido FROM PEDIDO WHERE id_pedido = @id`);
    const order = orderRes.recordset[0];
    if (!order) return res.status(404).json({ message: "Pedido no encontrado" });

    const hasCreds = !!(process.env.IZIPAY_API_KEY && process.env.IZIPAY_API_SECRET);
    if (!hasCreds || process.env.IZIPAY_ENV === "mock") {
      return res.json({ mode: "mock", orderId: order.id_pedido, total: order.total_pedido, method: method || "TARJETA" });
    }

    // TODO: integrar Izipay real (Hosted/Embedded) y devolver redirectUrl o token
    return res.json({ mode: "mock", orderId: order.id_pedido, total: order.total_pedido, method: method || "TARJETA" });
  } catch (err) {
    console.error("initIzipay error:", err);
    res.status(500).json({ message: "Error inicializando el pago" });
  }
};

exports.mockConfirm = async (req, res) => {
  try {
    const userId = req.user?.id_usuario || req.userId;
    const { orderId, receiptType, receiptData, paymentMethodId } = req.body;
    if (!orderId) return res.status(400).json({ message: "orderId requerido" });

    const result = await orderCtrl.finalizeOrderOnPayment({
      orderId,
      userId,
      receiptType,
      receiptData,
      paymentMethodId,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("mockConfirm error:", err);
    return res.status(500).json({ message: "No se pudo confirmar el pago (mock)" });
  }
};
