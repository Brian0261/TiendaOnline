// backend/controllers/orderController.js

const { sql, poolPromise } = require("../config/db.config");
const { emitToUser } = require("../utils/sse");

/**
 * Listar pedidos (historial completo, filtrado, búsqueda) — ADMINISTRADOR
 */
exports.getOrders = async (req, res) => {
  try {
    // Parámetros: búsqueda, fechas, estado
    const { search = "", estado = "", fechaInicio = "", fechaFin = "" } = req.query;

    // Filtros dinámicos (CORREGIDO para fechas incluyentes)
    let filtros = [];
    if (estado) filtros.push(`PE.estado_pedido = @estado`);
    if (fechaInicio && fechaFin) {
      filtros.push(`CAST(PE.fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin`);
    } else if (fechaInicio) {
      filtros.push(`CAST(PE.fecha_creacion AS DATE) >= @fechaInicio`);
    } else if (fechaFin) {
      filtros.push(`CAST(PE.fecha_creacion AS DATE) <= @fechaFin`);
    }
    if (search) {
      filtros.push(`(U.nombre LIKE @search OR U.apellido LIKE @search OR U.email LIKE @search OR PE.id_pedido = @idPedido)`);
    }

    const where = filtros.length ? "WHERE " + filtros.join(" AND ") : "";

    const pool = await require("../config/db.config").poolPromise;
    const request = pool.request();

    if (estado) request.input("estado", sql.VarChar(50), estado);
    if (fechaInicio) request.input("fechaInicio", sql.Date, fechaInicio);
    if (fechaFin) request.input("fechaFin", sql.Date, fechaFin);
    if (search) {
      request.input("search", sql.VarChar(100), `%${search}%`);
      request.input("idPedido", sql.Int, isNaN(Number(search)) ? 0 : Number(search));
    }

    // Consulta principal: pedidos + usuario (cliente)
    const pedidosRes = await request.query(`
      SELECT 
        PE.id_pedido,
        PE.fecha_creacion,
        PE.estado_pedido,
        PE.total_pedido,
        U.id_usuario,
        U.nombre + ' ' + U.apellido AS cliente,
        U.email
      FROM PEDIDO PE
      INNER JOIN USUARIO U ON PE.id_usuario = U.id_usuario
      ${where}
      ORDER BY PE.fecha_creacion DESC, PE.id_pedido DESC
    `);

    const pedidos = pedidosRes.recordset;

    // Por eficiencia, obtenemos TODOS los detalles de productos en bloque
    const ids = pedidos.map(p => p.id_pedido);
    let detalles = [];
    if (ids.length) {
      const idsStr = ids.join(",");
      const detallesRes = await pool.request().query(`
        SELECT 
          DP.id_pedido,
          P.nombre_producto AS nombre,
          DP.cantidad,
          DP.precio_unitario_venta
        FROM DETALLE_PEDIDO DP
        INNER JOIN PRODUCTO P ON DP.id_producto = P.id_producto
        WHERE DP.id_pedido IN (${idsStr})
      `);
      detalles = detallesRes.recordset;
    }

    // Mapear productos a cada pedido
    const pedidosConDetalles = pedidos.map(pedido => ({
      ...pedido,
      productos: detalles.filter(d => d.id_pedido === pedido.id_pedido),
    }));

    res.json(pedidosConDetalles);
  } catch (err) {
    console.error("Error getOrders:", err);
    res.status(500).json({ message: "Error al obtener el historial de pedidos" });
  }
};

/**
 * Pedidos SOLO del usuario logueado (cliente)
 */
exports.getMyOrders = async (req, res) => {
  try {
    const id_usuario = req.user.id_usuario;
    const pool = await require("../config/db.config").poolPromise;

    // 1. Obtén pedidos del usuario
    const pedidosRes = await pool.request().input("id_usuario", sql.Int, id_usuario).query(`
        SELECT 
          PE.id_pedido,
          PE.fecha_creacion,
          PE.estado_pedido,
          PE.total_pedido
        FROM PEDIDO PE
        WHERE PE.id_usuario = @id_usuario
        ORDER BY PE.fecha_creacion DESC, PE.id_pedido DESC
      `);

    const pedidos = pedidosRes.recordset;
    const ids = pedidos.map(p => p.id_pedido);

    // 2. Obtén detalles de productos por pedido
    let detalles = [];
    if (ids.length) {
      const idsStr = ids.join(",");
      const detallesRes = await pool.request().query(`
        SELECT 
          DP.id_pedido,
          P.nombre_producto AS nombre,
          DP.cantidad,
          DP.precio_unitario_venta
        FROM DETALLE_PEDIDO DP
        INNER JOIN PRODUCTO P ON DP.id_producto = P.id_producto
        WHERE DP.id_pedido IN (${idsStr})
      `);
      detalles = detallesRes.recordset;
    }

    // 3. Une productos a cada pedido
    const pedidosConDetalles = pedidos.map(pedido => ({
      ...pedido,
      productos: detalles.filter(d => d.id_pedido === pedido.id_pedido),
    }));

    res.json(pedidosConDetalles);
  } catch (err) {
    console.error("Error getMyOrders:", err);
    res.status(500).json({ message: "Error al obtener tus compras" });
  }
};

/**
 * Exportar historial (Excel o PDF, aquí solo CSV para simplicidad)
 */
exports.exportOrders = async (req, res) => {
  try {
    // Los mismos filtros que getOrders
    req.query.limit = 1000; // Limite para evitar exceso
    const { search, estado, fechaInicio, fechaFin } = req.query;
    req.query.search = search || "";
    req.query.estado = estado || "";
    req.query.fechaInicio = fechaInicio || "";
    req.query.fechaFin = fechaFin || "";

    // Filtros dinámicos (CORREGIDO para fechas incluyentes)
    let filtros = [];
    if (estado) filtros.push(`PE.estado_pedido = @estado`);
    if (fechaInicio && fechaFin) {
      filtros.push(`CAST(PE.fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin`);
    } else if (fechaInicio) {
      filtros.push(`CAST(PE.fecha_creacion AS DATE) >= @fechaInicio`);
    } else if (fechaFin) {
      filtros.push(`CAST(PE.fecha_creacion AS DATE) <= @fechaFin`);
    }

    if (search) {
      filtros.push(`(U.nombre LIKE @search OR U.apellido LIKE @search OR U.email LIKE @search OR PE.id_pedido = @idPedido)`);
    }
    const where = filtros.length ? "WHERE " + filtros.join(" AND ") : "";

    const pool = await require("../config/db.config").poolPromise;
    const request = pool.request();
    if (estado) request.input("estado", sql.VarChar(50), estado);
    if (fechaInicio) request.input("fechaInicio", sql.Date, fechaInicio);
    if (fechaFin) request.input("fechaFin", sql.Date, fechaFin);
    if (search) {
      request.input("search", sql.VarChar(100), `%${search}%`);
      request.input("idPedido", sql.Int, isNaN(Number(search)) ? 0 : Number(search));
    }

    const pedidosRes = await request.query(`
      SELECT 
        PE.id_pedido,
        PE.fecha_creacion,
        PE.estado_pedido,
        PE.total_pedido,
        U.id_usuario,
        U.nombre + ' ' + U.apellido AS cliente,
        U.email
      FROM PEDIDO PE
      INNER JOIN USUARIO U ON PE.id_usuario = U.id_usuario
      ${where}
      ORDER BY PE.fecha_creacion DESC, PE.id_pedido DESC
    `);

    const pedidos = pedidosRes.recordset;
    const ids = pedidos.map(p => p.id_pedido);
    let detalles = [];
    if (ids.length) {
      const idsStr = ids.join(",");
      const detallesRes = await pool.request().query(`
        SELECT 
          DP.id_pedido,
          P.nombre_producto AS nombre,
          DP.cantidad,
          DP.precio_unitario_venta
        FROM DETALLE_PEDIDO DP
        INNER JOIN PRODUCTO P ON DP.id_producto = P.id_producto
        WHERE DP.id_pedido IN (${idsStr})
      `);
      detalles = detallesRes.recordset;
    }

    // Exportar
    let csv = "ID Pedido,Fecha,Cliente,Email,Estado,Monto Total,Producto,Cantidad,Precio Unitario\n";
    pedidos.forEach(p => {
      const productos = detalles.filter(d => d.id_pedido === p.id_pedido);
      productos.forEach(prod => {
        csv +=
          [
            p.id_pedido,
            new Date(p.fecha_creacion).toLocaleString("es-PE"),
            `"${p.cliente}"`,
            p.email,
            p.estado_pedido,
            p.total_pedido,
            `"${prod.nombre}"`,
            prod.cantidad,
            prod.precio_unitario_venta,
          ].join(",") + "\n";
      });
      if (!productos.length) {
        csv +=
          [
            p.id_pedido,
            new Date(p.fecha_creacion).toLocaleString("es-PE"),
            `"${p.cliente}"`,
            p.email,
            p.estado_pedido,
            p.total_pedido,
            "",
            "",
            "",
          ].join(",") + "\n";
      }
    });

    res.header("Content-Type", "text/csv");
    res.attachment("historial_pedidos.csv");
    return res.send(csv);
  } catch (err) {
    console.error("Error exportOrders:", err);
    res.status(500).json({ message: "Error al exportar el historial" });
  }
};

// === NUEVO: pedidos pendientes para EMPLEADO ===
exports.getPendingOrders = async (req, res) => {
  try {
    const pool = await require("../config/db.config").poolPromise;

    // 1️⃣ Capturamos los filtros de fecha de la query (llegan del frontend)
    const { fechaInicio, fechaFin, search = "" } = req.query;

    // 2️⃣ Construimos el WHERE dinámico (filtro base: pedidos pendientes)
    let where = "WHERE PE.estado_pedido = 'PENDIENTE'";
    if (fechaInicio && fechaFin) {
      // Si ambas fechas están presentes, filtro entre ambas
      where += " AND CAST(PE.fecha_creacion AS DATE) BETWEEN @fechaInicio AND @fechaFin";
    } else if (fechaInicio) {
      // Si solo hay fechaInicio, filtro desde esa fecha en adelante
      where += " AND CAST(PE.fecha_creacion AS DATE) >= @fechaInicio";
    } else if (fechaFin) {
      // Si solo hay fechaFin, filtro hasta esa fecha
      where += " AND CAST(PE.fecha_creacion AS DATE) <= @fechaFin";
    }

    if (search) {
      where += ` AND (
          U.nombre LIKE @search
          OR U.apellido LIKE @search
          OR PE.id_pedido = @idPedido
          OR EXISTS (
              SELECT 1
              FROM DETALLE_PEDIDO DP
              JOIN PRODUCTO P ON P.id_producto = DP.id_producto
              WHERE DP.id_pedido = PE.id_pedido
                AND P.nombre_producto LIKE @search
          )
      )`;
    }

    // 3️⃣ Creamos la consulta parametrizada para evitar SQL Injection
    const request = pool.request();
    if (fechaInicio) request.input("fechaInicio", sql.Date, fechaInicio);
    if (fechaFin) request.input("fechaFin", sql.Date, fechaFin);
    if (search) {
      request.input("search", sql.VarChar(100), `%${search}%`);
      request.input(
        "idPedido",
        sql.Int,
        isNaN(Number(search)) ? 0 : Number(search) // si es número lo usamos
      );
    }

    // 4️⃣ Consulta principal con el WHERE dinámico y orden ascendente
    const pedidosRes = await request.query(`
      SELECT 
        PE.id_pedido,
        PE.fecha_creacion,
        PE.estado_pedido,
        PE.direccion_envio,
        U.nombre + ' ' + U.apellido AS cliente
      FROM PEDIDO PE
      INNER JOIN USUARIO U ON U.id_usuario = PE.id_usuario
      ${where}
      ORDER BY PE.fecha_creacion ASC, PE.id_pedido ASC
    `);

    const pedidos = pedidosRes.recordset;
    if (!pedidos.length) return res.json([]);

    // 5️⃣ Traemos los detalles de productos para los pedidos seleccionados
    const idsStr = pedidos.map(p => p.id_pedido).join(",");
    const detallesRes = await pool.request().query(`
      SELECT 
        DP.id_pedido,
        DP.cantidad,
        P.nombre_producto AS nombre
      FROM DETALLE_PEDIDO DP
      INNER JOIN PRODUCTO P ON P.id_producto = DP.id_producto
      WHERE DP.id_pedido IN (${idsStr})
    `);

    const detalles = detallesRes.recordset;

    // 6️⃣ Armamos el JSON final que espera el frontend
    const data = pedidos.map(p => ({
      id_pedido: p.id_pedido,
      fecha_creacion: p.fecha_creacion.toISOString().split("T")[0],
      cliente: p.cliente,
      direccion_envio: p.direccion_envio,
      estado: p.estado_pedido,
      productos: detalles.filter(d => d.id_pedido === p.id_pedido).map(d => ({ cantidad: d.cantidad, nombre: d.nombre })),
    }));

    res.json(data);
  } catch (err) {
    console.error("Error getPendingOrders:", err);
    res.status(500).json({ message: "Error al obtener pedidos pendientes" });
  }
};

// GET /orders/:id – Detalle de un pedido (EMPLEADO o ADMIN)
exports.getOrderById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "ID inválido" });

    const pool = await require("../config/db.config").poolPromise;

    // 1) Encabezado + cliente
    const headerRes = await pool.request().input("id", sql.Int, id).query(`
        SELECT 
          PE.id_pedido,
          PE.fecha_creacion,
          PE.estado_pedido,
          PE.total_pedido,
          PE.direccion_envio,
          U.nombre + ' ' + U.apellido AS cliente
        FROM PEDIDO PE
        JOIN USUARIO U ON U.id_usuario = PE.id_usuario
        WHERE PE.id_pedido = @id
      `);

    if (!headerRes.recordset.length) return res.status(404).json({ message: "Pedido no encontrado" });

    // 2) Productos del pedido
    const itemsRes = await pool.request().input("id", sql.Int, id).query(`
        SELECT 
          P.nombre_producto AS nombre,
          DP.cantidad,
          DP.precio_unitario_venta AS precio
        FROM DETALLE_PEDIDO DP
        JOIN PRODUCTO P ON P.id_producto = DP.id_producto
        WHERE DP.id_pedido = @id
      `);

    res.json({
      ...headerRes.recordset[0],
      productos: itemsRes.recordset,
    });
  } catch (err) {
    console.error("getOrderById:", err);
    res.status(500).json({ message: "Error al obtener detalle" });
  }
};

// PATCH /orders/:id/prepare – Marcar un pedido como PREPARADO
exports.markOrderPrepared = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.id_usuario; // quien hizo el cambio

    if (!id) return res.status(400).json({ message: "ID inválido" });

    const pool = await require("../config/db.config").poolPromise;

    /* 1️⃣ Verificar que exista y esté Pendiente */
    const pedRes = await pool.request().input("id", sql.Int, id).query(`
        SELECT estado_pedido
        FROM PEDIDO
        WHERE id_pedido = @id
      `);

    if (!pedRes.recordset.length) return res.status(404).json({ message: "Pedido no encontrado" });

    if (pedRes.recordset[0].estado_pedido !== "PENDIENTE") return res.status(400).json({ message: "El pedido no está pendiente" });

    /* 2️⃣ Actualizar estado */
    await pool.request().input("id", sql.Int, id).query(`
      UPDATE PEDIDO
      SET estado_pedido = 'PREPARADO'
      WHERE id_pedido = @id
    `);

    /* 3️⃣ Registrar en HISTORIAL (opcional, buena práctica) */
    await pool
      .request()
      .input("desc", sql.NVarChar, "Pedido marcado como preparado")
      .input("accion", sql.VarChar(100), "PREPARAR_PEDIDO")
      .input("id_pedido", sql.Int, id)
      .input("id_usuario", sql.Int, userId).query(`
        INSERT INTO HISTORIAL (descripcion, accion, id_pedido, id_usuario)
        VALUES (@desc, @accion, @id_pedido, @id_usuario)
    `);

    res.json({ ok: true, message: "Pedido marcado como preparado" });
  } catch (err) {
    console.error("markOrderPrepared:", err);
    res.status(500).json({ message: "Error al actualizar pedido" });
  }
};

// PATCH /orders/prepare-bulk  – Acción masiva
exports.markOrdersPreparedBulk = async (req, res) => {
  try {
    const ids = req.body.ids || [];
    const userId = req.user.id_usuario;

    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: "Lista de IDs vacía." });

    const pool = await require("../config/db.config").poolPromise;
    const transaction = new sql.Transaction(await pool.connect());

    try {
      await transaction.begin();

      // 1️⃣ Actualizar solo pedidos pendientes (TABLA PEDIDO)
      const idsStr = ids.join(",");
      const updateRes = await transaction.request().query(`
        UPDATE PEDIDO
        SET estado_pedido = 'PREPARADO'
        OUTPUT INSERTED.id_pedido
        WHERE estado_pedido = 'PENDIENTE'
          AND id_pedido IN (${idsStr})
      `);

      const updatedIds = updateRes.recordset.map(r => r.id_pedido);

      // 2️⃣ Registrar historial (bulk insert sencillo) (TABLA HISTORIAL)
      if (updatedIds.length) {
        const values = updatedIds.map(id => `('Pedidos preparados masivo','PREPARAR_PEDIDO',${id},${userId})`).join(",");
        await transaction.request().query(`
          INSERT INTO HISTORIAL (descripcion, accion, id_pedido, id_usuario)
          VALUES ${values}
        `);
      }

      await transaction.commit();
      res.json({ updated: updatedIds.length });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("markOrdersPreparedBulk:", err);
    res.status(500).json({ message: "Error en acción masiva" });
  }
};

// Lista de pedidos que pueden cambiar de estado (PREPARADO o EN CAMINO)
exports.getTransitionable = async (req, res) => {
  try {
    const pool = await require("../config/db.config").poolPromise;

    const result = await pool.request().query(`
      SELECT
        PE.id_pedido,
        PE.fecha_creacion,
        PE.estado_pedido AS estado_actual,
        CASE 
          WHEN PE.estado_pedido = 'PREPARADO' THEN 'EN CAMINO'
          WHEN PE.estado_pedido = 'EN CAMINO' THEN 'ENTREGADO'
          ELSE NULL
        END AS siguiente_estado,
        U.nombre + ' ' + U.apellido AS cliente,
        PE.direccion_envio
      FROM PEDIDO PE
      INNER JOIN USUARIO U ON U.id_usuario = PE.id_usuario
      WHERE PE.estado_pedido IN ('PREPARADO','EN CAMINO')
      ORDER BY PE.fecha_creacion ASC, PE.id_pedido ASC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getTransitionable:", err);
    res.status(500).json({ message: "Error al listar pedidos transicionables" });
  }
};

// Mapa de transiciones válidas
const ALLOWED_TRANSITIONS = {
  PREPARADO: "EN CAMINO",
  "EN CAMINO": "ENTREGADO",
};

// PATCH /orders/:id/transition
exports.transitionOrder = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { from, to } = req.body || {};
    const userId = req.user.id_usuario;

    if (!id || !from || !to) {
      return res.status(400).json({ message: "Parámetros incompletos" });
    }
    if (ALLOWED_TRANSITIONS[from] !== to) {
      return res.status(400).json({ message: "Transición no permitida" });
    }

    const pool = await require("../config/db.config").poolPromise;

    // 1) Verificar estado actual
    const cur = await pool.request().input("id", sql.Int, id).query(`
      SELECT estado_pedido FROM PEDIDO WHERE id_pedido = @id
    `);
    if (!cur.recordset.length) {
      return res.status(404).json({ message: "Pedido no encontrado" });
    }
    const estadoActual = cur.recordset[0].estado_pedido;
    if (estadoActual !== from) {
      // Conflicto: otro usuario lo cambió antes
      return res.status(409).json({
        message: `El pedido ya está en "${estadoActual}". Refresca la lista.`,
      });
    }

    // 2) Actualizar PEDIDO
    await pool.request().input("id", sql.Int, id).input("to", sql.VarChar(50), to).query(`
        UPDATE PEDIDO
        SET estado_pedido = @to
        WHERE id_pedido = @id
      `);

    // 3) (Opcional) tocar ENVIO si existe
    if (to === "EN CAMINO") {
      await pool.request().input("id", sql.Int, id).query(`
        UPDATE ENVIO
        SET estado_envio = 'EN CAMINO',
            fecha_envio  = ISNULL(fecha_envio, GETDATE())
        WHERE id_pedido = @id
      `);
    } else if (to === "ENTREGADO") {
      await pool.request().input("id", sql.Int, id).query(`
        UPDATE ENVIO
        SET estado_envio = 'ENTREGADO'
        WHERE id_pedido = @id
      `);
    }

    // 4) Registrar en HISTORIAL
    await pool
      .request()
      .input("desc", sql.NVarChar, `${from} -> ${to}`)
      .input("accion", sql.VarChar(100), "TRANSICION_ESTADO")
      .input("id_pedido", sql.Int, id)
      .input("id_usuario", sql.Int, userId).query(`
        INSERT INTO HISTORIAL (descripcion, accion, id_pedido, id_usuario)
        VALUES (@desc, @accion, @id_pedido, @id_usuario)
      `);

    res.json({ ok: true, id_pedido: id, from, to });
  } catch (err) {
    console.error("transitionOrder:", err);
    res.status(500).json({ message: "Error al cambiar estado" });
  }
};

// GET /orders/status-log?limit=20
exports.getStatusLog = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const pool = await poolPromise;

    // Normaliza a UTC y escupe ISO con milisegundos (3 dígitos) + 'Z'
    const result = await pool.request().query(`
      SELECT TOP (${limit})
        CONVERT(varchar(23),  /* yyyy-mm-ddThh:mm:ss.mmm (23 chars) */
          SWITCHOFFSET(
            TODATETIMEOFFSET(H.fecha_accion, DATEPART(TZOFFSET, SYSDATETIMEOFFSET())), /* pega offset del servidor */
            '+00:00'                                /* lo reexpresa en UTC */
          ),
        126) + 'Z' AS fecha_iso_utc,               /* ISO UTC estricto para JS */
        H.id_pedido,
        H.descripcion AS cambio,
        U.nombre + ' ' + U.apellido AS responsable
      FROM HISTORIAL H
      INNER JOIN USUARIO U ON U.id_usuario = H.id_usuario
      WHERE H.accion IN ('TRANSICION_ESTADO','PREPARAR_PEDIDO')
      ORDER BY H.fecha_accion DESC, H.id_historial DESC
    `);

    const rows = result.recordset.map(r => {
      const parts = (r.cambio || "").split(/\s*(?:→|->|⇒|➡|>)+\s*/);
      return {
        // 👇 nombre estable que usará el frontend
        fecha_accion_utc: r.fecha_iso_utc,
        id_pedido: r.id_pedido,
        responsable: r.responsable,
        anterior: parts[0] || null,
        nuevo: parts[1] || null,
      };
    });

    res.json(rows);
  } catch (err) {
    console.error("getStatusLog:", err);
    res.status(500).json({ message: "Error al obtener log" });
  }
};

// KPIs para panel de empleado
exports.getEmployeeKpis = async (req, res) => {
  try {
    const pool = await require("../config/db.config").poolPromise;

    const result = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM PEDIDO WHERE estado_pedido = 'PENDIENTE') AS pendientes,
        (SELECT COUNT(*) FROM PEDIDO WHERE estado_pedido = 'EN CAMINO') AS encamino,
        (
          SELECT COUNT(*)
          FROM HISTORIAL H
          WHERE H.accion = 'TRANSICION_ESTADO'
            AND CAST(H.fecha_accion AS DATE) = CAST(GETDATE() AS DATE)
            AND H.descripcion LIKE '%EN CAMINO%'
            AND H.descripcion LIKE '%ENTREGADO%'
        ) AS entregadosHoy
    `);

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("getEmployeeKpis:", err);
    res.status(500).json({ message: "Error al obtener KPIs" });
  }
};

// Exporta CSV de PEDIDOS PENDIENTES (empleado)
exports.exportPendingOrders = async (req, res) => {
  try {
    const pool = await require("../config/db.config").poolPromise;
    const { fechaInicio = "", fechaFin = "", search = "" } = req.query;

    let where = "WHERE PE.estado_pedido = 'PENDIENTE'";
    const request = pool.request();

    if (fechaInicio && fechaFin) {
      where += " AND CAST(PE.fecha_creacion AS DATE) BETWEEN @fi AND @ff";
      request.input("fi", sql.Date, fechaInicio);
      request.input("ff", sql.Date, fechaFin);
    } else if (fechaInicio) {
      where += " AND CAST(PE.fecha_creacion AS DATE) >= @fi";
      request.input("fi", sql.Date, fechaInicio);
    } else if (fechaFin) {
      where += " AND CAST(PE.fecha_creacion AS DATE) <= @ff";
      request.input("ff", sql.Date, fechaFin);
    }

    if (search) {
      where += ` AND (
        U.nombre LIKE @q OR U.apellido LIKE @q OR PE.id_pedido = @idPedido OR
        EXISTS (
          SELECT 1 FROM DETALLE_PEDIDO DP
          JOIN PRODUCTO P ON P.id_producto = DP.id_producto
          WHERE DP.id_pedido = PE.id_pedido AND P.nombre_producto LIKE @q
        )
      )`;
      request.input("q", sql.VarChar(100), `%${search}%`);
      request.input("idPedido", sql.Int, isNaN(Number(search)) ? 0 : Number(search));
    }

    const pedidosRes = await request.query(`
      SELECT PE.id_pedido, PE.fecha_creacion, PE.estado_pedido, PE.direccion_envio,
             U.nombre + ' ' + U.apellido AS cliente
      FROM PEDIDO PE
      INNER JOIN USUARIO U ON U.id_usuario = PE.id_usuario
      ${where}
      ORDER BY PE.fecha_creacion ASC, PE.id_pedido ASC
    `);

    const pedidos = pedidosRes.recordset;
    let detalles = [];
    if (pedidos.length) {
      const idsStr = pedidos.map(p => p.id_pedido).join(",");
      const detRes = await pool.request().query(`
        SELECT DP.id_pedido, P.nombre_producto AS nombre, DP.cantidad
        FROM DETALLE_PEDIDO DP
        INNER JOIN PRODUCTO P ON P.id_producto = DP.id_producto
        WHERE DP.id_pedido IN (${idsStr})
      `);
      detalles = detRes.recordset;
    }

    let csv = "ID Pedido,Fecha,Cliente,Dirección,Estado,Producto,Cantidad\n";
    for (const p of pedidos) {
      const prods = detalles.filter(d => d.id_pedido === p.id_pedido);
      if (prods.length) {
        for (const d of prods) {
          csv +=
            [
              p.id_pedido,
              new Date(p.fecha_creacion).toLocaleString("es-PE"),
              `"${p.cliente}"`,
              `"${p.direccion_envio || ""}"`,
              p.estado_pedido,
              `"${d.nombre}"`,
              d.cantidad,
            ].join(",") + "\n";
        }
      } else {
        csv +=
          [
            p.id_pedido,
            new Date(p.fecha_creacion).toLocaleString("es-PE"),
            `"${p.cliente}"`,
            `"${p.direccion_envio || ""}"`,
            p.estado_pedido,
            "",
            "",
          ].join(",") + "\n";
      }
    }

    res.header("Content-Type", "text/csv");
    res.attachment("pendientes.csv");
    return res.send(csv);
  } catch (err) {
    console.error("exportPendingOrders:", err);
    res.status(500).json({ message: "Error al exportar pendientes" });
  }
};

// Exporta CSV del HISTORIAL DE ESTADOS (empleado)
exports.exportStatusLog = async (req, res) => {
  try {
    const pool = await require("../config/db.config").poolPromise;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    const rs = await pool.request().query(`
      SELECT TOP (${limit})
        CONVERT(varchar(23),
          SWITCHOFFSET(TODATETIMEOFFSET(H.fecha_accion, DATEPART(TZOFFSET, SYSDATETIMEOFFSET())), '+00:00'),
        126) + 'Z' AS fecha_iso_utc,
        H.id_pedido,
        H.descripcion AS cambio,
        U.nombre + ' ' + U.apellido AS responsable
      FROM HISTORIAL H
      INNER JOIN USUARIO U ON U.id_usuario = H.id_usuario
      WHERE H.accion IN ('TRANSICION_ESTADO','PREPARAR_PEDIDO')
      ORDER BY H.fecha_accion DESC, H.id_historial DESC
    `);

    const rows = rs.recordset.map(r => {
      const [anterior = "", nuevo = ""] = (r.cambio || "").split(/\s*(?:→|->|⇒|➡|>)+\s*/);
      return { fecha: r.fecha_iso_utc, id_pedido: r.id_pedido, anterior, nuevo, responsable: r.responsable };
    });

    let csv = "Fecha UTC,Pedido,Estado Anterior,Estado Nuevo,Responsable\n";
    for (const r of rows) {
      csv += [r.fecha, r.id_pedido, r.anterior, r.nuevo, `"${r.responsable}"`].join(",") + "\n";
    }

    res.header("Content-Type", "text/csv");
    res.attachment("historial_estados.csv");
    return res.send(csv);
  } catch (err) {
    console.error("exportStatusLog:", err);
    res.status(500).json({ message: "Error al exportar historial" });
  }
};

// === NUEVO: helpers internos ===
function getUserId(req) {
  return req.user?.id_usuario || req.userId;
}

// Genera una numeración sencilla tipo B001-0001 / F001-0001
async function getNextComprobanteNumber(pool, tipo) {
  const prefix = tipo === "FACTURA" ? "F001-" : "B001-";
  const { recordset } = await pool
    .request()
    .input("tipo", sql.VarChar, tipo)
    .input("pref", sql.VarChar, prefix + "%").query(`SELECT TOP 1 numero_comprobante AS lastNum
            FROM COMPROBANTE
            WHERE tipo_comprobante = @tipo AND numero_comprobante LIKE @pref
            ORDER BY id_comprobante DESC`);
  if (!recordset[0]) return prefix + "0001";
  const last = recordset[0].lastNum;
  const n = parseInt(last.split("-")[1] || "0", 10) + 1;
  return prefix + String(n).padStart(4, "0");
}

/**
 * POST /api/orders
 * Crea un pedido en estado PENDIENTE con los ítems actuales del CARRITO del usuario.
 * Body: { deliveryType, address, shippingCost, receiptType, receiptData, paymentMethodId }
 */
// === POST /api/orders  (crea pedido en estado PENDIENTE a partir del CARRITO) ===
exports.createDraftOrder = async (req, res) => {
  const userId = req.user?.id_usuario || req.userId;
  if (!userId) return res.status(401).json({ message: "No autenticado" });

  const {
    deliveryType = "RECOJO", // "DOMICILIO" | "RECOJO"
    address = "Recojo en tienda – Sede Central",
    shippingCost = 0, // el back validará costo real
    receiptType = "BOLETA", // se usará al finalizar pago
    receiptData = {},
    paymentMethodId = 4, // Tarjeta por defecto
  } = req.body || {};

  try {
    const pool = await poolPromise;

    // 1) Items del carrito
    const itemsRes = await pool.request().input("id_usuario", sql.Int, userId).query(`
        SELECT C.id_producto, C.cantidad, P.precio, P.nombre_producto
        FROM CARRITO C
        INNER JOIN PRODUCTO P ON P.id_producto = C.id_producto
        WHERE C.id_usuario = @id_usuario
      `);

    const items = itemsRes.recordset;
    if (!items.length) return res.status(400).json({ message: "Tu carrito está vacío" });

    const subtotal = items.reduce((s, it) => s + Number(it.precio) * it.cantidad, 0);
    const costoEnvio = Number(deliveryType === "DOMICILIO" ? shippingCost || 5 : 0);
    const total = subtotal + costoEnvio;
    const direccionEnvio = deliveryType === "DOMICILIO" ? address : "Recojo en tienda – Sede Central";

    // 2) Transacción
    const tx = new sql.Transaction(await poolPromise);
    await tx.begin();
    const reqTx = new sql.Request(tx);

    // 2.1) Encabezado PEDIDO (OJO: SIN tipo_comprobante)
    const pedRes = await reqTx
      .input("total", sql.Decimal(10, 2), total.toFixed(2))
      .input("envio", sql.Decimal(10, 2), costoEnvio.toFixed(2))
      .input("dir", sql.VarChar(255), direccionEnvio)
      .input("user", sql.Int, userId)
      .input("pm", sql.Int, paymentMethodId).query(`
        INSERT INTO PEDIDO (estado_pedido, total_pedido, costo_envio, direccion_envio, id_usuario, id_metodo_pago)
        OUTPUT INSERTED.id_pedido
        VALUES ('PENDIENTE', @total, @envio, @dir, @user, @pm)
      `);
    const orderId = pedRes.recordset[0].id_pedido;

    // 2.2) Detalles  (USAR UN NUEVO Request POR CADA ÍTEM)
    for (const it of items) {
      const dReq = new sql.Request(tx); // <- Request NUEVO en cada iteración
      await dReq
        .input("idp", sql.Int, orderId)
        .input("prod", sql.Int, it.id_producto)
        .input("cant", sql.Int, it.cantidad)
        .input("precio", sql.Decimal(10, 2), Number(it.precio).toFixed(2))
        .input("sub", sql.Decimal(10, 2), (Number(it.precio) * it.cantidad).toFixed(2)).query(`
          INSERT INTO DETALLE_PEDIDO (cantidad, precio_unitario_venta, subtotal, id_pedido, id_producto)
          VALUES (@cant, @precio, @sub, @idp, @prod)
        `);
    }

    await tx.commit();

    // Deja el carrito tal cual (se vacía al confirmar pago)
    return res.status(201).json({
      orderId,
      subtotal: +subtotal.toFixed(2),
      shipping: +costoEnvio.toFixed(2),
      total: +total.toFixed(2),
      receiptType,
      receiptData,
      paymentMethodId,
    });
  } catch (err) {
    console.error("createDraftOrder error:", err);
    return res.status(500).json({ message: "No se pudo crear el pedido" });
  }
};

// === Finaliza pedido tras pago (mock/webhook)
// Deja el pedido en PENDIENTE y emite SSE al dueño del pedido
exports.finalizeOrderOnPayment = async (reqOrPayload, res) => {
  const body = reqOrPayload?.body ? reqOrPayload.body : reqOrPayload; // dual-signature
  const { orderId, receiptType, receiptData, paymentMethodId } = body || {};

  if (!orderId || !paymentMethodId) {
    if (res) return res.status(400).json({ error: "Faltan datos para confirmar el pago" });
    throw new Error("Faltan datos para confirmar el pago");
  }

  const pool = await poolPromise; // pool global
  const tx = new sql.Transaction(pool); // transacción

  let userIdForSse = null; // para emitir SSE tras commit

  try {
    await tx.begin();

    // 1) Validar que el pedido existe y obtener el usuario dueño
    {
      const rq = new sql.Request(tx);
      rq.input("orderId", sql.Int, orderId);
      const { recordset } = await rq.query(`
        SELECT id_pedido, id_usuario, estado_pedido
        FROM PEDIDO
        WHERE id_pedido = @orderId
      `);
      if (!recordset.length) throw new Error("Pedido no encontrado");
      userIdForSse = recordset[0].id_usuario || null;
    }

    // 2) Total del pedido (por DETALLE_PEDIDO)
    let totalPedido = 0;
    {
      const rq = new sql.Request(tx);
      rq.input("orderId", sql.Int, orderId);
      const { recordset } = await rq.query(`
        SELECT ISNULL(SUM(subtotal),0) AS total
        FROM DETALLE_PEDIDO
        WHERE id_pedido = @orderId
      `);
      totalPedido = Number(recordset[0]?.total || 0);
    }

    // 3) Costo de envío guardado en PEDIDO
    let shippingCost = 0;
    {
      const rq = new sql.Request(tx);
      rq.input("orderId", sql.Int, orderId);
      const { recordset } = await rq.query(`
        SELECT ISNULL(costo_envio, 0) AS shipping
        FROM PEDIDO
        WHERE id_pedido = @orderId
      `);
      shippingCost = Number(recordset[0]?.shipping || 0);
    }

    // 4) Actualizar PEDIDO: método de pago y estado = PENDIENTE
    {
      const rq = new sql.Request(tx);
      rq.input("orderId", sql.Int, orderId);
      rq.input("pm", sql.Int, paymentMethodId);
      rq.input("nuevoEstado", sql.VarChar(50), "PENDIENTE"); // ← aquí el fix
      await rq.query(`
        UPDATE PEDIDO
        SET id_metodo_pago = @pm,
            estado_pedido = @nuevoEstado
        WHERE id_pedido = @orderId
      `);
    }

    // 5) Generar número de comprobante
    const tipo = receiptType === "FACTURA" ? "FACTURA" : "BOLETA";
    let numeroComprobante = "B001-0001";
    {
      const rq = new sql.Request(tx);
      rq.input("tipo", sql.VarChar(50), tipo);
      const { recordset } = await rq.query(`
        SELECT COUNT(*) + 1 AS n
        FROM COMPROBANTE
        WHERE tipo_comprobante = @tipo
      `);
      const n = String(recordset[0].n).padStart(4, "0");
      numeroComprobante = tipo === "FACTURA" ? `F001-${n}` : `B001-${n}`;
    }

    // 6) Insertar COMPROBANTE
    let idComprobante = null;
    {
      const rq = new sql.Request(tx);
      rq.input("tipo", sql.VarChar(50), tipo);
      rq.input("numero", sql.VarChar(50), numeroComprobante);
      rq.input("monto", sql.Decimal(10, 2), totalPedido + shippingCost);
      rq.input("orderId", sql.Int, orderId);
      rq.input("pm", sql.Int, paymentMethodId);
      const { recordset } = await rq.query(`
        INSERT INTO COMPROBANTE (
          tipo_comprobante,
          numero_comprobante,
          fecha_creacion,
          monto_total,
          estado_comprobante,
          fecha_emision,
          id_pedido,
          id_metodo_pago
        )
        OUTPUT inserted.id_comprobante AS id
        VALUES (
          @tipo,
          @numero,
          GETDATE(),
          @monto,
          'PAGADO',
          GETDATE(),
          @orderId,
          @pm
        )
      `);
      idComprobante = recordset[0].id;
    }

    // 7) Detalle del comprobante
    if (tipo === "BOLETA") {
      const { nombre, dni } = receiptData || {};
      const rq = new sql.Request(tx);
      rq.input("idc", sql.Int, idComprobante);
      rq.input("nom", sql.VarChar(100), nombre || "Cliente");
      rq.input("dni", sql.VarChar(20), dni || "00000000");
      await rq.query(`
        INSERT INTO BOLETA (nombre_cliente, dni_cliente, id_comprobante)
        VALUES (@nom, @dni, @idc)
      `);
    } else {
      const { razon_social, ruc, direccion } = receiptData || {};
      const rq = new sql.Request(tx);
      rq.input("idc", sql.Int, idComprobante);
      rq.input("base", sql.Decimal(10, 2), Math.max(totalPedido + shippingCost - 2.4, 0)); // ajusta a tu IGV real
      rq.input("imp", sql.Decimal(10, 2), 2.4);
      rq.input("rs", sql.VarChar(100), razon_social || "Cliente");
      rq.input("ruc", sql.VarChar(20), ruc || "00000000000");
      rq.input("dir", sql.VarChar(255), direccion || "");
      await rq.query(`
        INSERT INTO FACTURA (
          monto_base, monto_impuesto,
          razon_social_cliente, ruc_cliente, direccion_cliente,
          id_comprobante
        )
        VALUES (@base, @imp, @rs, @ruc, @dir, @idc)
      `);
    }

    // 8) Vaciar carrito del dueño del pedido (si lo tenemos)
    if (userIdForSse) {
      const rqDel = new sql.Request(tx);
      rqDel.input("uid", sql.Int, userIdForSse);
      await rqDel.query(`DELETE FROM CARRITO WHERE id_usuario = @uid`);
    } else {
      // fallback: leer y vaciar
      const rqU = new sql.Request(tx);
      rqU.input("orderId", sql.Int, orderId);
      const rs = await rqU.query(`SELECT id_usuario FROM PEDIDO WHERE id_pedido = @orderId`);
      userIdForSse = rs.recordset[0]?.id_usuario || null;
      if (userIdForSse) {
        const rqDel = new sql.Request(tx);
        rqDel.input("uid", sql.Int, userIdForSse);
        await rqDel.query(`DELETE FROM CARRITO WHERE id_usuario = @uid`);
      }
    }

    await tx.commit();

    // 9) Emitir actualización en tiempo real (SSE) al cliente
    try {
      if (userIdForSse) {
        emitToUser(Number(userIdForSse), "order-update", {
          id_pedido: orderId,
          estado_pedido: "PENDIENTE",
        });
      }
    } catch {}

    const payload = { orderId, idComprobante, numero: numeroComprobante };
    return res ? res.status(200).json({ ok: true, ...payload }) : payload;
  } catch (err) {
    if (tx._aborted !== true) {
      try {
        await tx.rollback();
      } catch {}
    }
    console.error("finalizeOrderOnPayment error:", err);
    if (res) return res.status(500).json({ error: "No se pudo confirmar el pago" });
    throw err;
  }
};
