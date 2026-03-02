const { poolPromise } = require("../config/db.config");

async function listOrdersAdmin({ search = "", estado = "", fechaInicio = "", fechaFin = "" }) {
  const filtros = [];
  const params = [];

  if (estado) {
    params.push(estado);
    filtros.push(`pe.estado_pedido = $${params.length}`);
  }
  if (fechaInicio && fechaFin) {
    params.push(fechaInicio, fechaFin);
    filtros.push(`pe.fecha_creacion::date BETWEEN $${params.length - 1} AND $${params.length}`);
  } else if (fechaInicio) {
    params.push(fechaInicio);
    filtros.push(`pe.fecha_creacion::date >= $${params.length}`);
  } else if (fechaFin) {
    params.push(fechaFin);
    filtros.push(`pe.fecha_creacion::date <= $${params.length}`);
  }
  if (search) {
    const idPedido = isNaN(Number(search)) ? null : Number(search);
    params.push(`%${search}%`);
    const textParam = `$${params.length}`;
    let idParam = "NULL";
    if (Number.isFinite(idPedido)) {
      params.push(idPedido);
      idParam = `$${params.length}`;
    }
    filtros.push(`(u.nombre ILIKE ${textParam} OR u.apellido ILIKE ${textParam} OR u.email ILIKE ${textParam} OR pe.id_pedido = ${idParam})`);
  }

  const where = filtros.length ? "WHERE " + filtros.join(" AND ") : "";

  const pool = await poolPromise;
  const pedidosRes = await pool.query(
    `
      SELECT 
        pe.id_pedido,
        pe.fecha_creacion,
        pe.estado_pedido,
        pe.total_pedido,
        u.id_usuario,
        u.nombre || ' ' || u.apellido AS cliente,
        u.email
      FROM pedido pe
      INNER JOIN usuario u ON pe.id_usuario = u.id_usuario
      ${where}
      ORDER BY pe.fecha_creacion DESC, pe.id_pedido DESC
    `,
    params,
  );

  const pedidos = pedidosRes.rows || [];

  const ids = pedidos.map(p => Number(p.id_pedido)).filter(n => Number.isFinite(n));
  let detalles = [];
  if (ids.length) {
    const detallesRes = await pool.query(
      `
        SELECT 
          dp.id_pedido,
          p.nombre_producto AS nombre,
          dp.cantidad,
          dp.precio_unitario_venta
        FROM detalle_pedido dp
        INNER JOIN producto p ON dp.id_producto = p.id_producto
        WHERE dp.id_pedido = ANY($1)
      `,
      [ids],
    );
    detalles = detallesRes.rows || [];
  }

  return { pedidos, detalles };
}

async function listOrdersByUser(userId) {
  const pool = await poolPromise;
  const pedidosRes = await pool.query(
    `
      SELECT 
        pe.id_pedido,
        pe.fecha_creacion,
        pe.estado_pedido,
        pe.total_pedido
      FROM pedido pe
      WHERE pe.id_usuario = $1
      ORDER BY pe.fecha_creacion DESC, pe.id_pedido DESC
    `,
    [userId],
  );

  const pedidos = pedidosRes.rows || [];
  const ids = pedidos.map(p => Number(p.id_pedido)).filter(n => Number.isFinite(n));

  let detalles = [];
  if (ids.length) {
    const detallesRes = await pool.query(
      `
        SELECT 
          dp.id_pedido,
          p.nombre_producto AS nombre,
          dp.cantidad,
          dp.precio_unitario_venta
        FROM detalle_pedido dp
        INNER JOIN producto p ON dp.id_producto = p.id_producto
        WHERE dp.id_pedido = ANY($1)
      `,
      [ids],
    );
    detalles = detallesRes.rows || [];
  }

  return { pedidos, detalles };
}

async function listPendingOrders({ fechaInicio, fechaFin, search = "" }) {
  const pool = await poolPromise;
  const params = [];
  let where = "WHERE pe.estado_pedido = 'PENDIENTE'";
  if (fechaInicio && fechaFin) {
    params.push(fechaInicio, fechaFin);
    where += ` AND pe.fecha_creacion::date BETWEEN $${params.length - 1} AND $${params.length}`;
  } else if (fechaInicio) {
    params.push(fechaInicio);
    where += ` AND pe.fecha_creacion::date >= $${params.length}`;
  } else if (fechaFin) {
    params.push(fechaFin);
    where += ` AND pe.fecha_creacion::date <= $${params.length}`;
  }

  if (search) {
    const idPedido = isNaN(Number(search)) ? null : Number(search);
    params.push(`%${search}%`);
    const textParam = `$${params.length}`;
    let idParam = "NULL";
    if (Number.isFinite(idPedido)) {
      params.push(idPedido);
      idParam = `$${params.length}`;
    }
    where += ` AND (
      u.nombre ILIKE ${textParam}
      OR u.apellido ILIKE ${textParam}
      OR pe.id_pedido = ${idParam}
      OR EXISTS (
          SELECT 1
          FROM detalle_pedido dp
          JOIN producto p ON p.id_producto = dp.id_producto
          WHERE dp.id_pedido = pe.id_pedido
            AND p.nombre_producto ILIKE ${textParam}
      )
    )`;
  }

  const pedidosRes = await pool.query(
    `
      SELECT 
        pe.id_pedido,
        pe.fecha_creacion,
        pe.estado_pedido,
        pe.direccion_envio,
        u.nombre || ' ' || u.apellido AS cliente
      FROM pedido pe
      INNER JOIN usuario u ON u.id_usuario = pe.id_usuario
      ${where}
      ORDER BY pe.fecha_creacion ASC, pe.id_pedido ASC
    `,
    params,
  );

  const pedidos = pedidosRes.rows || [];
  if (!pedidos.length) return { pedidos: [], detalles: [] };

  const ids = pedidos.map(p => Number(p.id_pedido)).filter(n => Number.isFinite(n));
  const detallesRes = await pool.query(
    `
      SELECT 
        dp.id_pedido,
        dp.cantidad,
        p.nombre_producto AS nombre
      FROM detalle_pedido dp
      INNER JOIN producto p ON dp.id_producto = p.id_producto
      WHERE dp.id_pedido = ANY($1)
    `,
    [ids],
  );

  return { pedidos, detalles: detallesRes.rows || [] };
}

async function getOrderHeaderById(id) {
  const pool = await poolPromise;
  const headerRes = await pool.query(
    `
      SELECT 
        pe.id_pedido,
        pe.fecha_creacion,
        pe.estado_pedido,
        pe.total_pedido,
        pe.direccion_envio,
        u.nombre || ' ' || u.apellido AS cliente
      FROM pedido pe
      JOIN usuario u ON u.id_usuario = pe.id_usuario
      WHERE pe.id_pedido = $1
    `,
    [id],
  );
  return headerRes.rows[0] || null;
}

async function getOrderItemsById(id) {
  const pool = await poolPromise;
  const itemsRes = await pool.query(
    `
      SELECT 
        p.nombre_producto AS nombre,
        dp.cantidad,
        dp.precio_unitario_venta AS precio
      FROM detalle_pedido dp
      JOIN producto p ON p.id_producto = dp.id_producto
      WHERE dp.id_pedido = $1
    `,
    [id],
  );
  return itemsRes.rows || [];
}

async function getOrderStateById(id) {
  const pool = await poolPromise;
  const pedRes = await pool.query(
    `
      SELECT estado_pedido
      FROM pedido
      WHERE id_pedido = $1
    `,
    [id],
  );
  return pedRes.rows[0]?.estado_pedido || null;
}

async function updateOrderState(id, estado) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE pedido
      SET estado_pedido = $2
      WHERE id_pedido = $1
    `,
    [id, estado],
  );
}

async function updateOrderStateTx(tx, id, estado) {
  await tx.query(
    `
      UPDATE pedido
      SET estado_pedido = $2
      WHERE id_pedido = $1
    `,
    [id, estado],
  );
}

async function updateShippingOnTransition(id, to) {
  const pool = await poolPromise;
  if (to === "EN CAMINO") {
    await pool.query(
      `
        UPDATE envio
        SET estado_envio = 'EN CAMINO',
            fecha_envio  = COALESCE(fecha_envio, NOW())
        WHERE id_pedido = $1
      `,
      [id],
    );
  } else if (to === "ENTREGADO") {
    await pool.query(
      `
        UPDATE envio
        SET estado_envio = 'ENTREGADO'
        WHERE id_pedido = $1
      `,
      [id],
    );
  }
}

async function insertHistory({ descripcion, accion, id_pedido, id_usuario }) {
  const pool = await poolPromise;
  await pool.query(
    `
      INSERT INTO historial (descripcion, accion, id_pedido, id_usuario)
      VALUES ($1, $2, $3, $4)
    `,
    [descripcion, accion, id_pedido, id_usuario],
  );
}

async function insertHistoryTx(tx, { descripcion, accion, id_pedido, id_usuario }) {
  await tx.query(
    `
      INSERT INTO historial (descripcion, accion, id_pedido, id_usuario)
      VALUES ($1, $2, $3, $4)
    `,
    [descripcion, accion, id_pedido ?? null, id_usuario],
  );
}

async function listTransitionableOrders() {
  const pool = await poolPromise;
  const result = await pool.query(
    `
      SELECT
        pe.id_pedido,
        pe.fecha_creacion,
        pe.estado_pedido AS estado_actual,
        CASE 
          WHEN pe.estado_pedido = 'PREPARADO' THEN 'EN CAMINO'
          WHEN pe.estado_pedido = 'EN CAMINO' THEN 'ENTREGADO'
          ELSE NULL
        END AS siguiente_estado,
        u.nombre || ' ' || u.apellido AS cliente,
        pe.direccion_envio
      FROM pedido pe
      INNER JOIN usuario u ON u.id_usuario = pe.id_usuario
      WHERE pe.estado_pedido IN ('PREPARADO','EN CAMINO')
      ORDER BY pe.fecha_creacion ASC, pe.id_pedido ASC
    `,
  );
  return result.rows || [];
}

async function listStatusLog(limit) {
  const pool = await poolPromise;
  const safeLimit = Math.min(Number(limit) || 20, 100);
  const result = await pool.query(
    `
      SELECT
        to_char(h.fecha_accion AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS fecha_iso_utc,
        h.id_pedido,
        h.descripcion AS cambio,
        u.nombre || ' ' || u.apellido AS responsable
      FROM historial h
      INNER JOIN usuario u ON u.id_usuario = h.id_usuario
      WHERE h.accion IN ('TRANSICION_ESTADO','PREPARAR_PEDIDO')
      ORDER BY h.fecha_accion DESC, h.id_historial DESC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows || [];
}

async function getEmployeeKpis() {
  const pool = await poolPromise;
  const result = await pool.query(
    `
      SELECT
        (SELECT COUNT(*) FROM pedido WHERE estado_pedido = 'PENDIENTE') AS pendientes,
        (SELECT COUNT(*) FROM pedido WHERE estado_pedido = 'EN CAMINO') AS encamino,
        (
          SELECT COUNT(*)
          FROM historial h
          WHERE h.accion = 'TRANSICION_ESTADO'
            AND h.fecha_accion::date = CURRENT_DATE
            AND h.descripcion ILIKE '%EN CAMINO%'
            AND h.descripcion ILIKE '%ENTREGADO%'
        ) AS "entregadosHoy"
    `,
  );
  return result.rows[0];
}

async function listPendingOrdersForExport({ fechaInicio = "", fechaFin = "", search = "" }) {
  const pool = await poolPromise;
  let where = "WHERE pe.estado_pedido = 'PENDIENTE'";
  const params = [];

  if (fechaInicio && fechaFin) {
    params.push(fechaInicio, fechaFin);
    where += ` AND pe.fecha_creacion::date BETWEEN $${params.length - 1} AND $${params.length}`;
  } else if (fechaInicio) {
    params.push(fechaInicio);
    where += ` AND pe.fecha_creacion::date >= $${params.length}`;
  } else if (fechaFin) {
    params.push(fechaFin);
    where += ` AND pe.fecha_creacion::date <= $${params.length}`;
  }

  if (search) {
    const idPedido = isNaN(Number(search)) ? null : Number(search);
    params.push(`%${search}%`);
    const textParam = `$${params.length}`;
    let idParam = "NULL";
    if (Number.isFinite(idPedido)) {
      params.push(idPedido);
      idParam = `$${params.length}`;
    }
    where += ` AND (
      u.nombre ILIKE ${textParam} OR u.apellido ILIKE ${textParam} OR pe.id_pedido = ${idParam} OR
      EXISTS (
        SELECT 1 FROM detalle_pedido dp
        JOIN producto p ON p.id_producto = dp.id_producto
        WHERE dp.id_pedido = pe.id_pedido AND p.nombre_producto ILIKE ${textParam}
      )
    )`;
  }

  const pedidosRes = await pool.query(
    `
      SELECT pe.id_pedido, pe.fecha_creacion, pe.estado_pedido, pe.direccion_envio,
             u.nombre || ' ' || u.apellido AS cliente
      FROM pedido pe
      INNER JOIN usuario u ON u.id_usuario = pe.id_usuario
      ${where}
      ORDER BY pe.fecha_creacion ASC, pe.id_pedido ASC
    `,
    params,
  );

  const pedidos = pedidosRes.rows || [];
  let detalles = [];
  if (pedidos.length) {
    const ids = pedidos.map(p => Number(p.id_pedido)).filter(n => Number.isFinite(n));
    const detRes = await pool.query(
      `
        SELECT dp.id_pedido, p.nombre_producto AS nombre, dp.cantidad
        FROM detalle_pedido dp
        INNER JOIN producto p ON p.id_producto = dp.id_producto
        WHERE dp.id_pedido = ANY($1)
      `,
      [ids],
    );
    detalles = detRes.rows || [];
  }

  return { pedidos, detalles };
}

async function listStatusLogForExport(limit) {
  const pool = await poolPromise;
  const safeLimit = Math.min(Number(limit) || 200, 1000);
  const rs = await pool.query(
    `
      SELECT
        to_char(h.fecha_accion AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS fecha_iso_utc,
        h.id_pedido,
        h.descripcion AS cambio,
        u.nombre || ' ' || u.apellido AS responsable
      FROM historial h
      INNER JOIN usuario u ON u.id_usuario = h.id_usuario
      WHERE h.accion IN ('TRANSICION_ESTADO','PREPARAR_PEDIDO')
      ORDER BY h.fecha_accion DESC, h.id_historial DESC
      LIMIT $1
    `,
    [safeLimit],
  );
  return rs.rows || [];
}

async function getCartItemsForOrderDraft(userId) {
  const pool = await poolPromise;
  const itemsRes = await pool.query(
    `
      SELECT c.id_producto, c.cantidad, p.precio, p.nombre_producto
      FROM carrito c
      INNER JOIN producto p ON p.id_producto = c.id_producto
      WHERE c.id_usuario = $1
    `,
    [userId],
  );
  return itemsRes.rows || [];
}

async function getAvailableStockForProductTx(tx, productId) {
  const stockRes = await tx.query(
    `
      SELECT COALESCE(SUM(s.cantidad_disponible), 0) AS stock_total
      FROM (
        SELECT i.cantidad_disponible
        FROM inventario i
        WHERE i.id_producto = $1
        FOR UPDATE
      ) s
    `,
    [productId],
  );
  const stockTotal = Number(stockRes.rows?.[0]?.stock_total || 0);

  const reservedRes = await tx.query(
    `
      SELECT COALESCE(SUM(r.cantidad), 0) AS reservado
      FROM (
        SELECT rsi.cantidad
        FROM reserva_stock_item rsi
        INNER JOIN reserva_stock rs
          ON rs.id_reserva_stock = rsi.id_reserva_stock
        WHERE rsi.id_producto = $1
          AND rs.estado = 'ACTIVA'
          AND rs.expires_at > NOW()
        FOR UPDATE OF rsi, rs
      ) r
    `,
    [productId],
  );
  const reservado = Number(reservedRes.rows?.[0]?.reservado || 0);
  const disponible = Math.max(stockTotal - reservado, 0);
  return { stockTotal, reservado, disponible };
}

async function insertStockReservationTx(tx, { orderId, userId, items, ttlMinutes = 15 }) {
  const minutes = Math.max(Number(ttlMinutes) || 15, 1);
  const header = await tx.query(
    `
      INSERT INTO reserva_stock (id_pedido, id_usuario, estado, expires_at)
      VALUES ($1, $2, 'ACTIVA', NOW() + ($3 || ' minutes')::interval)
      RETURNING id_reserva_stock AS id
    `,
    [orderId, userId, String(minutes)],
  );

  const reservationId = header.rows?.[0]?.id;
  for (const it of items) {
    await tx.query(
      `
        INSERT INTO reserva_stock_item (id_reserva_stock, id_producto, cantidad)
        VALUES ($1, $2, $3);
      `,
      [reservationId, it.id_producto, it.cantidad],
    );
  }

  return reservationId;
}

async function getLatestReservationByOrderTx(tx, orderId) {
  const rs = await tx.query(
    `
      SELECT id_reserva_stock, estado, expires_at
      FROM reserva_stock
      WHERE id_pedido = $1
      ORDER BY id_reserva_stock DESC
      LIMIT 1
    `,
    [orderId],
  );
  return rs.rows?.[0] || null;
}

async function listReservationItemsByOrderTx(tx, orderId) {
  const rs = await tx.query(
    `
      SELECT rsi.id_producto, rsi.cantidad
      FROM reserva_stock_item rsi
      INNER JOIN reserva_stock rs ON rs.id_reserva_stock = rsi.id_reserva_stock
      WHERE rs.id_pedido = $1
    `,
    [orderId],
  );
  return rs.rows || [];
}

async function updateReservationStatusTx(tx, reservationId, estado) {
  await tx.query(
    `
      UPDATE reserva_stock
      SET estado = $2
      WHERE id_reserva_stock = $1;
    `,
    [reservationId, estado],
  );
}

async function listInventoryRowsByProductTx(tx, productId) {
  const rs = await tx.query(
    `
      SELECT id_inventario, cantidad_disponible
      FROM inventario
      WHERE id_producto = $1
        AND cantidad_disponible > 0
      ORDER BY id_inventario ASC
      FOR UPDATE
    `,
    [productId],
  );
  return rs.rows || [];
}

async function decrementInventoryRowTx(tx, { idInventario, cantidad }) {
  const upd = await tx.query(
    `
      UPDATE inventario
        SET cantidad_disponible = cantidad_disponible - $2
      WHERE id_inventario = $1
        AND cantidad_disponible >= $2;
    `,
    [idInventario, cantidad],
  );
  return upd.rowCount > 0;
}

async function incrementInventoryRowTx(tx, { idInventario, cantidad }) {
  await tx.query(
    `
      UPDATE inventario
        SET cantidad_disponible = cantidad_disponible + $2
      WHERE id_inventario = $1;
    `,
    [idInventario, cantidad],
  );
}

async function insertSalidaInventarioTx(tx, { cantidad, motivo, idInventario, userId }) {
  await tx.query(
    `
      INSERT INTO salida_inventario (cantidad_salida, motivo_salida, id_inventario, id_usuario)
      VALUES ($1, $2, $3, $4);
    `,
    [cantidad, motivo, idInventario, userId ?? null],
  );
}

async function insertEntradaInventarioTx(tx, { cantidad, motivo, idInventario }) {
  await tx.query(
    `
      INSERT INTO entrada_inventario (cantidad_recibida, motivo_entrada, id_inventario)
      VALUES ($1, $2, $3);
    `,
    [cantidad, motivo, idInventario],
  );
}

async function insertPedidoInventarioMovTx(tx, { orderId, idInventario, tipo, cantidad }) {
  await tx.query(
    `
      INSERT INTO pedido_inventario_mov (id_pedido, id_inventario, tipo_mov, cantidad)
      VALUES ($1, $2, $3, $4);
    `,
    [orderId, idInventario, tipo, cantidad],
  );
}

async function listPedidoInventarioMovByOrderTx(tx, { orderId, tipo }) {
  const params = [orderId];
  const whereTipo = tipo ? `AND tipo_mov = $${params.length + 1}` : "";
  if (tipo) params.push(tipo);

  const rs = await tx.query(
    `
      SELECT id_inventario, tipo_mov, cantidad
      FROM pedido_inventario_mov
      WHERE id_pedido = $1
      ${whereTipo}
      ORDER BY id_pedido_inventario_mov ASC
    `,
    params,
  );
  return rs.rows || [];
}

async function createDraftOrderTx({ userId, total, costoEnvio, direccionEnvio, paymentMethodId, items }) {
  const pool = await poolPromise;
  const tx = await pool.connect();

  await tx.query("BEGIN");
  try {
    // Validación + reserva de stock antes de crear el pedido
    for (const it of items) {
      const { disponible } = await getAvailableStockForProductTx(tx, it.id_producto);
      if (Number(it.cantidad) > disponible) {
        const err = new Error("Stock insuficiente");
        (err as any).status = 409;
        (err as any).detail = { id_producto: it.id_producto, solicitado: Number(it.cantidad), disponible };
        throw err;
      }
    }

    const pedRes = await tx.query(
      `
        INSERT INTO pedido (estado_pedido, total_pedido, costo_envio, direccion_envio, id_usuario, id_metodo_pago)
        VALUES ('PENDIENTE_PAGO', $1, $2, $3, $4, $5)
        RETURNING id_pedido
      `,
      [Number(total).toFixed(2), Number(costoEnvio).toFixed(2), direccionEnvio, userId, paymentMethodId],
    );

    const orderId = pedRes.rows[0].id_pedido;

    const rawTtl = process.env.STOCK_RESERVATION_TTL_MINUTES || process.env.RESERVA_STOCK_TTL_MINUTES;
    const parsedTtl = Number.parseInt(String(rawTtl || ""), 10);
    const isProd = String(process.env.NODE_ENV || "").trim() === "production";
    // En pruebas/redirects el usuario puede tardar más, así que usamos un TTL más alto en dev.
    const ttlMinutes = Number.isFinite(parsedTtl) && parsedTtl >= 5 && parsedTtl <= 24 * 60 ? parsedTtl : isProd ? 15 : 60;

    await insertStockReservationTx(tx, { orderId, userId, items, ttlMinutes });

    for (const it of items) {
      await tx.query(
        `
          INSERT INTO detalle_pedido (cantidad, precio_unitario_venta, subtotal, id_pedido, id_producto)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [it.cantidad, Number(it.precio).toFixed(2), (Number(it.precio) * it.cantidad).toFixed(2), orderId, it.id_producto],
      );
    }

    await tx.query("COMMIT");
    return { orderId };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function ensureShippingCreatedTx(tx, { orderId, shippingCost }) {
  const existing = await tx.query(
    `
      SELECT id_envio
      FROM envio
      WHERE id_pedido = $1
      LIMIT 1
    `,
    [orderId],
  );
  if (existing.rows?.[0]?.id_envio) return existing.rows[0].id_envio;

  const cost = Number(shippingCost || 0);
  if (!(cost > 0)) return null;

  const tracking = `TRK-${orderId}-${Date.now()}`.slice(0, 50);
  const carrier = "PENDIENTE";

  const rs = await tx.query(
    `
      INSERT INTO envio (numero_rastreo, transportista, fecha_envio, estado_envio, costo_envio, id_pedido, id_delivery)
      VALUES ($1, $2, NULL, $3, $4, $5, NULL)
      RETURNING id_envio AS id
    `,
    [tracking, carrier, "PENDIENTE", cost.toFixed(2), orderId],
  );

  return rs.rows?.[0]?.id || null;
}

async function consumeReservationAndDecrementInventoryTx(tx, { orderId, userId }) {
  const reserva = await getLatestReservationByOrderTx(tx, orderId);
  if (!reserva) {
    const err = new Error("No existe reserva de stock para este pedido");
    (err as any).status = 409;
    throw err;
  }

  const expired = new Date(reserva.expires_at).getTime() <= Date.now();
  if (reserva.estado !== "ACTIVA" || expired) {
    const err = new Error("La reserva de stock expiró. Vuelve a intentar tu compra.");
    (err as any).status = 409;
    (err as any).code = "RESERVA_EXPIRADA";
    throw err;
  }

  const items = await listReservationItemsByOrderTx(tx, orderId);
  for (const it of items) {
    let remaining = Number(it.cantidad);
    const rows = await listInventoryRowsByProductTx(tx, it.id_producto);

    for (const r of rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(r.cantidad_disponible));
      if (take <= 0) continue;

      const ok = await decrementInventoryRowTx(tx, { idInventario: r.id_inventario, cantidad: take });
      if (!ok) continue;

      await insertSalidaInventarioTx(tx, {
        cantidad: take,
        motivo: `VENTA_PEDIDO_${orderId}`.substring(0, 255),
        idInventario: r.id_inventario,
        userId: userId ?? null,
      });

      await insertPedidoInventarioMovTx(tx, { orderId, idInventario: r.id_inventario, tipo: "SALIDA", cantidad: take });

      remaining -= take;
    }

    if (remaining > 0) {
      const err = new Error("Stock insuficiente al confirmar el pago");
      (err as any).status = 409;
      (err as any).detail = { id_producto: it.id_producto, faltante: remaining };
      throw err;
    }
  }

  await updateReservationStatusTx(tx, reserva.id_reserva_stock, "CONSUMIDA");
}

async function releaseReservationTx(tx, { orderId }) {
  const reserva = await getLatestReservationByOrderTx(tx, orderId);
  if (!reserva) return;
  if (reserva.estado === "ACTIVA") {
    await updateReservationStatusTx(tx, reserva.id_reserva_stock, "LIBERADA");
  }
}

async function getOrderForFinalizeTx(tx, orderId) {
  const { rows } = await tx.query(
    `
      SELECT id_pedido, id_usuario, estado_pedido
      FROM pedido
      WHERE id_pedido = $1
    `,
    [orderId],
  );
  return rows[0] || null;
}

async function getOrderDetailTotalTx(tx, orderId) {
  const { rows } = await tx.query(
    `
      SELECT COALESCE(SUM(subtotal),0) AS total
      FROM detalle_pedido
      WHERE id_pedido = $1
    `,
    [orderId],
  );
  return Number(rows[0]?.total || 0);
}

async function getOrderShippingCostTx(tx, orderId) {
  const { rows } = await tx.query(
    `
      SELECT COALESCE(costo_envio, 0) AS shipping
      FROM pedido
      WHERE id_pedido = $1
    `,
    [orderId],
  );
  return Number(rows[0]?.shipping || 0);
}

async function updateOrderPaymentTx(tx, { orderId, paymentMethodId, nuevoEstado }) {
  const result = await tx.query(
    `
      UPDATE pedido
      SET id_metodo_pago = $2,
          estado_pedido = $3
      WHERE id_pedido = $1
        AND estado_pedido = 'PENDIENTE_PAGO'
    `,
    [orderId, paymentMethodId, nuevoEstado],
  );

  const rows = Number(result?.rowCount || 0);
  if (rows === 0) {
    const err: any = new Error("El pedido ya no está en estado PENDIENTE_PAGO");
    err.status = 409;
    throw err;
  }
}

async function getNextComprobanteNumberByCountTx(tx, tipo) {
  const { rows } = await tx.query(
    `
      SELECT COUNT(*) + 1 AS n
      FROM comprobante
      WHERE tipo_comprobante = $1
    `,
    [tipo],
  );
  const n = String(rows[0].n).padStart(4, "0");
  return tipo === "FACTURA" ? `F001-${n}` : `B001-${n}`;
}

async function insertComprobanteTx(tx, { tipo, numero, monto, orderId, paymentMethodId }) {
  const { rows } = await tx.query(
    `
      INSERT INTO comprobante (
        tipo_comprobante,
        numero_comprobante,
        fecha_creacion,
        monto_total,
        estado_comprobante,
        fecha_emision,
        id_pedido,
        id_metodo_pago
      )
      VALUES (
        $1,
        $2,
        NOW(),
        $3,
        'PAGADO',
        NOW(),
        $4,
        $5
      )
      RETURNING id_comprobante AS id
    `,
    [tipo, numero, monto, orderId, paymentMethodId],
  );

  return rows[0].id;
}

async function insertBoletaTx(tx, { idComprobante, nombre, dni }) {
  await tx.query(
    `
      INSERT INTO boleta (nombre_cliente, dni_cliente, id_comprobante)
      VALUES ($1, $2, $3)
    `,
    [nombre, dni, idComprobante],
  );
}

async function insertFacturaTx(tx, { idComprobante, montoBase, montoImpuesto, razonSocial, ruc, direccion }) {
  await tx.query(
    `
      INSERT INTO factura (
        monto_base, monto_impuesto,
        razon_social_cliente, ruc_cliente, direccion_cliente,
        id_comprobante
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [montoBase, montoImpuesto, razonSocial, ruc, direccion, idComprobante],
  );
}

async function clearCartByUserTx(tx, userId) {
  await tx.query("DELETE FROM carrito WHERE id_usuario = $1", [userId]);
}

async function getOrderOwnerUserIdTx(tx, orderId) {
  const rs = await tx.query("SELECT id_usuario FROM pedido WHERE id_pedido = $1", [orderId]);
  return rs.rows[0]?.id_usuario || null;
}

async function finalizeTransactionCreate(pool) {
  return pool.connect();
}

async function beginTransaction(tx) {
  await tx.query("BEGIN");
}

async function commitTransaction(tx) {
  await tx.query("COMMIT");
  tx.release();
}

async function rollbackTransaction(tx) {
  await tx.query("ROLLBACK");
  tx.release();
}

async function getPool() {
  return poolPromise;
}

async function markOrdersPreparedBulkTx({ ids, userId }) {
  const pool = await poolPromise;
  const transaction = await pool.connect();

  await transaction.query("BEGIN");
  try {
    const safeIds = ids.map(n => Number(n)).filter(n => Number.isFinite(n));
    if (!safeIds.length) return { updatedIds: [] };

    const updateRes = await transaction.query(
      `
        UPDATE pedido
        SET estado_pedido = 'PREPARADO'
        WHERE estado_pedido = 'PENDIENTE'
          AND id_pedido = ANY($1)
        RETURNING id_pedido
      `,
      [safeIds],
    );

    const updatedIds = updateRes.rows.map(r => r.id_pedido);

    if (updatedIds.length) {
      await transaction.query(
        `
          INSERT INTO historial (descripcion, accion, id_pedido, id_usuario)
          SELECT 'Pedidos preparados masivo', 'PREPARAR_PEDIDO', unnest($1::int[]), $2
        `,
        [updatedIds, Number(userId)],
      );
    }

    await transaction.query("COMMIT");
    return { updatedIds };
  } catch (err) {
    try {
      await transaction.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    transaction.release();
  }
}

module.exports = {
  listOrdersAdmin,
  listOrdersByUser,
  listPendingOrders,
  getOrderHeaderById,
  getOrderItemsById,
  getOrderStateById,
  updateOrderState,
  updateOrderStateTx,
  updateShippingOnTransition,
  insertHistory,
  insertHistoryTx,
  listTransitionableOrders,
  listStatusLog,
  getEmployeeKpis,
  listPendingOrdersForExport,
  listStatusLogForExport,
  getCartItemsForOrderDraft,
  createDraftOrderTx,
  ensureShippingCreatedTx,
  consumeReservationAndDecrementInventoryTx,
  releaseReservationTx,
  finalizeTransactionCreate,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  getPool,
  getOrderForFinalizeTx,
  getOrderDetailTotalTx,
  getOrderShippingCostTx,
  updateOrderPaymentTx,
  getNextComprobanteNumberByCountTx,
  insertComprobanteTx,
  insertBoletaTx,
  insertFacturaTx,
  clearCartByUserTx,
  getOrderOwnerUserIdTx,
  incrementInventoryRowTx,
  insertEntradaInventarioTx,
  insertPedidoInventarioMovTx,
  listPedidoInventarioMovByOrderTx,
  markOrdersPreparedBulkTx,
};

export {};
