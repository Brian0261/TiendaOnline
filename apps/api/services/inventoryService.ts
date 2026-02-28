const inventoryRepository = require("../repositories/inventoryRepository");

async function getInventory(query) {
  const { search = "", almacen = "" } = query || {};
  return inventoryRepository.listInventory({ search, almacen });
}

async function exportInventoryCsv(query) {
  const { search = "", almacen = "" } = query || {};
  const rows = await inventoryRepository.listInventoryForExport({ search, almacen });

  let csv = "ID Inventario,Producto,Almacén,Stock\n";
  for (const r of rows) {
    csv +=
      [r.id_inventario, `"${String(r.producto || "").replace(/"/g, '""')}"`, `"${String(r.almacen || "").replace(/"/g, '""')}"`, r.stock].join(",") +
      "\n";
  }

  return { filename: "inventario.csv", csv };
}

module.exports = {
  getInventory,
  exportInventoryCsv,
};

export {};
