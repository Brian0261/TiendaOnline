// __tests__/integration/login.test.ts
// I1 — Login completo (flujo HTTP end-to-end)
// Prueba POST /api/auth/login/customer y /api/auth/login/staff
// con mock de BD, rate limiters y brute force.

const request = require("supertest");
const bcrypt = require("bcryptjs");

// ── Estado mock de BD ──────────────────────────────────────────
const mockDbState = {
  usersByEmail: new Map<string, any>(),
  usersById: new Map<number, any>(),
};

async function seedUsers() {
  mockDbState.usersByEmail.clear();
  mockDbState.usersById.clear();

  const hash = await bcrypt.hash("Password1", 10);

  const clienteActivo = {
    id_usuario: 1,
    nombre: "Cliente",
    apellido: "Demo",
    email: "cliente@email.com",
    contrasena: hash,
    rol: "CLIENTE",
    email_verificado: true,
    estado: "ACTIVO",
  };

  const clienteInactivo = {
    id_usuario: 2,
    nombre: "Inactivo",
    apellido: "Demo",
    email: "inactivo@email.com",
    contrasena: hash,
    rol: "CLIENTE",
    email_verificado: true,
    estado: "INACTIVO",
  };

  const empleado = {
    id_usuario: 3,
    nombre: "Empleado",
    apellido: "Demo",
    email: "staff@email.com",
    contrasena: hash,
    rol: "EMPLEADO",
    email_verificado: true,
    estado: "ACTIVO",
  };

  for (const u of [clienteActivo, clienteInactivo, empleado]) {
    mockDbState.usersByEmail.set(u.email, { ...u });
    mockDbState.usersById.set(u.id_usuario, { ...u });
  }
}

// ── Mock de nodemailer (nunca envía correo real) ───────────────
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async () => ({ messageId: "mock" })),
  })),
}));

// ── Mock de db.config ──────────────────────────────────────────
jest.mock("../../config/db.config", () => {
  const mPool = {
    query: jest.fn(async (sqlText: string, params: any[] = []) => {
      const q = String(sqlText || "").toLowerCase();

      // findUserByEmail
      if (q.includes("select") && q.includes("from usuario") && q.includes("email = $1")) {
        const email = String(params[0] || "").toLowerCase();
        const user = mockDbState.usersByEmail.get(email);
        return { rows: user ? [{ ...user }] : [] };
      }

      // getUserStatusById
      if (q.includes("select") && q.includes("from usuario") && q.includes("id_usuario = $1") && (q.includes("estado") || q.includes("rol"))) {
        const id = Number(params[0]);
        const user = mockDbState.usersById.get(id);
        return { rows: user ? [{ id_usuario: user.id_usuario, rol: user.rol, estado: user.estado }] : [] };
      }

      // information_schema (hasEstadoColumn detection)
      if (q.includes("information_schema")) {
        return { rows: [{ column_name: "estado" }] };
      }

      // updateUserPasswordHashById (lazy migration)
      if (q.includes("update usuario") && q.includes("contrasena")) {
        return { rows: [] };
      }

      return { rows: [] };
    }),
  };
  return { poolPromise: Promise.resolve(mPool) };
});

// ── Mock de rate limiters (passthrough) ────────────────────────
jest.mock("../../middlewares/rateLimiters", () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return {
    createLoginLimiter: () => pass,
    createRegisterLimiter: () => pass,
    createForgotPasswordLimiter: () => pass,
    createResetPasswordLimiter: () => pass,
  };
});

// ── Mock de brute force (passthrough) ──────────────────────────
jest.mock("../../middlewares/bruteforceProtection", () => ({
  checkLoginLock: (_req: any, _res: any, next: any) => next(),
  onLoginSuccess: jest.fn(),
  onLoginFailure: jest.fn(),
}));

// ── Mock de authMiddleware (para rutas que no testeamos aquí) ──
jest.mock("../../middlewares/authMiddleware", () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id_usuario: 1, rol: "CLIENTE" };
    next();
  },
  optionalAuthenticateToken: (req: any, _res: any, next: any) => {
    req.user = null;
    next();
  },
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

const app = require("../../server");

// ── Tests ──────────────────────────────────────────────────────
describe("Pruebas de Integración - Login completo", () => {
  beforeAll(async () => {
    await seedUsers();
  });

  test("Login exitoso como cliente devuelve 200 y token", async () => {
    const res = await request(app).post("/api/auth/login/customer").send({ email: "cliente@email.com", password: "Password1" });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("cliente@email.com");
    expect(String(res.body.message || "")).toMatch(/inicio de sesión exitoso/i);
  });

  test("Login con contraseña incorrecta devuelve 401", async () => {
    const res = await request(app).post("/api/auth/login/customer").send({ email: "cliente@email.com", password: "WrongPass1" });

    expect(res.statusCode).toBe(401);
    expect(String(res.body.message || "")).toMatch(/credenciales incorrectas/i);
  });

  test("Login con email inexistente devuelve 401 (anti-enumeración)", async () => {
    const res = await request(app).post("/api/auth/login/customer").send({ email: "noexiste@email.com", password: "Password1" });

    expect(res.statusCode).toBe(401);
    expect(String(res.body.message || "")).toMatch(/credenciales incorrectas/i);
  });

  test("Login con cuenta inactiva devuelve 403", async () => {
    const res = await request(app).post("/api/auth/login/customer").send({ email: "inactivo@email.com", password: "Password1" });

    expect(res.statusCode).toBe(403);
    expect(String(res.body.message || "")).toMatch(/inactiva/i);
  });

  test("Cliente en /login/staff devuelve 403 (rol no autorizado)", async () => {
    const res = await request(app).post("/api/auth/login/staff").send({ email: "cliente@email.com", password: "Password1" });

    expect(res.statusCode).toBe(403);
    expect(String(res.body.message || "")).toMatch(/clientes|personal/i);
  });
});

export {};
