// __tests__/integration/protectedRoute.test.ts
// I3 — Protección de ruta privada
// Prueba que GET /api/cart requiera JWT válido (middleware authenticateToken REAL).
// Sin token → 401, token malformado → 401, usuario inactivo → 403, token válido → 200.

const request = require("supertest");
const jwt = require("jsonwebtoken");

// ── Estado mock de BD ──────────────────────────────────────────
const mockUsers = new Map<number, any>();

function seedUsers() {
  mockUsers.clear();
  mockUsers.set(1, { id_usuario: 1, rol: "CLIENTE", estado: "ACTIVO" });
  mockUsers.set(2, { id_usuario: 2, rol: "CLIENTE", estado: "INACTIVO" });
}

// ── Mock de db.config ──────────────────────────────────────────
jest.mock("../../config/db.config", () => {
  const mPool = {
    query: jest.fn(async (sqlText: string, params: any[] = []) => {
      const q = String(sqlText || "").toLowerCase();

      // getUserStatusById (usado por authenticateToken)
      if (q.includes("select") && q.includes("from usuario") && q.includes("id_usuario = $1")) {
        const id = Number(params[0]);
        const user = mockUsers.get(id);
        return { rows: user ? [{ ...user }] : [] };
      }

      // information_schema (detección de columna estado)
      if (q.includes("information_schema")) {
        return { rows: [{ column_name: "estado" }] };
      }

      // getCartItemsByUserId (respuesta vacía para simplificar)
      if (q.includes("from carrito") || q.includes("from cart")) {
        return { rows: [] };
      }

      // Stock / inventario
      if (q.includes("from inventario") || q.includes("from reserva_stock_item")) {
        return { rows: [{ stock_total: 0, reservado: 0 }] };
      }

      return { rows: [] };
    }),
  };
  return { poolPromise: Promise.resolve(mPool) };
});

// ── Mock rate limiters (passthrough) ───────────────────────────
jest.mock("../../middlewares/rateLimiters", () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return {
    createLoginLimiter: () => pass,
    createRegisterLimiter: () => pass,
    createForgotPasswordLimiter: () => pass,
    createResetPasswordLimiter: () => pass,
  };
});

// ── Mock brute force (passthrough) ─────────────────────────────
jest.mock("../../middlewares/bruteforceProtection", () => ({
  checkLoginLock: (_req: any, _res: any, next: any) => next(),
  onLoginSuccess: jest.fn(),
  onLoginFailure: jest.fn(),
}));

// ── NO mockeamos authMiddleware: queremos probar el middleware REAL ──

// ── Mock de nodemailer ─────────────────────────────────────────
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async () => ({ messageId: "mock" })),
  })),
}));

const app = require("../../server");

// Usar el mismo secreto que auth.config carga (respeta .env local)
const { JWT_SECRET } = require("../../config/auth.config");

// ── Tests ──────────────────────────────────────────────────────
describe("Pruebas de Integración - Protección de ruta privada", () => {
  beforeAll(() => {
    seedUsers();
  });

  test("Sin header Authorization devuelve 401", async () => {
    const res = await request(app).get("/api/cart");

    expect(res.statusCode).toBe(401);
    expect(String(res.body.message || "")).toMatch(/token no proporcionado/i);
  });

  test("Con token malformado devuelve 401", async () => {
    const res = await request(app).get("/api/cart").set("Authorization", "Bearer tokeninvalidoxyz");

    expect(res.statusCode).toBe(401);
    expect(String(res.body.message || "")).toMatch(/token inválido o expirado/i);
  });

  test("Con token válido pero usuario inactivo devuelve 403", async () => {
    const token = jwt.sign({ id_usuario: 2, rol: "CLIENTE" }, JWT_SECRET, { expiresIn: "5m" });

    const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(String(res.body.message || "")).toMatch(/inactiva/i);
  });

  test("Con token válido y usuario activo devuelve 200", async () => {
    const token = jwt.sign({ id_usuario: 1, rol: "CLIENTE" }, JWT_SECRET, { expiresIn: "5m" });

    const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
  });
});

export {};
