const db = require("../config/db.config");
const dispatchRepository = require("../repositories/dispatchRepository");

function buildOutboundFilters({ fechaInicio = "", fechaFin = "", search = "", almacen = "" }) {
  const filtros = [];
  const params = [];

  if (fechaInicio && fechaFin) {
    params.push(fechaInicio, fechaFin);
    filtros.push(`si.fecha_salida::date BETWEEN $${params.length - 1} AND $${params.length}`);
  } else if (fechaInicio) {
    params.push(fechaInicio);
    filtros.push(`si.fecha_salida::date >= $${params.length}`);
  } else if (fechaFin) {
    params.push(fechaFin);
    filtros.push(`si.fecha_salida::date <= $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    filtros.push(
      `(p.nombre_producto ILIKE $${params.length} OR si.motivo_salida ILIKE $${params.length} OR (u.nombre || ' ' || u.apellido) ILIKE $${params.length})`,
    );
  }

  if (almacen) {
    params.push(Number(almacen));
    filtros.push(`i.id_almacen = $${params.length}`);
  }

  const whereSql = filtros.length ? "WHERE " + filtros.join(" AND ") : "";
  return { whereSql, params };
}

async function createDispatch({ userId, observacion = "", items = [], id_pedido = null }) {
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
      idPedido: id_pedido ?? null,
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
  const { whereSql, params } = buildOutboundFilters(query || {});
  return dispatchRepository.listOutbound(pool, { whereSql, params });
}

async function exportOutboundCsv(query) {
  const rows = await listOutbound(query);

  let csv = "Fecha/Hora,Producto,Cantidad,Motivo,Almacén,Responsable\n";
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
      `"${String(r.almacen || "").replace(/"/g, '""')}"`,
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
