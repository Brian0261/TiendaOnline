// backend/controllers/inventoryController.js
const inventoryService = require("../services/inventoryService");
const historialRepository = require("../repositories/historialRepository");

exports.getInventory = async (req, res) => {
  try {
    const rows = await inventoryService.getInventory(req.query);
    return res.json(rows);
  } catch (err) {
    console.error("getInventory:", err);
    res.status(500).json({ message: "Error al listar inventario" });
  }
};

exports.exportInventory = async (req, res) => {
  try {
    const { filename, csv } = await inventoryService.exportInventoryCsv(req.query);

    // Auditoría (acción de empleado/admin)
    if (req.user?.id_usuario) {
      await historialRepository.insertHistorial({
        id_usuario: req.user.id_usuario,
        accion: "INVENTARIO_EXPORTADO",
        descripcion: `Exportación de inventario. Filtros: search=${String(req.query?.search || "").trim()} almacen=${String(
          req.query?.almacen || ""
        ).trim()}`,
      });
    }

    res.header("Content-Type", "text/csv");
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    console.error("exportInventory:", err);
    res.status(500).json({ message: "Error al exportar inventario" });
  }
};

export {};
