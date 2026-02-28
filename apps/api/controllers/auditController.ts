const historialRepository = require("../repositories/historialRepository");

function toInt(v, def) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

exports.getHistorial = async (req, res) => {
  try {
    const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
    const rows = await historialRepository.listRecent({ limit });
    return res.json(rows);
  } catch (err) {
    console.error("getHistorial:", err);
    return res.status(500).json({ message: "Error al obtener auditoría." });
  }
};

module.exports = {
  getHistorial: exports.getHistorial,
};

export {};
