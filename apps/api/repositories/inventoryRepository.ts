const { poolPromise } = require("../config/db.config");

let canonicalWarehouseCache = {
  id: null,
  fetchedAt: 0,
};

let inboundUserColumnCache = {
  hasColumn: null,
  fetchedAt: 0,
};

async function getCanonicalWarehouseId(pool) {
  const configured = Number(process.env.CANONICAL_WAREHOUSE_ID || 0);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  const now = Date.now();
  if (Number.isInteger(canonicalWarehouseCache.id) && canonicalWarehouseCache.id > 0 && now - canonicalWarehouseCache.fetchedAt < 60_000) {
    return canonicalWarehouseCache.id;
  }

  const rs = await pool.query(
    `
      SELECT id_almacen
      FROM almacen
      ORDER BY id_almacen ASC
      LIMIT 1
    `,
  );

  const id = Number(rs.rows?.[0]?.id_almacen || 1);
  canonicalWarehouseCache = {
    id,
    fetchedAt: now,
  };
  return id;
}

async function hasInboundUserColumn(pool) {
  const now = Date.now();
  if (typeof inboundUserColumnCache.hasColumn === "boolean" && now - inboundUserColumnCache.fetchedAt < 60_000) {
    return inboundUserColumnCache.hasColumn;
  }

  const rs = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'entrada_inventario'
          AND column_name = 'id_usuario'
      ) AS has_column
    `,
  );

  const hasColumn = Boolean(rs.rows?.[0]?.has_column);
  inboundUserColumnCache = {
    hasColumn,
    fetchedAt: now,
  };

  return hasColumn;
}

async function getAvailableStockByProductId(productId) {
  const pool = await poolPromise;
  const stockRes = await pool.query(
    `
      SELECT COALESCE(SUM(i.cantidad_disponible), 0) AS stock_total
      FROM inventario i
      WHERE i.id_producto = $1
    `,
    [productId],
  );

  const reservedRes = await pool.query(
    `
      SELECT COALESCE(SUM(rsi.cantidad), 0) AS reservado
      FROM reserva_stock_item rsi
      INNER JOIN reserva_stock rs ON rs.id_reserva_stock = rsi.id_reserva_stock
      WHERE rsi.id_producto = $1
        AND rs.estado = 'ACTIVA'
        AND rs.expires_at > NOW()
    `,
    [productId],
  );

  const stockTotal = Number(stockRes.rows?.[0]?.stock_total || 0);
  const reservado = Number(reservedRes.rows?.[0]?.reservado || 0);
  const disponible = Math.max(stockTotal - reservado, 0);
  return { stockTotal, reservado, disponible };
}

async function listInventory({ search = "" }) {
  const pool = await poolPromise;
  const filters = [];
  const params = [];

  const canonicalWarehouseId = await getCanonicalWarehouseId(pool);
  params.push(canonicalWarehouseId);
  filters.push(`i.id_almacen = $${params.length}`);

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(p.nombre_producto ILIKE $${params.length})`);
  }

  const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

  const q = `
    SELECT
      i.id_inventario,
      i.id_producto,
      i.id_almacen,
      a.nombre_almacen,
      p.nombre_producto,
      i.cantidad_disponible AS stock
    FROM inventario i
    INNER JOIN producto p ON p.id_producto = i.id_producto
    INNER JOIN almacen  a ON a.id_almacen  = i.id_almacen
    ${where}
    ORDER BY p.nombre_producto ASC
  `;

  const result = await pool.query(q, params);
  return result.rows || [];
}

async function listInventoryForExport({ search = "" }) {
  const pool = await poolPromise;
  const filters = [];
  const params = [];

  const canonicalWarehouseId = await getCanonicalWarehouseId(pool);
  params.push(canonicalWarehouseId);
  filters.push(`i.id_almacen = $${params.length}`);

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(p.nombre_producto ILIKE $${params.length})`);
  }

  const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

  const rs = await pool.query(
    `
      SELECT i.id_inventario,
             p.nombre_producto AS producto,
             a.nombre_almacen  AS almacen,
             i.cantidad_disponible AS stock
      FROM inventario i
      INNER JOIN producto p ON p.id_producto = i.id_producto
      INNER JOIN almacen  a ON a.id_almacen  = i.id_almacen
      ${where}
      ORDER BY p.nombre_producto ASC
    `,
    params,
  );

  return rs.rows || [];
}

async function searchInventoryForDispatch({ search = "", page = 1, pageSize = 10 }) {
  const pool = await poolPromise;
  const filters = ["i.cantidad_disponible > 0"];
  const params = [];

  const canonicalWarehouseId = await getCanonicalWarehouseId(pool);
  params.push(canonicalWarehouseId);
  filters.push(`i.id_almacen = $${params.length}`);

  const cleanSearch = String(search || "").trim();
  if (cleanSearch) {
    params.push(`%${cleanSearch}%`);
    const likeParamIdx = params.length;
    params.push(cleanSearch);
    const exactParamIdx = params.length;
    filters.push(`(
      p.nombre_producto ILIKE $${likeParamIdx}
      OR CAST(i.id_inventario AS TEXT) = $${exactParamIdx}
      OR CAST(i.id_producto AS TEXT) = $${exactParamIdx}
    )`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM inventario i
    INNER JOIN producto p ON p.id_producto = i.id_producto
    INNER JOIN almacen  a ON a.id_almacen  = i.id_almacen
    ${where}
  `;

  const countResult = await pool.query(countQuery, params);
  const total = Number(countResult.rows?.[0]?.total || 0);

  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 10, 50));
  const safePage = Math.max(1, Number(page) || 1);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const boundedPage = Math.min(safePage, totalPages);
  const offset = (boundedPage - 1) * safePageSize;

  const priorityParamIdx = params.length + 1;
  const limitParamIdx = params.length + 2;
  const offsetParamIdx = params.length + 3;

  const rowsQuery = `
    SELECT
      i.id_inventario,
      i.id_producto,
      i.id_almacen,
      a.nombre_almacen,
      p.nombre_producto,
      i.cantidad_disponible AS stock
    FROM inventario i
    INNER JOIN producto p ON p.id_producto = i.id_producto
    INNER JOIN almacen  a ON a.id_almacen  = i.id_almacen
    ${where}
    ORDER BY
      CASE
        WHEN CAST(i.id_inventario AS TEXT) = $${priorityParamIdx} THEN 0
        ELSE 1
      END,
      p.nombre_producto ASC,
      i.id_inventario ASC
    LIMIT $${limitParamIdx}
    OFFSET $${offsetParamIdx}
  `;

  const rowParams = [...params, cleanSearch || "-1", safePageSize, offset];
  const rowsResult = await pool.query(rowsQuery, rowParams);

  return {
    rows: rowsResult.rows || [],
    total,
    page: boundedPage,
    pageSize: safePageSize,
    totalPages,
  };
}

async function getInventoryKpis() {
  const pool = await poolPromise;
  const canonicalWarehouseId = await getCanonicalWarehouseId(pool);
  const rs = await pool.query(
    `
    SELECT
      COUNT(DISTINCT i.id_producto) FILTER (WHERE i.cantidad_disponible > 0)::int AS "totalProductos",
      COUNT(*) FILTER (WHERE i.cantidad_disponible = 0)::int AS "agotados",
      COUNT(*) FILTER (WHERE i.cantidad_disponible > 0 AND i.cantidad_disponible <= 10)::int AS "stockBajo"
    FROM inventario i
    WHERE i.id_almacen = $1
  `,
    [canonicalWarehouseId],
  );

  return {
    totalProductos: Number(rs.rows?.[0]?.totalProductos || 0),
    agotados: Number(rs.rows?.[0]?.agotados || 0),
    stockBajo: Number(rs.rows?.[0]?.stockBajo || 0),
  };
}

function buildAdminInventoryFilters({
  search = "",
  categoriaId = "",
  canonicalWarehouseId,
}: {
  search?: string;
  categoriaId?: string;
  canonicalWarehouseId: number;
}) {
  const filters = [];
  const params: Array<number | string> = [canonicalWarehouseId];

  filters.push(`i.id_almacen = $1`);

  if (categoriaId !== "" && categoriaId !== null && categoriaId !== undefined) {
    params.push(Number(categoriaId));
    filters.push(`p.id_categoria = $${params.length}`);
  }

  const cleanSearch = String(search || "").trim();
  if (cleanSearch) {
    params.push(`%${cleanSearch}%`);
    filters.push(`p.nombre_producto ILIKE $${params.length}`);
  }

  return {
    params,
    where: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
  };
}

async function listInventoryPaginated({ search = "", categoriaId = "", page = 1, pageSize = 20 }) {
  const pool = await poolPromise;
  const canonicalWarehouseId = await getCanonicalWarehouseId(pool);
  const { params, where } = buildAdminInventoryFilters({ search, categoriaId, canonicalWarehouseId });

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM inventario i
    INNER JOIN producto p ON p.id_producto = i.id_producto
    INNER JOIN almacen a ON a.id_almacen = i.id_almacen
    LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
    ${where}
  `;

  const countResult = await pool.query(countQuery, params);
  const total = Number(countResult.rows?.[0]?.total || 0);

  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 20, 100));
  const safePage = Math.max(1, Number(page) || 1);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const boundedPage = Math.min(safePage, totalPages);
  const offset = (boundedPage - 1) * safePageSize;

  const limitParamIdx = params.length + 1;
  const offsetParamIdx = params.length + 2;

  const rowsQuery = `
    SELECT
      i.id_inventario,
      p.nombre_producto,
      COALESCE(p.precio, 0) AS precio,
      COALESCE(c.nombre_categoria, 'Sin categoría') AS nombre_categoria,
      a.nombre_almacen,
      i.cantidad_disponible AS stock
    FROM inventario i
    INNER JOIN producto p ON p.id_producto = i.id_producto
    INNER JOIN almacen a ON a.id_almacen = i.id_almacen
    LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
    ${where}
    ORDER BY p.nombre_producto ASC, a.nombre_almacen ASC, i.id_inventario ASC
    LIMIT $${limitParamIdx}
    OFFSET $${offsetParamIdx}
  `;

  const rowParams = [...params, safePageSize, offset];
  const rowsResult = await pool.query(rowsQuery, rowParams);

  return {
    rows: rowsResult.rows || [],
    total,
    page: boundedPage,
    pageSize: safePageSize,
    totalPages,
  };
}

async function listInboundInventoryPaginated({ search = "", categoriaId = "", page = 1, pageSize = 20 }) {
  const pool = await poolPromise;
  const tx = await pool.connect();

  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL statement_timeout = '12000'");

    const canonicalWarehouseId = await getCanonicalWarehouseId(tx);
    const { params, where } = buildAdminInventoryFilters({ search, categoriaId, canonicalWarehouseId });

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM entrada_inventario ei
      INNER JOIN inventario i ON i.id_inventario = ei.id_inventario
      INNER JOIN producto p ON p.id_producto = i.id_producto
      INNER JOIN almacen a ON a.id_almacen = i.id_almacen
      LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
      ${where}
    `;

    const countResult = await tx.query(countQuery, params);
    const total = Number(countResult.rows?.[0]?.total || 0);

    const safePageSize = Math.max(1, Math.min(Number(pageSize) || 20, 100));
    const safePage = Math.max(1, Number(page) || 1);
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const boundedPage = Math.min(safePage, totalPages);
    const offset = (boundedPage - 1) * safePageSize;

    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;
    const hasIdUsuario = await hasInboundUserColumn(tx);

    const selectResponsible = hasIdUsuario
      ? "ei.id_usuario, COALESCE(u.nombre || ' ' || u.apellido, '-') AS responsable"
      : "NULL::int AS id_usuario, '-' AS responsable";

    const userJoin = hasIdUsuario ? "LEFT JOIN usuario u ON u.id_usuario = ei.id_usuario" : "";

    const rowsQuery = `
      SELECT
        ei.id_entrada_inventario,
        (ei.fecha_entrada AT TIME ZONE 'UTC') AS fecha_entrada_utc,
        p.nombre_producto AS producto,
        ei.cantidad_recibida AS cantidad,
        ei.motivo_entrada AS motivo,
        a.nombre_almacen AS almacen,
        ${selectResponsible}
      FROM entrada_inventario ei
      INNER JOIN inventario i ON i.id_inventario = ei.id_inventario
      INNER JOIN producto p ON p.id_producto = i.id_producto
      INNER JOIN almacen a ON a.id_almacen = i.id_almacen
      LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
      ${userJoin}
      ${where}
      ORDER BY ei.fecha_entrada DESC, ei.id_entrada_inventario DESC
      LIMIT $${limitParamIdx}
      OFFSET $${offsetParamIdx}
    `;

    const rowParams = [...params, safePageSize, offset];
    const rowsResult = await tx.query(rowsQuery, rowParams);

    await tx.query("COMMIT");

    return {
      rows: rowsResult.rows || [],
      total,
      page: boundedPage,
      pageSize: safePageSize,
      totalPages,
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

async function getInventoryRowByIdTx(tx, { idInventario }) {
  const rs = await tx.query(
    `
      SELECT
        i.id_inventario,
        i.cantidad_disponible,
        i.id_producto,
        i.id_almacen,
        p.nombre_producto,
        a.nombre_almacen
      FROM inventario i
      INNER JOIN producto p ON p.id_producto = i.id_producto
      INNER JOIN almacen a ON a.id_almacen = i.id_almacen
      WHERE i.id_inventario = $1
      FOR UPDATE
    `,
    [idInventario],
  );

  return rs.rows?.[0] || null;
}

async function incrementInventoryRowTx(tx, { idInventario, cantidad }) {
  await tx.query(
    `
      UPDATE inventario
      SET cantidad_disponible = cantidad_disponible + $2,
          fecha_ultima_actualizacion = NOW()
      WHERE id_inventario = $1
    `,
    [idInventario, cantidad],
  );
}

async function insertInboundInventoryTx(tx, { cantidad, motivo, idInventario, idUsuario }) {
  const rs = await tx.query(
    `
      INSERT INTO entrada_inventario (cantidad_recibida, motivo_entrada, id_inventario, id_usuario)
      VALUES ($1, $2, $3, $4)
      RETURNING id_entrada_inventario, (fecha_entrada AT TIME ZONE 'UTC') AS fecha_entrada_utc
    `,
    [cantidad, motivo, idInventario, idUsuario ?? null],
  );

  return rs.rows?.[0] || null;
}

async function listInventoryForAdminExport({ search = "", categoriaId = "" }) {
  const pool = await poolPromise;
  const canonicalWarehouseId = await getCanonicalWarehouseId(pool);
  const { params, where } = buildAdminInventoryFilters({ search, categoriaId, canonicalWarehouseId });

  const rs = await pool.query(
    `
      SELECT
        p.nombre_producto,
        COALESCE(c.nombre_categoria, 'Sin categoría') AS nombre_categoria,
        COALESCE(p.precio, 0) AS precio,
        a.nombre_almacen,
        i.cantidad_disponible AS stock
      FROM inventario i
      INNER JOIN producto p ON p.id_producto = i.id_producto
      INNER JOIN almacen a ON a.id_almacen = i.id_almacen
      LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
      ${where}
      ORDER BY p.nombre_producto ASC, a.nombre_almacen ASC, i.id_inventario ASC
      LIMIT 20000
    `,
    params,
  );

  return rs.rows || [];
}

module.exports = {
  listInventory,
  listInventoryForExport,
  searchInventoryForDispatch,
  getAvailableStockByProductId,
  getInventoryKpis,
  listInventoryPaginated,
  listInboundInventoryPaginated,
  listInventoryForAdminExport,
  getInventoryRowByIdTx,
  incrementInventoryRowTx,
  insertInboundInventoryTx,
};

export {};
