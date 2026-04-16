// __tests__/unit/cartValidation.test.ts
// U2 — Validación de cantidad en el carrito
// Prueba que addToCart rechace cantidades inválidas (negativas, decimales, cero)
// y acepte cantidades válidas cuando hay stock suficiente.

jest.mock("../../repositories/cartRepository", () => ({
  getCartItemQuantity: jest.fn(async () => 0),
  cartItemExists: jest.fn(async () => false),
  insertCartItem: jest.fn(async () => {}),
  incrementCartItem: jest.fn(async () => {}),
}));

jest.mock("../../repositories/inventoryRepository", () => ({
  getAvailableStockByProductId: jest.fn(async () => ({
    stockTotal: 100,
    reservado: 0,
    disponible: 100,
  })),
}));

jest.mock("../../shared/image", () => ({
  normalizeImageUrl: jest.fn((raw: unknown) => raw || "/placeholder.png"),
}));

const { addToCart } = require("../../services/cartService");

describe("Pruebas Unitarias - Validación de cantidad en carrito", () => {
  const userId = 1;
  const id_producto = 101;

  test("Rechaza cantidad negativa con error 400", async () => {
    await expect(addToCart(userId, { id_producto, cantidad: -1 })).rejects.toMatchObject({
      message: "Cantidad inválida",
      status: 400,
    });
  });

  test("Rechaza cantidad cero con error 400", async () => {
    await expect(addToCart(userId, { id_producto, cantidad: 0 })).rejects.toMatchObject({
      message: "Cantidad inválida",
      status: 400,
    });
  });

  test("Rechaza cantidad decimal con error 400", async () => {
    await expect(addToCart(userId, { id_producto, cantidad: 2.5 })).rejects.toMatchObject({
      message: "Cantidad inválida",
      status: 400,
    });
  });

  test("Rechaza cantidad no numérica con error 400", async () => {
    await expect(addToCart(userId, { id_producto, cantidad: "abc" })).rejects.toMatchObject({
      message: "Cantidad inválida",
      status: 400,
    });
  });

  test("Acepta cantidad entera positiva con stock suficiente", async () => {
    const result = await addToCart(userId, { id_producto, cantidad: 1 });
    expect(result.success).toBe(true);
  });

  test("Acepta cantidad grande cuando hay stock disponible", async () => {
    const result = await addToCart(userId, { id_producto, cantidad: 50 });
    expect(result.success).toBe(true);
  });
});

export {};
