// backend/controllers/dispatchController.js
const dispatchService = require("../services/dispatchService");

exports.createDispatch = async (req, res) => {
  try {
    const userId = req.user?.id_usuario;
    const { observacion = "", items = [] } = req.body || {};
    const data = await dispatchService.createDispatch({ userId, observacion, items });
    return res.json(data);
  } catch (err) {
    const status = err.status || 500;
    if (status === 409 && err.detail) {
      return res.status(409).json({
        message: "Stock insuficiente para uno o más productos.",
        detail: err.detail,
      });
    }

    console.error("createDispatch:", err);
    return res.status(status).json({ message: "Error al registrar el despacho." });
  }
};

// Listar salidas (con filtros)
exports.listOutbound = async (req, res) => {
  try {
    const rows = await dispatchService.listOutbound(req.query);
    return res.json(rows);
  } catch (err) {
    console.error("listOutbound:", err);
    const status = err?.status || 500;
    res.status(status).json({ message: err?.message || "Error al listar salidas" });
  }
};

// Exportar CSV de salidas
exports.exportOutbound = async (req, res) => {
  try {
    const { filename, csv } = await dispatchService.exportOutboundCsv(req.query);
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    console.error("exportOutbound:", err);
    const status = err?.status || 500;
    res.status(status).json({ message: err?.message || "Error al exportar salidas" });
  }
};

export {};
