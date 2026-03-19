const { poolPromise } = require("../config/db.config");

async function insertHistorial({ descripcion, accion, id_usuario, id_pedido = null, modulo = null, entidad = null, referencia_id = null }) {
  const pool = await poolPromise;
  await pool.query(
    `
      INSERT INTO historial (descripcion, accion, modulo, entidad, referencia_id, id_pedido, id_usuario)
      VALUES ($1, $2, $3, $4, $5, $6, $7);
    `,
    [
      String(descripcion || ""),
      String(accion || ""),
      modulo ? String(modulo).trim().toUpperCase() : null,
      entidad ? String(entidad).trim().toUpperCase() : null,
      referencia_id ?? id_pedido ?? null,
      id_pedido ?? null,
      id_usuario,
    ],
  );
}

async function listRecent({ limit = 50 }) {
  const pool = await poolPromise;
  const safeLimit = Math.min(Number(limit) || 50, 200);
  const rs = await pool.query(
    `
      SELECT
        h.id_historial,
        h.accion,
        h.descripcion,
        h.fecha_accion,
        h.id_pedido,
        h.id_usuario,
        COALESCE(u.nombre || ' ' || u.apellido, u.email, '-') AS usuario
      FROM historial h
      LEFT JOIN usuario u ON u.id_usuario = h.id_usuario
      ORDER BY h.fecha_accion DESC, h.id_historial DESC
      LIMIT $1;
    `,
    [safeLimit],
  );
  return rs.rows || [];
}

const MODULE_ACTION_PATTERNS = {
  INVENTARIO: ["INVENTARIO%", "STOCK%"],
  DESPACHO: ["SALIDA_DESPACHO%", "DESPACHO%"],
  PRODUCTO: ["PRODUCTO%"],
  CATEGORIA: ["CATEGORIA%"],
  DELIVERY: ["DELIVERY%"],
  PEDIDO: ["PEDIDO%", "TRANSICION_ESTADO%", "PREPARAR_PEDIDO%", "REEMBOLSO%"],
  REPORTE: ["REPORTE%", "VENTAS%"],
  SEGURIDAD: ["LOGIN%", "AUTH%", "TOKEN%", "PASSWORD%"],
};

function normalizeAuditModule(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  return Object.prototype.hasOwnProperty.call(MODULE_ACTION_PATTERNS, raw) ? raw : "";
}

async function listPaginated({ page = 1, pageSize = 20, accion = "", modulo = "", usuario = "", fechaInicio = "", fechaFin = "" } = {}) {
  const pool = await poolPromise;
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const safeOffset = (safePage - 1) * safePageSize;

  const params = [];
  const where = [];

  const accionClean = String(accion || "")
    .trim()
    .toUpperCase();
  if (accionClean) {
    params.push(accionClean);
    where.push(`UPPER(h.accion) = $${params.length}`);
  }

  const moduloClean = normalizeAuditModule(modulo);
  if (moduloClean) {
    const patterns = MODULE_ACTION_PATTERNS[moduloClean] || [];
    if (patterns.length) {
      params.push(patterns);
      params.push(moduloClean);
      where.push(`(
        UPPER(COALESCE(h.modulo, '')) = $${params.length}
        OR EXISTS (
        SELECT 1
        FROM unnest($${params.length - 1}::text[]) AS p(pattern)
        WHERE UPPER(h.accion) LIKE p.pattern
        )
      )`);
    }
  }

  const usuarioClean = String(usuario || "").trim();
  if (usuarioClean) {
    params.push(`%${usuarioClean}%`);
    where.push(
      `(CAST(h.id_usuario AS TEXT) ILIKE $${params.length} OR COALESCE(u.nombre || ' ' || u.apellido, u.email, '-') ILIKE $${params.length} OR COALESCE(u.email, '') ILIKE $${params.length})`,
    );
  }

  if (fechaInicio && fechaFin) {
    params.push(fechaInicio, fechaFin);
    where.push(`h.fecha_accion::date BETWEEN $${params.length - 1} AND $${params.length}`);
  } else if (fechaInicio) {
    params.push(fechaInicio);
    where.push(`h.fecha_accion::date >= $${params.length}`);
  } else if (fechaFin) {
    params.push(fechaFin);
    where.push(`h.fecha_accion::date <= $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM historial h
      LEFT JOIN usuario u ON u.id_usuario = h.id_usuario
      ${whereSql}
    `,
    params,
  );

  const queryParams = [...params, safePageSize, safeOffset];
  const rs = await pool.query(
    `
      SELECT
        h.id_historial,
        h.accion,
        CASE
          WHEN UPPER(h.accion) = 'INVENTARIO_ADMIN_EXPORTADO' THEN 'Exportó inventario (admin)'
          WHEN UPPER(h.accion) = 'INVENTARIO_EXPORTADO' THEN 'Exportó inventario'
          WHEN UPPER(h.accion) = 'SALIDA_DESPACHO' THEN COALESCE(
            'Registró salida de despacho (' || SUBSTRING(h.descripcion FROM '(?i)([0-9]+)\s*items?') || ')',
            'Registró salida de despacho'
          )
          WHEN UPPER(h.accion) = 'PRODUCTO_CREADO' THEN 'Creó producto'
          WHEN UPPER(h.accion) = 'PRODUCTO_ACTUALIZADO' THEN 'Actualizó producto'
          WHEN UPPER(h.accion) = 'PRODUCTO_ACTIVADO' THEN 'Activó producto'
          WHEN UPPER(h.accion) = 'PRODUCTO_DESACTIVADO' THEN 'Desactivó producto'
          WHEN UPPER(h.accion) = 'PRODUCTO_ELIMINADO' THEN 'Eliminó producto'
          WHEN UPPER(h.accion) = 'PREPARAR_PEDIDO' THEN 'Marcó pedido como preparado'
          WHEN UPPER(h.accion) = 'TRANSICION_ESTADO' THEN 'Actualizó estado del pedido'
          WHEN UPPER(h.accion) = 'PEDIDO_REEMBOLSADO' OR UPPER(h.accion) LIKE 'REEMBOLSO%' THEN 'Reembolsó pedido'
          WHEN UPPER(h.accion) = 'PEDIDO_CANCELADO' THEN 'Canceló pedido'
          WHEN UPPER(h.accion) = 'DELIVERY_ASIGNADO' THEN 'Asignó repartidor a pedido'
          WHEN UPPER(h.accion) = 'DELIVERY_EN_RUTA' THEN 'Inició ruta de entrega'
          WHEN UPPER(h.accion) = 'DELIVERY_ENTREGADO' THEN 'Confirmó entrega'
          WHEN UPPER(h.accion) = 'DELIVERY_NO_ENTREGADO' THEN 'Registró incidencia de entrega'
          WHEN UPPER(h.accion) = 'EMAIL_VERIFICADO' THEN 'Verificó correo de usuario'
          WHEN UPPER(h.accion) = 'PASSWORD_RESET' THEN 'Restableció contraseña'
          ELSE NULL
        END AS resumen_label,
        CASE
          WHEN UPPER(h.accion) LIKE 'INVENTARIO%' OR UPPER(h.accion) LIKE 'STOCK%' THEN 'INVENTARIO'
          WHEN UPPER(h.accion) LIKE 'SALIDA_DESPACHO%' OR UPPER(h.accion) LIKE 'DESPACHO%' THEN 'DESPACHO'
          WHEN UPPER(h.accion) LIKE 'PRODUCTO%' THEN 'PRODUCTO'
          WHEN UPPER(h.accion) LIKE 'CATEGORIA%' THEN 'CATEGORIA'
          WHEN UPPER(h.accion) LIKE 'DELIVERY%' THEN 'DELIVERY'
          WHEN UPPER(h.accion) LIKE 'PEDIDO%' OR UPPER(h.accion) LIKE 'TRANSICION_ESTADO%' OR UPPER(h.accion) LIKE 'PREPARAR_PEDIDO%' OR UPPER(h.accion) LIKE 'REEMBOLSO%' THEN 'PEDIDO'
          WHEN UPPER(h.accion) LIKE 'REPORTE%' OR UPPER(h.accion) LIKE 'VENTAS%' THEN 'REPORTE'
          WHEN UPPER(h.accion) LIKE 'LOGIN%' OR UPPER(h.accion) LIKE 'AUTH%' OR UPPER(h.accion) LIKE 'TOKEN%' OR UPPER(h.accion) LIKE 'PASSWORD%' THEN 'SEGURIDAD'
          ELSE 'SISTEMA'
        END AS modulo,
        h.descripcion,
        h.fecha_accion,
        h.id_pedido,
        CASE
          WHEN h.id_pedido IS NOT NULL THEN 'PEDIDO'
          ELSE NULL
        END AS entidad_tipo,
        h.id_pedido AS entidad_id,
        CASE
          WHEN h.id_pedido IS NOT NULL THEN 'PEDIDO'
          WHEN UPPER(h.accion) LIKE 'PRODUCTO%' THEN 'PRODUCTO'
          WHEN UPPER(h.accion) LIKE 'INVENTARIO%' OR UPPER(h.accion) LIKE 'STOCK%' THEN 'INVENTARIO'
          WHEN UPPER(h.accion) LIKE 'SALIDA_DESPACHO%' OR UPPER(h.accion) LIKE 'DESPACHO%' THEN 'DESPACHO'
          WHEN UPPER(h.accion) LIKE 'REPORTE%' OR UPPER(h.accion) LIKE 'VENTAS%' THEN 'REPORTE'
          WHEN UPPER(h.accion) LIKE 'LOGIN%' OR UPPER(h.accion) LIKE 'AUTH%' OR UPPER(h.accion) LIKE 'TOKEN%' OR UPPER(h.accion) LIKE 'PASSWORD%' THEN 'SEGURIDAD'
          ELSE 'SISTEMA'
        END AS referencia_tipo,
        COALESCE(
          h.id_pedido::text,
          CASE
            WHEN UPPER(h.accion) LIKE 'PRODUCTO%' THEN SUBSTRING(h.descripcion FROM '(?i)id\\s*=?\\s*([0-9]+)')
            ELSE NULL
          END,
          CASE
            WHEN UPPER(h.accion) LIKE 'INVENTARIO%' OR UPPER(h.accion) LIKE 'STOCK%' THEN COALESCE(
              SUBSTRING(h.descripcion FROM '(?i)id_inventario\\s*=?\\s*([0-9]+)'),
              SUBSTRING(h.descripcion FROM '(?i)almacenId\\s*=?\\s*([0-9]+)')
            )
            ELSE NULL
          END
        ) AS referencia_valor,
        CASE
          WHEN h.id_pedido IS NOT NULL THEN 'Pedido #' || h.id_pedido::text
          WHEN UPPER(h.accion) LIKE 'PRODUCTO%' THEN COALESCE(
            'Producto #' || SUBSTRING(h.descripcion FROM '(?i)id\\s*=?\\s*([0-9]+)'),
            'Producto'
          )
          WHEN UPPER(h.accion) LIKE 'INVENTARIO%' OR UPPER(h.accion) LIKE 'STOCK%' THEN COALESCE(
            'Inventario #' || SUBSTRING(h.descripcion FROM '(?i)id_inventario\\s*=?\\s*([0-9]+)'),
            'Almacén #' || SUBSTRING(h.descripcion FROM '(?i)almacenId\\s*=?\\s*([0-9]+)'),
            'Inventario'
          )
          WHEN UPPER(h.accion) LIKE 'SALIDA_DESPACHO%' OR UPPER(h.accion) LIKE 'DESPACHO%' THEN COALESCE(
            SUBSTRING(h.descripcion FROM '(?i)([0-9]+\\s*items?)'),
            'Despacho'
          )
          WHEN UPPER(h.accion) LIKE 'DELIVERY%' THEN COALESCE('Pedido #' || h.id_pedido::text, 'Delivery')
          WHEN UPPER(h.accion) LIKE 'REPORTE%' OR UPPER(h.accion) LIKE 'VENTAS%' THEN 'Reporte de ventas'
          WHEN UPPER(h.accion) LIKE 'LOGIN%' OR UPPER(h.accion) LIKE 'AUTH%' OR UPPER(h.accion) LIKE 'TOKEN%' OR UPPER(h.accion) LIKE 'PASSWORD%' THEN 'Seguridad'
          ELSE 'Sistema'
        END AS referencia_label,
        h.id_usuario,
        COALESCE(u.nombre || ' ' || u.apellido, u.email, '-') AS usuario
      FROM historial h
      LEFT JOIN usuario u ON u.id_usuario = h.id_usuario
      ${whereSql}
      ORDER BY h.fecha_accion DESC, h.id_historial DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2};
    `,
    queryParams,
  );

  const total = Number(totalResult.rows?.[0]?.total) || 0;
  const totalPages = Math.max(Math.ceil(total / safePageSize), 1);

  return {
    rows: rs.rows || [],
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

module.exports = {
  insertHistorial,
  listRecent,
  listPaginated,
};

export {};
