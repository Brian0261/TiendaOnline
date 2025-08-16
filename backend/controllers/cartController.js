// backend/controllers/cartController.js
// ──────────────────────────────────────
//  Controlador de carrito (HU5 – HU6)
//  Usa la conexión global poolPromise
// ──────────────────────────────────────

const { sql, poolPromise } = require("../config/db.config");

/* ───────── helpers internos ───────── */
// extrae el id según dónde lo hayas guardado en el middleware
const getUserId = req => req.userId || req.user?.id_usuario;

// ─────────────────────────────────────
//  Obtener productos del carrito (con imagen y descripción)
// ─────────────────────────────────────
exports.getCartByUserId = async (req, res) => {
  const userId = req.user?.id_usuario || req.userId;
  if (!userId) return res.status(401).json({ success: false, message: "No autenticado" });

  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input("u", sql.Int, userId)
      .query(`
        SELECT
          C.id_carrito,
          C.id_producto,
          C.cantidad,
          P.nombre_producto,
          CAST(P.descripcion AS NVARCHAR(MAX)) AS descripcion,
          P.precio,
          CASE WHEN LEFT(P.imagen, 1) = '/'
               THEN P.imagen
               ELSE '/' + P.imagen
          END AS imagen
        FROM CARRITO C
        INNER JOIN PRODUCTO P ON P.id_producto = C.id_producto
        WHERE C.id_usuario = @u
        ORDER BY C.id_carrito DESC
      `);

    // Formato amigable para el front
    return res.json({ success: true, items: recordset });
  } catch (err) {
    console.error("getCartByUserId error:", err);
    return res.status(500).json({ success: false, message: "No se pudo cargar el carrito" });
  }
};


/* ─────────────────────────────────────
   Agregar producto al carrito
───────────────────────────────────── */
exports.addToCart = async (req, res) => {
  const userId = getUserId(req);
  const { id_producto, cantidad } = req.body;

  if (!id_producto || !cantidad || cantidad <= 0) {
    return res.status(400).json({ success: false, message: "Datos inválidos" });
  }

  try {
    const pool = await poolPromise;

    // ¿ya existe?
    const existing = await pool.request().input("id_usuario", sql.Int, userId).input("id_producto", sql.Int, id_producto).query(`
        SELECT 1 FROM CARRITO
        WHERE id_usuario = @id_usuario AND id_producto = @id_producto
      `);

    if (existing.recordset.length) {
      // suma cantidades
      await pool.request().input("id_usuario", sql.Int, userId).input("id_producto", sql.Int, id_producto).input("cantidad", sql.Int, cantidad)
        .query(`
          UPDATE CARRITO
          SET cantidad = cantidad + @cantidad
          WHERE id_usuario = @id_usuario AND id_producto = @id_producto
        `);
    } else {
      // nuevo ítem
      await pool.request().input("id_usuario", sql.Int, userId).input("id_producto", sql.Int, id_producto).input("cantidad", sql.Int, cantidad)
        .query(`
          INSERT INTO CARRITO (id_usuario, id_producto, cantidad)
          VALUES (@id_usuario, @id_producto, @cantidad)
        `);
    }

    res.json({ success: true, message: "Producto agregado al carrito" });
  } catch (err) {
    console.error("Error al agregar al carrito:", err);
    res.status(500).json({ success: false, message: "Error al agregar al carrito" });
  }
};

/* ─────────────────────────────────────
   Actualizar cantidad / eliminar ítem
───────────────────────────────────── */
exports.updateCartItem = async (req, res) => {
  const userId = getUserId(req);
  const { id_producto, cantidad } = req.body;

  if (!id_producto || cantidad < 0) {
    return res.status(400).json({ success: false, message: "Datos inválidos" });
  }

  try {
    const pool = await poolPromise;

    if (cantidad === 0) {
      // delete
      await pool.request().input("id_usuario", sql.Int, userId).input("id_producto", sql.Int, id_producto).query(`
          DELETE FROM CARRITO
          WHERE id_usuario = @id_usuario AND id_producto = @id_producto
        `);
    } else {
      // update cantidad
      await pool.request().input("id_usuario", sql.Int, userId).input("id_producto", sql.Int, id_producto).input("cantidad", sql.Int, cantidad)
        .query(`
          UPDATE CARRITO
          SET cantidad = @cantidad
          WHERE id_usuario = @id_usuario AND id_producto = @id_producto
        `);
    }

    res.json({ success: true, message: "Carrito actualizado correctamente" });
  } catch (err) {
    console.error("Error al actualizar carrito:", err);
    res.status(500).json({ success: false, message: "Error al actualizar carrito" });
  }
};

/* ─────────────────────────────────────
   Vaciar carrito
───────────────────────────────────── */
exports.clearCart = async (req, res) => {
  const userId = getUserId(req);

  try {
    const pool = await poolPromise;
    await pool.request().input("id_usuario", sql.Int, userId).query(`
        DELETE FROM CARRITO WHERE id_usuario = @id_usuario
      `);

    res.json({ success: true, message: "Carrito vaciado correctamente" });
  } catch (err) {
    console.error("Error al vaciar carrito:", err);
    res.status(500).json({ success: false, message: "Error al vaciar carrito" });
  }
};

/* ─────────────────────────────────────
   Eliminar un ítem por id_carrito
───────────────────────────────────── */
exports.removeCartItem = async (req, res) => {
  const userId = getUserId(req);
  const { id_carrito } = req.params;

  try {
    const pool = await poolPromise;
    await pool.request().input("id_carrito", sql.Int, id_carrito).input("id_usuario", sql.Int, userId).query(`
        DELETE FROM CARRITO
        WHERE id_carrito = @id_carrito AND id_usuario = @id_usuario
      `);

    res.json({ success: true, message: "Producto eliminado del carrito" });
  } catch (err) {
    console.error("Error al eliminar del carrito:", err);
    res.status(500).json({ success: false, message: "Error al eliminar del carrito" });
  }
};

/* ─────────────────────────────────────
   Contador de productos en carrito
───────────────────────────────────── */
exports.getCartCount = async (req, res) => {
  const userId = getUserId(req);

  try {
    const pool = await poolPromise;
    const result = await pool.request().input("id_usuario", sql.Int, userId).query(`
        SELECT SUM(cantidad) AS total
        FROM CARRITO
        WHERE id_usuario = @id_usuario
      `);

    const total = result.recordset[0].total || 0;
    res.json({ success: true, total });
  } catch (err) {
    console.error("Error al obtener el conteo del carrito:", err);
    res.status(500).json({ success: false, message: "Error al obtener el conteo del carrito" });
  }
};

// === NUEVO: total de ítems en carrito del usuario logueado
exports.getCartCount = async (req, res) => {
  try {
    const userId = req.user?.id_usuario || req.userId;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const pool = await poolPromise;
    const { recordset } = await pool.request().input("u", sql.Int, userId).query(`
        SELECT COALESCE(SUM(cantidad), 0) AS total
        FROM CARRITO
        WHERE id_usuario = @u
      `);

    res.json({ total: Number(recordset[0]?.total || 0) });
  } catch (err) {
    console.error("getCartCount error:", err);
    res.status(500).json({ message: "No se pudo obtener el contador" });
  }
};
