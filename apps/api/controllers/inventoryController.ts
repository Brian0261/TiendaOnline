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
        descripcion: `Exportación de inventario. Filtros: search=${String(req.query?.search || "").trim()}`,
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

exports.searchDispatchInventory = async (req, res) => {
  try {
    const result = await inventoryService.searchInventoryForDispatch(req.query);
    return res.json(result);
  } catch (err) {
    console.error("searchDispatchInventory:", err);
    res.status(500).json({ message: "Error al buscar inventario para despacho" });
  }
};

exports.getInventoryKpis = async (_req, res) => {
  try {
    const data = await inventoryService.getInventoryKpis();
    return res.json(data);
  } catch (err) {
    console.error("getInventoryKpis:", err);
    res.status(500).json({ message: "Error al obtener KPIs de inventario" });
  }
};

exports.getInventoryPaginated = async (req, res) => {
  try {
    const result = await inventoryService.getInventoryPaginated(req.query);
    return res.json(result);
  } catch (err) {
    console.error("getInventoryPaginated:", err);
    res.status(500).json({ message: "Error al listar inventario paginado" });
  }
};

exports.getInboundInventoryPaginated = async (req, res) => {
  try {
    const result = await inventoryService.getInboundInventoryPaginated(req.query);
    return res.json(result);
  } catch (err) {
    const errorCode = String((err as any)?.code || "").toUpperCase();
    const detail = String((err as any)?.message || "Error desconocido");
    const isStatementTimeout = errorCode === "57014" || detail.toLowerCase().includes("statement timeout");
    const status = isStatementTimeout ? 503 : 500;

    console.error("getInboundInventoryPaginated:", {
      code: errorCode || null,
      message: detail,
      query: req.originalUrl,
    });

    return res.status(status).json({
      message: isStatementTimeout
        ? "Inventario temporalmente no disponible. Intenta nuevamente."
        : "Error al listar entradas de inventario",
      code: errorCode || "INBOUND_INVENTORY_ERROR",
    });
  }
};

exports.createInboundInventory = async (req, res) => {
  try {
    const data = await inventoryService.createInboundInventory({
      userId: req.user?.id_usuario,
      payload: req.body || {},
    });
    return res.status(201).json(data);
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ message: err?.message || "Solicitud inválida" });
    }

    console.error("createInboundInventory:", err);
    return res.status(500).json({ message: "Error al registrar entrada de inventario" });
  }
};

exports.exportInventoryAdmin = async (req, res) => {
  try {
    const { filename, csv } = await inventoryService.exportInventoryCsvAdmin(req.query);

    if (req.user?.id_usuario) {
      await historialRepository.insertHistorial({
        id_usuario: req.user.id_usuario,
        accion: "INVENTARIO_ADMIN_EXPORTADO",
        descripcion:
          `Exportación admin de inventario. Filtros: search=${String(req.query?.search || "").trim()}` +
          ` categoriaId=${String(req.query?.categoriaId || "").trim()}`,
      });
    }

    res.header("Content-Type", "text/csv");
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    console.error("exportInventoryAdmin:", err);
    res.status(500).json({ message: "Error al exportar inventario admin" });
  }
};

export {};
