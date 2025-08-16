// backend/controllers/dispatchController.js
const { sql } = require("../config/db.config");

exports.createDispatch = async (req, res) => {
  const pool = await require("../config/db.config").poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    const userId = req.user.id_usuario;
    const { observacion = "", items = [], id_pedido = null } = req.body || {};

    // Validaciones básicas
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No hay items para despachar." });
    }
    for (const it of items) {
      if (!Number.isInteger(it?.id_inventario) || !Number.isInteger(it?.cantidad) || it.cantidad <= 0) {
        return res.status(400).json({ message: "Item inválido (id_inventario/cantidad)." });
      }
    }

    await tx.begin(); // ← Arranca la transacción
    const summary = [];

    // 👇 Ejecutamos cada salida dentro de la misma transacción
    for (const it of items) {
      const reqTx = new sql.Request(tx);

      // 1) Descontar stock de forma atómica (evita condiciones de carrera)
      const upd = await reqTx.input("id", sql.Int, it.id_inventario).input("cantidad", sql.Int, it.cantidad).query(`
          UPDATE INVENTARIO
            SET cantidad_disponible = cantidad_disponible - @cantidad
          WHERE id_inventario = @id
            AND cantidad_disponible >= @cantidad;

          SELECT @@ROWCOUNT AS rowsAffected;
        `);

      const ok = upd.recordset?.[0]?.rowsAffected > 0;
      if (!ok) {
        // Si no pudo actualizar, no había stock suficiente
        throw Object.assign(new Error("Stock insuficiente"), {
          status: 409,
          detail: { id_inventario: it.id_inventario, cantidad: it.cantidad },
        });
      }

      // 2) Registrar salida (fecha_salida tiene DEFAULT GETDATE())
      await new sql.Request(tx)
        .input("cantidad", sql.Int, it.cantidad)
        .input("motivo", sql.VarChar(255), observacion.substring(0, 255))
        .input("id_inventario", sql.Int, it.id_inventario)
        .input("id_usuario", sql.Int, userId).query(`
          INSERT INTO SALIDA_INVENTARIO (cantidad_salida, motivo_salida, id_inventario, id_usuario)
          VALUES (@cantidad, @motivo, @id_inventario, @id_usuario);
        `);

      // 3) Obtener nombre producto + nuevo stock (solo para devolver al cliente)
      const after = await new sql.Request(tx).input("id", sql.Int, it.id_inventario).query(`
          SELECT I.cantidad_disponible AS nuevo_stock,
                 P.nombre_producto
          FROM INVENTARIO I
          JOIN PRODUCTO P ON P.id_producto = I.id_producto
          WHERE I.id_inventario = @id
        `);

      summary.push({
        id_inventario: it.id_inventario,
        cantidad: it.cantidad,
        nuevo_stock: after.recordset[0]?.nuevo_stock ?? null,
        nombre: after.recordset[0]?.nombre_producto ?? "",
      });
    }

    // 4) Auditoría (HISTORIAL) — opcionalmente enlazado a un pedido
    await new sql.Request(tx)
      .input("desc", sql.NVarChar, `SALIDA_DESPACHO: ${items.length} items. ${observacion.substring(0, 200)}`)
      .input("accion", sql.VarChar(100), "SALIDA_DESPACHO")
      .input("id_pedido", sql.Int, id_pedido ?? null)
      .input("id_usuario", sql.Int, userId).query(`
        INSERT INTO HISTORIAL (descripcion, accion, id_pedido, id_usuario)
        VALUES (@desc, @accion, @id_pedido, @id_usuario);
      `);

    await tx.commit();

    return res.json({
      ok: true,
      items: summary,
      message: "Despacho registrado correctamente.",
    });
  } catch (err) {
    // Rollback seguro
    try {
      await tx.rollback();
    } catch {}

    const status = err.status || 500;
    if (status === 409 && err.detail) {
      return res.status(409).json({
        message: "Stock insuficiente para uno o más productos.",
        detail: err.detail,
      });
    }

    console.error("createDispatch:", err);
    return res.status(status).json({ message: "Error al registrar el despacho." });
  }
};

// Listar salidas (con filtros)
exports.listOutbound = async (req, res) => {
  try {
    const { fechaInicio = "", fechaFin = "", search = "", almacen = "" } = req.query;
    const pool = await require("../config/db.config").poolPromise;
    const request = pool.request();

    const filtros = [];
    if (fechaInicio && fechaFin) {
      filtros.push(`CAST(SI.fecha_salida AS DATE) BETWEEN @fi AND @ff`);
      request.input("fi", require("../config/db.config").sql.Date, fechaInicio);
      request.input("ff", require("../config/db.config").sql.Date, fechaFin);
    } else if (fechaInicio) {
      filtros.push(`CAST(SI.fecha_salida AS DATE) >= @fi`);
      request.input("fi", require("../config/db.config").sql.Date, fechaInicio);
    } else if (fechaFin) {
      filtros.push(`CAST(SI.fecha_salida AS DATE) <= @ff`);
      request.input("ff", require("../config/db.config").sql.Date, fechaFin);
    }

    if (search) {
      filtros.push(`(P.nombre_producto LIKE @q OR SI.motivo_salida LIKE @q OR (U.nombre + ' ' + U.apellido) LIKE @q)`);
      request.input("q", require("../config/db.config").sql.VarChar(120), `%${search}%`);
    }

    if (almacen) {
      filtros.push(`I.id_almacen = @almacen`);
      request.input("almacen", require("../config/db.config").sql.Int, Number(almacen));
    }

    const where = filtros.length ? "WHERE " + filtros.join(" AND ") : "";

    const rows = await request.query(`
      SELECT
        SI.id_salida_inventario,
        ((CAST(SI.fecha_salida AS datetime2) AT TIME ZONE 'SA Pacific Standard Time') AT TIME ZONE 'UTC') AS fecha_salida_utc,
        P.nombre_producto AS producto,
        SI.cantidad_salida   AS cantidad,
        SI.motivo_salida     AS motivo,
        A.nombre_almacen     AS almacen,
        COALESCE(U.nombre + ' ' + U.apellido, '-') AS responsable
      FROM SALIDA_INVENTARIO SI
      JOIN INVENTARIO I ON I.id_inventario = SI.id_inventario
      JOIN PRODUCTO  P ON P.id_producto   = I.id_producto
      JOIN ALMACEN   A ON A.id_almacen    = I.id_almacen
      LEFT JOIN USUARIO U ON U.id_usuario = SI.id_usuario
      ${where}
      ORDER BY SI.fecha_salida DESC, SI.id_salida_inventario DESC
    `);

    res.json(rows.recordset);
  } catch (err) {
    console.error("listOutbound:", err);
    res.status(500).json({ message: "Error al listar salidas" });
  }
};

// Exportar CSV de salidas
exports.exportOutbound = async (req, res) => {
  try {
    // Reutilizamos el mismo filtrado que listOutbound
    req.query = req.query || {};
    const pool = await require("../config/db.config").poolPromise;
    const request = pool.request();

    const { fechaInicio = "", fechaFin = "", search = "", almacen = "" } = req.query;
    const filtros = [];
    if (fechaInicio && fechaFin) {
      filtros.push(`CAST(SI.fecha_salida AS DATE) BETWEEN @fi AND @ff`);
      request.input("fi", require("../config/db.config").sql.Date, fechaInicio);
      request.input("ff", require("../config/db.config").sql.Date, fechaFin);
    } else if (fechaInicio) {
      filtros.push(`CAST(SI.fecha_salida AS DATE) >= @fi`);
      request.input("fi", require("../config/db.config").sql.Date, fechaInicio);
    } else if (fechaFin) {
      filtros.push(`CAST(SI.fecha_salida AS DATE) <= @ff`);
      request.input("ff", require("../config/db.config").sql.Date, fechaFin);
    }
    if (search) {
      filtros.push(`(P.nombre_producto LIKE @q OR SI.motivo_salida LIKE @q OR (U.nombre + ' ' + U.apellido) LIKE @q)`);
      request.input("q", require("../config/db.config").sql.VarChar(120), `%${search}%`);
    }
    if (almacen) {
      filtros.push(`I.id_almacen = @almacen`);
      request.input("almacen", require("../config/db.config").sql.Int, Number(almacen));
    }
    const where = filtros.length ? "WHERE " + filtros.join(" AND ") : "";

    const rs = await request.query(`
      SELECT
        ((CAST(SI.fecha_salida AS datetime2) AT TIME ZONE 'SA Pacific Standard Time') AT TIME ZONE 'UTC') AS fecha_salida_utc,
        P.nombre_producto AS producto,
        SI.cantidad_salida AS cantidad,
        SI.motivo_salida   AS motivo,
        A.nombre_almacen   AS almacen,
        COALESCE(U.nombre + ' ' + U.apellido, '-') AS responsable
      FROM SALIDA_INVENTARIO SI
      JOIN INVENTARIO I ON I.id_inventario = SI.id_inventario
      JOIN PRODUCTO  P ON P.id_producto   = I.id_producto
      JOIN ALMACEN   A ON A.id_almacen    = I.id_almacen
      LEFT JOIN USUARIO U ON U.id_usuario = SI.id_usuario
      ${where}
      ORDER BY SI.fecha_salida DESC, SI.id_salida_inventario DESC
    `);

    let csv = "Fecha/Hora,Producto,Cantidad,Motivo,Almacén,Responsable\n";
    for (const r of rs.recordset) {
      // Ya formateado a Lima (humano)
      const fecha = new Date(r.fecha_salida_utc).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        hour12: false,
      });
      
      const row = [
        `"${fecha}"`,
        `"${r.producto.replace(/"/g, '""')}"`,
        r.cantidad,
        `"${(r.motivo || "").replace(/"/g, '""')}"`,
        `"${r.almacen.replace(/"/g, '""')}"`,
        `"${(r.responsable || "-").replace(/"/g, '""')}"`,
      ].join(",");
      csv += row + "\n";
    }

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment("salidas.csv");
    res.send(csv);
  } catch (err) {
    console.error("exportOutbound:", err);
    res.status(500).json({ message: "Error al exportar salidas" });
  }
};
