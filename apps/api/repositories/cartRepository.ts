const { poolPromise } = require("../config/db.config");

async function getCartItemsByUserId(userId) {
  const pool = await poolPromise;
  const { rows } = await pool.query(
    `
      SELECT
        c.id_carrito,
        c.id_producto,
        c.cantidad,
        p.nombre_producto,
        p.descripcion AS descripcion,
        p.precio,
        p.imagen
      FROM carrito c
      INNER JOIN producto p ON p.id_producto = c.id_producto
      WHERE c.id_usuario = $1
      ORDER BY c.id_carrito DESC
    `,
    [userId],
  );

  return rows;
}

async function cartItemExists(userId, productId) {
  const pool = await poolPromise;
  const existing = await pool.query(
    `
      SELECT 1 FROM carrito
      WHERE id_usuario = $1 AND id_producto = $2
    `,
    [userId, productId],
  );

  return existing.rows.length > 0;
}

async function getCartItemQuantity(userId, productId) {
  const pool = await poolPromise;
  const rs = await pool.query(
    `
      SELECT cantidad
      FROM carrito
      WHERE id_usuario = $1 AND id_producto = $2
    `,
    [userId, productId],
  );
  return Number(rs.rows?.[0]?.cantidad || 0);
}

async function incrementCartItem(userId, productId, quantity) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE carrito
      SET cantidad = cantidad + $3
      WHERE id_usuario = $1 AND id_producto = $2
    `,
    [userId, productId, quantity],
  );
}

async function insertCartItem(userId, productId, quantity) {
  const pool = await poolPromise;
  await pool.query(
    `
      INSERT INTO carrito (id_usuario, id_producto, cantidad)
      VALUES ($1, $2, $3)
    `,
    [userId, productId, quantity],
  );
}

async function deleteCartItemByProduct(userId, productId) {
  const pool = await poolPromise;
  await pool.query(
    `
      DELETE FROM carrito
      WHERE id_usuario = $1 AND id_producto = $2
    `,
    [userId, productId],
  );
}

async function updateCartItemQuantity(userId, productId, quantity) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE carrito
      SET cantidad = $3
      WHERE id_usuario = $1 AND id_producto = $2
    `,
    [userId, productId, quantity],
  );
}

async function clearCart(userId) {
  const pool = await poolPromise;
  await pool.query("DELETE FROM carrito WHERE id_usuario = $1", [userId]);
}

async function deleteCartItemById(userId, cartId) {
  const pool = await poolPromise;
  await pool.query(
    `
      DELETE FROM carrito
      WHERE id_carrito = $1 AND id_usuario = $2
    `,
    [cartId, userId],
  );
}

async function getCartCount(userId) {
  const pool = await poolPromise;
  const { rows } = await pool.query(
    `
      SELECT COALESCE(SUM(cantidad), 0) AS total
      FROM carrito
      WHERE id_usuario = $1
    `,
    [userId],
  );

  return Number(rows[0]?.total || 0);
}

module.exports = {
  getCartItemsByUserId,
  cartItemExists,
  getCartItemQuantity,
  incrementCartItem,
  insertCartItem,
  deleteCartItemByProduct,
  updateCartItemQuantity,
  clearCart,
  deleteCartItemById,
  getCartCount,
};

export {};
