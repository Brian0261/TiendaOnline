const cartRepository = require("../repositories/cartRepository");
const inventoryRepository = require("../repositories/inventoryRepository");
const { normalizeImageUrl } = require("../shared/image");

function mapCartItemRow(row) {
  return {
    ...row,
    imagen: normalizeImageUrl(row.imagen),
  };
}

async function getCartByUserId(userId) {
  const items = await cartRepository.getCartItemsByUserId(userId);
  return { success: true, items: items.map(mapCartItemRow) };
}

async function addToCart(userId, { id_producto, cantidad }) {
  const qtyToAdd = Number(cantidad);
  if (!Number.isInteger(qtyToAdd) || qtyToAdd <= 0) {
    const err = new Error("Cantidad inválida");
    (err as any).status = 400;
    throw err;
  }

  const currentQty = await cartRepository.getCartItemQuantity(userId, id_producto);
  const nextQty = Number(currentQty || 0) + qtyToAdd;
  const { disponible } = await inventoryRepository.getAvailableStockByProductId(id_producto);
  if (nextQty > disponible) {
    const err = new Error("Stock insuficiente");
    (err as any).status = 409;
    (err as any).detail = { id_producto, solicitado: nextQty, disponible };
    throw err;
  }

  const exists = await cartRepository.cartItemExists(userId, id_producto);
  if (exists) {
    await cartRepository.incrementCartItem(userId, id_producto, cantidad);
  } else {
    await cartRepository.insertCartItem(userId, id_producto, cantidad);
  }
  return { success: true, message: "Producto agregado al carrito" };
}

async function updateCartItem(userId, { id_producto, cantidad }) {
  const nextQty = Number(cantidad);
  if (!Number.isInteger(nextQty) || nextQty < 0) {
    const err = new Error("Cantidad inválida");
    (err as any).status = 400;
    throw err;
  }

  if (cantidad === 0) {
    await cartRepository.deleteCartItemByProduct(userId, id_producto);
  } else {
    const { disponible } = await inventoryRepository.getAvailableStockByProductId(id_producto);
    if (nextQty > disponible) {
      const err = new Error("Stock insuficiente");
      (err as any).status = 409;
      (err as any).detail = { id_producto, solicitado: nextQty, disponible };
      throw err;
    }

    await cartRepository.updateCartItemQuantity(userId, id_producto, cantidad);
  }
  return { success: true, message: "Carrito actualizado correctamente" };
}

async function clearCart(userId) {
  await cartRepository.clearCart(userId);
  return { success: true, message: "Carrito vaciado correctamente" };
}

async function removeCartItem(userId, id_carrito) {
  await cartRepository.deleteCartItemById(userId, id_carrito);
  return { success: true, message: "Producto eliminado del carrito" };
}

async function getCartCount(userId) {
  const total = await cartRepository.getCartCount(userId);
  return { total };
}

module.exports = {
  getCartByUserId,
  addToCart,
  updateCartItem,
  clearCart,
  removeCartItem,
  getCartCount,
};

export {};
