const db = require("../config/db.config");
const dispatchRepository = require("../repositories/dispatchRepository");

const DISPATCH_BUSINESS_TIMEZONE = "America/Lima";

function normalizeDateInput(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const err = new Error("Formato de fecha inválido. Usa YYYY-MM-DD.");
    (err as any).status = 400;
    throw err;
  }
  return v;
}

function buildOutboundFilters({ fechaInicio = "", fechaFin = "", search = "" }) {
  const filtros = [];
  const params = [];

  const startDate = normalizeDateInput(fechaInicio);
  const endDate = normalizeDateInput(fechaFin);

  if (startDate && endDate && startDate > endDate) {
    const err = new Error("El rango de fechas es inválido.");
    (err as any).status = 400;
    throw err;
  }

  const businessDateExpr = `(si.fecha_salida AT TIME ZONE '${DISPATCH_BUSINESS_TIMEZONE}')::date`;

  if (startDate && endDate) {
    params.push(startDate, endDate);
    filtros.push(`${businessDateExpr} BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
  } else if (startDate) {
    params.push(startDate);
    filtros.push(`${businessDateExpr} >= $${params.length}::date`);
  } else if (endDate) {
    params.push(endDate);
    filtros.push(`${businessDateExpr} <= $${params.length}::date`);
  }

  const searchText = String(search || "").trim();
  if (searchText) {
    params.push(`%${searchText}%`);
    filtros.push(
      `(p.nombre_producto ILIKE $${params.length} OR si.motivo_salida ILIKE $${params.length} OR (u.nombre || ' ' || u.apellido) ILIKE $${params.length})`,
    );
  }

  const whereSql = filtros.length ? "WHERE " + filtros.join(" AND ") : "";
  return { whereSql, params };
}

async function createDispatch({ userId, observacion = "", items = [] }) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error("No hay items para despachar.");
    (err as any).status = 400;
    throw err;
  }

  for (const it of items) {
    if (!Number.isInteger(it?.id_inventario) || !Number.isInteger(it?.cantidad) || it.cantidad <= 0) {
      const err = new Error("Item inválido (id_inventario/cantidad).");
      (err as any).status = 400;
      throw err;
    }
  }

  const pool = await db.poolPromise;
  const tx = await pool.connect();

  try {
    await tx.query("BEGIN");
    const summary = [];

    for (const it of items) {
      const ok = await dispatchRepository.decrementInventoryStockAtomicTx(tx, {
        idInventario: it.id_inventario,
        cantidad: it.cantidad,
      });

      if (!ok) {
        const err = new Error("Stock insuficiente");
        (err as any).status = 409;
        (err as any).detail = { id_inventario: it.id_inventario, cantidad: it.cantidad };
        throw err;
      }

      await dispatchRepository.insertSalidaInventarioTx(tx, {
        cantidad: it.cantidad,
        motivo: (observacion || "").substring(0, 255),
        idInventario: it.id_inventario,
        userId,
      });

      const after = await dispatchRepository.getInventoryAfterTx(tx, { idInventario: it.id_inventario });
      summary.push({
        id_inventario: it.id_inventario,
        cantidad: it.cantidad,
        nuevo_stock: after?.nuevo_stock ?? null,
        nombre: after?.nombre_producto ?? "",
      });
    }

    await dispatchRepository.insertHistorialTx(tx, {
      descripcion: `SALIDA_DESPACHO: ${items.length} items. ${(observacion || "").substring(0, 200)}`,
      accion: "SALIDA_DESPACHO",
      idPedido: null,
      userId,
    });

    await tx.query("COMMIT");
    return {
      ok: true,
      items: summary,
      message: "Despacho registrado correctamente.",
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

async function listOutbound(query) {
  const pool = await db.poolPromise;
  const page = Math.max(Number(query?.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(query?.pageSize) || 20, 1), 200);
  const offset = (page - 1) * pageSize;
  const { whereSql, params } = buildOutboundFilters(query || {});
  const { rows, total } = await dispatchRepository.listOutbound(pool, { whereSql, params, limit: pageSize, offset });

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil((Number(total) || 0) / pageSize), 1),
  };
}

async function exportOutboundCsv(query) {
  const pool = await db.poolPromise;
  const { whereSql, params } = buildOutboundFilters(query || {});
  const { rows } = await dispatchRepository.listOutbound(pool, {
    whereSql,
    params,
    limit: Math.min(Math.max(Number(query?.limit) || 10000, 1), 20000),
    offset: 0,
  });

  let csv = "Fecha/Hora,Producto,Cantidad,Motivo,Responsable\n";
  for (const r of rows) {
    const fecha = new Date(r.fecha_salida_utc).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      hour12: false,
    });

    const row = [
      `"${fecha}"`,
      `"${String(r.producto || "").replace(/"/g, '""')}"`,
      r.cantidad,
      `"${String(r.motivo || "").replace(/"/g, '""')}"`,
      `"${String(r.responsable || "-").replace(/"/g, '""')}"`,
    ].join(",");
    csv += row + "\n";
  }

  return { filename: "salidas.csv", csv };
}

module.exports = {
  createDispatch,
  listOutbound,
  exportOutboundCsv,
};

export {};
