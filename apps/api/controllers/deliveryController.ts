const deliveryService = require("../services/deliveryService");

function getStatus(err) {
  return typeof err?.status === "number" ? err.status : 500;
}

function getMessage(err, fallback) {
  return err?.message || fallback;
}

exports.listRiders = async (_req, res) => {
  try {
    const rows = await deliveryService.listRiders();
    return res.json(rows);
  } catch (err) {
    console.error("listRiders:", err);
    return res.status(getStatus(err)).json({ message: getMessage(err, "Error al listar repartidores") });
  }
};

exports.listAssignable = async (req, res) => {
  try {
    const rows = await deliveryService.listAssignableShipments({
      search: req.query?.search || "",
      limit: req.query?.limit || 100,
    });
    return res.json(rows);
  } catch (err) {
    console.error("listAssignable:", err);
    return res.status(getStatus(err)).json({ message: getMessage(err, "Error al listar pedidos asignables") });
  }
};

exports.listMyShipments = async (req, res) => {
  try {
    const rows = await deliveryService.listMyShipments({
      userId: req.user?.id_usuario,
      estado: req.query?.estado || "",
    });
    return res.json(rows);
  } catch (err) {
    console.error("listMyShipments:", err);
    return res.status(getStatus(err)).json({ message: getMessage(err, "Error al listar mis envíos") });
  }
};

exports.assignShipment = async (req, res) => {
  try {
    const data = await deliveryService.assignShipment({
      orderId: req.body?.orderId,
      motorizadoId: req.body?.motorizadoId,
      assignedBy: req.user?.id_usuario,
    });
    return res.json(data);
  } catch (err) {
    console.error("assignShipment:", err);
    return res.status(getStatus(err)).json({ message: getMessage(err, "Error al asignar pedido") });
  }
};

exports.startRoute = async (req, res) => {
  try {
    const data = await deliveryService.startRoute({
      orderId: req.params?.orderId,
      userId: req.user?.id_usuario,
    });
    return res.json(data);
  } catch (err) {
    console.error("startRoute:", err);
    return res.status(getStatus(err)).json({ message: getMessage(err, "Error al iniciar ruta") });
  }
};

exports.markDelivered = async (req, res) => {
  try {
    const data = await deliveryService.markDelivered({
      orderId: req.params?.orderId,
      userId: req.user?.id_usuario,
      evidence: req.body || {},
    });
    return res.json(data);
  } catch (err) {
    console.error("markDelivered:", err);
    return res.status(getStatus(err)).json({ message: getMessage(err, "Error al registrar entrega") });
  }
};

exports.markFailed = async (req, res) => {
  try {
    const data = await deliveryService.markFailed({
      orderId: req.params?.orderId,
      userId: req.user?.id_usuario,
      motivo: req.body?.motivo,
    });
    return res.json(data);
  } catch (err) {
    console.error("markFailed:", err);
    return res.status(getStatus(err)).json({ message: getMessage(err, "Error al registrar incidencia") });
  }
};

export {};
