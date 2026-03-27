const inventoryRepository = require("../repositories/inventoryRepository");
const { poolPromise } = require("../config/db.config");

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function getInventory(query) {
  const { search = "" } = query || {};
  return inventoryRepository.listInventory({ search });
}

async function exportInventoryCsv(query) {
  const { search = "" } = query || {};
  const rows = await inventoryRepository.listInventoryForExport({ search });

  let csv = "ID Inventario,Producto,Local,Stock\n";
  for (const r of rows) {
    csv +=
      [r.id_inventario, `"${String(r.producto || "").replace(/"/g, '""')}"`, `"${String(r.almacen || "").replace(/"/g, '""')}"`, r.stock].join(",") +
      "\n";
  }

  return { filename: "inventario.csv", csv };
}

async function searchInventoryForDispatch(query) {
  const { search = "", page = "1", pageSize = "10" } = query || {};
  const normalizedPage = Number.isFinite(Number(page)) ? Number(page) : 1;
  const normalizedPageSize = Number.isFinite(Number(pageSize)) ? Number(pageSize) : 10;

  return inventoryRepository.searchInventoryForDispatch({
    search,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  });
}

async function getInventoryKpis() {
  return inventoryRepository.getInventoryKpis();
}

async function getInventoryPaginated(query) {
  const { search = "", categoriaId = "", page = "1", pageSize = "20" } = query || {};

  const normalizedPage = Number.isFinite(Number(page)) ? Number(page) : 1;
  const normalizedPageSize = Number.isFinite(Number(pageSize)) ? Number(pageSize) : 20;

  return inventoryRepository.listInventoryPaginated({
    search,
    categoriaId,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  });
}

async function getInboundInventoryPaginated(query) {
  const { search = "", categoriaId = "", page = "1", pageSize = "20" } = query || {};

  const normalizedPage = Number.isFinite(Number(page)) ? Number(page) : 1;
  const normalizedPageSize = Number.isFinite(Number(pageSize)) ? Number(pageSize) : 20;

  return inventoryRepository.listInboundInventoryPaginated({
    search,
    categoriaId,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  });
}

async function exportInventoryCsvAdmin(query) {
  const { search = "", categoriaId = "" } = query || {};
  const rows = await inventoryRepository.listInventoryForAdminExport({ search, categoriaId });

  let csv = "Producto,Categoría,Precio,Local,Stock\n";
  for (const r of rows) {
    csv +=
      [
        escapeCsv(r.nombre_producto),
        escapeCsv(r.nombre_categoria),
        Number(r.precio || 0).toFixed(2),
        escapeCsv(r.nombre_almacen),
        Number(r.stock || 0),
      ].join(",") + "\n";
  }

  return { filename: "inventario-admin.csv", csv };
}

async function createInboundInventory({ userId, payload }) {
  const idInventario = Number(payload?.id_inventario);
  const cantidad = Number(payload?.cantidad);
  const motivo = String(payload?.motivo || "")
    .trim()
    .slice(0, 255);

  if (!Number.isInteger(idInventario) || idInventario <= 0) {
    const err = new Error("Inventario inválido");
    (err as any).status = 400;
    throw err;
  }

  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    const err = new Error("Cantidad inválida");
    (err as any).status = 400;
    throw err;
  }

  if (!motivo) {
    const err = new Error("Debes indicar un motivo de entrada");
    (err as any).status = 400;
    throw err;
  }

  const pool = await poolPromise;
  const tx = await pool.connect();
  const normalizedUserId = Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null;

  try {
    await tx.query("BEGIN");

    const inventoryRow = await inventoryRepository.getInventoryRowByIdTx(tx, { idInventario });
    if (!inventoryRow) {
      const err = new Error("Inventario no encontrado");
      (err as any).status = 404;
      throw err;
    }

    await inventoryRepository.incrementInventoryRowTx(tx, { idInventario, cantidad });

    let resolvedResponsibleId = normalizedUserId;
    let inbound;

    try {
      inbound = await inventoryRepository.insertInboundInventoryTx(tx, {
        cantidad,
        motivo,
        idInventario,
        idUsuario: resolvedResponsibleId,
      });
    } catch (err) {
      const errorCode = String((err as any)?.code || "").toUpperCase();
      if (errorCode === "23503" && resolvedResponsibleId) {
        // Si el usuario del token no está disponible por inconsistencia temporal,
        // no bloqueamos la operación de inventario y registramos la entrada sin responsable.
        resolvedResponsibleId = null;
        inbound = await inventoryRepository.insertInboundInventoryTx(tx, {
          cantidad,
          motivo,
          idInventario,
          idUsuario: null,
        });
      } else {
        throw err;
      }
    }

    const updated = await inventoryRepository.getInventoryRowByIdTx(tx, { idInventario });

    await tx.query("COMMIT");

    if (resolvedResponsibleId) {
      try {
        await pool.query(
          `
            INSERT INTO historial (descripcion, accion, id_pedido, id_usuario)
            VALUES ($1, $2, $3, $4)
          `,
          [
            `INVENTARIO_ENTRADA_REGISTRADA: +${cantidad} en inventario #${idInventario}. Motivo: ${motivo}`,
            "INVENTARIO_ENTRADA_REGISTRADA",
            null,
            resolvedResponsibleId,
          ],
        );
      } catch (auditErr) {
        console.warn("createInboundInventory audit warning:", (auditErr as any)?.message || auditErr);
      }
    }

    return {
      ok: true,
      message: "Entrada de inventario registrada correctamente.",
      entry: {
        id_entrada_inventario: Number(inbound?.id_entrada_inventario || 0),
        fecha_entrada_utc: String(inbound?.fecha_entrada_utc || ""),
        id_inventario: idInventario,
        producto: String(updated?.nombre_producto || inventoryRow.nombre_producto || ""),
        almacen: String(updated?.nombre_almacen || inventoryRow.nombre_almacen || ""),
        cantidad,
        motivo,
        responsable_id: resolvedResponsibleId,
      },
      stock: {
        anterior: Number(inventoryRow?.cantidad_disponible || 0),
        nuevo: Number(updated?.cantidad_disponible || 0),
      },
    };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

module.exports = {
  getInventory,
  exportInventoryCsv,
  searchInventoryForDispatch,
  getInventoryKpis,
  getInventoryPaginated,
  getInboundInventoryPaginated,
  exportInventoryCsvAdmin,
  createInboundInventory,
};

export {};
