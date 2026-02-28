async function decrementInventoryStockAtomicTx(tx, { idInventario, cantidad }) {
  const upd = await tx.query(
    `
      UPDATE inventario
        SET cantidad_disponible = cantidad_disponible - $2
      WHERE id_inventario = $1
        AND cantidad_disponible >= $2
    `,
    [idInventario, cantidad],
  );

  return upd.rowCount > 0;
}

async function insertSalidaInventarioTx(tx, { cantidad, motivo, idInventario, userId }) {
  await tx.query(
    `
      INSERT INTO salida_inventario (cantidad_salida, motivo_salida, id_inventario, id_usuario)
      VALUES ($1, $2, $3, $4);
    `,
    [cantidad, motivo, idInventario, userId],
  );
}

async function getInventoryAfterTx(tx, { idInventario }) {
  const after = await tx.query(
    `
      SELECT i.cantidad_disponible AS nuevo_stock,
             p.nombre_producto
      FROM inventario i
      JOIN producto p ON p.id_producto = i.id_producto
      WHERE i.id_inventario = $1
    `,
    [idInventario],
  );
  return after.rows?.[0] || null;
}

async function insertHistorialTx(tx, { descripcion, accion, idPedido, userId }) {
  await tx.query(
    `
      INSERT INTO historial (descripcion, accion, id_pedido, id_usuario)
      VALUES ($1, $2, $3, $4);
    `,
    [descripcion, accion, idPedido ?? null, userId],
  );
}

async function listOutbound(pool, { whereSql, params }) {
  const rows = await pool.query(
    `
      SELECT
        si.id_salida_inventario,
        (si.fecha_salida AT TIME ZONE 'UTC') AS fecha_salida_utc,
        p.nombre_producto AS producto,
        si.cantidad_salida   AS cantidad,
        si.motivo_salida     AS motivo,
        a.nombre_almacen     AS almacen,
        COALESCE(u.nombre || ' ' || u.apellido, '-') AS responsable
      FROM salida_inventario si
      JOIN inventario i ON i.id_inventario = si.id_inventario
      JOIN producto  p ON p.id_producto   = i.id_producto
      JOIN almacen   a ON a.id_almacen    = i.id_almacen
      LEFT JOIN usuario u ON u.id_usuario = si.id_usuario
      ${whereSql}
      ORDER BY si.fecha_salida DESC, si.id_salida_inventario DESC
    `,
    params,
  );
  return rows.rows || [];
}

module.exports = {
  decrementInventoryStockAtomicTx,
  insertSalidaInventarioTx,
  getInventoryAfterTx,
  insertHistorialTx,
  listOutbound,
};

export {};
