// __tests__/integration/cartStock.test.ts
// I2 — Validación de stock al agregar al carrito
// Prueba que POST /api/cart/add rechace cantidades que excedan stock disponible.

const request = require("supertest");

// ── Mock de db.config con stock controlado ─────────────────────
jest.mock("../../config/db.config", () => {
  const STOCK_TOTAL = 10;
  const RESERVADO = 0;

  const mPool = {
    query: jest.fn(async (sqlText: string, _params: any[] = []) => {
      const q = String(sqlText || "").toLowerCase();

      // getAvailableStockByProductId — stock total
      if (q.includes("sum(i.cantidad_disponible)") && q.includes("from inventario")) {
        return { rows: [{ stock_total: STOCK_TOTAL }] };
      }

      // getAvailableStockByProductId — reservas activas
      if (q.includes("from reserva_stock_item") && q.includes("rs.estado = 'activa'")) {
        return { rows: [{ reservado: RESERVADO }] };
      }

      // getCartItemQuantity — cantidad actual en carrito (0 = carrito vacío)
      if (q.includes("select") && q.includes("cantidad") && q.includes("carrito") && q.includes("id_producto")) {
        return { rows: [{ cantidad: 0 }] };
      }

      // cartItemExists
      if (q.includes("select 1") && q.includes("carrito")) {
        return { rows: [] };
      }

      // insertCartItem
      if (q.includes("insert into carrito")) {
        return { rows: [] };
      }

      return { rows: [] };
    }),
  };
  return { poolPromise: Promise.resolve(mPool) };
});

// ── Mock de authMiddleware (inyecta usuario CLIENTE) ───────────
jest.mock("../../middlewares/authMiddleware", () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id_usuario: 1, rol: "CLIENTE" };
    req.userId = 1;
    next();
  },
  optionalAuthenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id_usuario: 1, rol: "CLIENTE" };
    next();
  },
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

// ── Mock rate limiters (passthrough) ───────────────────────────
jest.mock("../../middlewares/rateLimiters", () => {
  const pass = (_r: any, _s: any, n: any) => n();
  return {
    createLoginLimiter: () => pass,
    createRegisterLimiter: () => pass,
    createForgotPasswordLimiter: () => pass,
    createResetPasswordLimiter: () => pass,
  };
});

jest.mock("../../middlewares/bruteforceProtection", () => ({
  checkLoginLock: (_r: any, _s: any, n: any) => n(),
  onLoginSuccess: jest.fn(),
  onLoginFailure: jest.fn(),
}));

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async () => ({ messageId: "mock" })),
  })),
}));

const app = require("../../server");

// ── Tests ──────────────────────────────────────────────────────
describe("Pruebas de Integración - Validación de stock en carrito", () => {
  test("Agregar cantidad dentro del stock disponible devuelve 200", async () => {
    const res = await request(app).post("/api/cart/add").send({ id_producto: 1, cantidad: 5 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("Agregar cantidad que excede stock devuelve 409 con detalle", async () => {
    const res = await request(app).post("/api/cart/add").send({ id_producto: 1, cantidad: 15 });

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || "")).toMatch(/stock insuficiente/i);
    expect(res.body.detail).toBeDefined();
    expect(res.body.detail.disponible).toBe(10);
    expect(res.body.detail.solicitado).toBe(15);
  });

  test("Agregar producto con datos faltantes devuelve 400", async () => {
    const res = await request(app).post("/api/cart/add").send({ id_producto: 1 }); // sin cantidad

    expect(res.statusCode).toBe(400);
  });
});

export {};
