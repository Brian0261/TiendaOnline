const historialRepository = require("../repositories/historialRepository");

function toInt(v, def) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

exports.getHistorial = async (req, res) => {
  try {
    const hasLegacyLimitOnly =
      req.query.limit !== undefined &&
      req.query.page === undefined &&
      req.query.pageSize === undefined &&
      req.query.accion === undefined &&
      req.query.usuario === undefined &&
      req.query.fechaInicio === undefined &&
      req.query.fechaFin === undefined;

    if (hasLegacyLimitOnly) {
      const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
      const rows = await historialRepository.listRecent({ limit });
      return res.json(rows);
    }

    const page = Math.max(toInt(req.query.page, 1), 1);
    const pageSize = Math.min(Math.max(toInt(req.query.pageSize, 20), 1), 100);
    const accion = String(req.query.accion || "").trim();
    const modulo = String(req.query.modulo || "").trim();
    const usuario = String(req.query.usuario || "").trim();
    const fechaInicio = String(req.query.fechaInicio || "").trim();
    const fechaFin = String(req.query.fechaFin || "").trim();

    const result = await historialRepository.listPaginated({
      page,
      pageSize,
      accion,
      modulo,
      usuario,
      fechaInicio,
      fechaFin,
    });

    return res.json(result);
  } catch (err) {
    console.error("getHistorial:", err);
    return res.status(500).json({ message: "Error al obtener auditoría." });
  }
};

module.exports = {
  getHistorial: exports.getHistorial,
};

export {};
