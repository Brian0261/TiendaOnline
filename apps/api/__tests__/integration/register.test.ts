// __tests__/integration/register.test.ts
// I5 — Registro con datos inválidos
// Prueba POST /api/auth/register con distintas combinaciones de datos inválidos
// y un caso de registro exitoso.

const request = require("supertest");

// ── Estado mock de BD ──────────────────────────────────────────
const mockRegisteredEmails = new Set<string>();
let mockLastInsertedUser: any = null;

// ── Mock de nodemailer ─────────────────────────────────────────
const mockSentMails: any[] = [];
jest.mock("nodemailer", () => {
  const sendMail = jest.fn(async (payload: any) => {
    mockSentMails.push(payload);
    return { messageId: "mock" };
  });
  return {
    createTransport: jest.fn(() => ({ sendMail })),
  };
});

// ── Mock de db.config ──────────────────────────────────────────
jest.mock("../../config/db.config", () => {
  let userIdSeq = 100;

  const mPool = {
    query: jest.fn(async (sqlText: string, params: any[] = []) => {
      const q = String(sqlText || "").toLowerCase();

      // information_schema (estado column)
      if (q.includes("information_schema")) {
        return { rows: [{ has_estado: true, column_name: "estado" }] };
      }

      // userExistsByEmail
      if (q.includes("select 1 from usuario where email")) {
        const email = String(params[0] || "").toLowerCase();
        return { rows: mockRegisteredEmails.has(email) ? [{ "1": 1 }] : [] };
      }

      // createUser (INSERT INTO usuario)
      if (q.includes("insert into usuario")) {
        const email = String(params[2] || "").toLowerCase();
        mockRegisteredEmails.add(email);
        userIdSeq++;
        mockLastInsertedUser = {
          id_usuario: userIdSeq,
          nombre: params[0],
          apellido: params[1],
          email,
          contrasena: params[3],
          telefono: params[4],
          direccion_principal: params[5],
          rol: "CLIENTE",
          estado: "ACTIVO",
          email_verificado: false,
        };
        return { rows: [] };
      }

      // findUserByEmail (SELECT * FROM usuario WHERE email)
      if (q.includes("select") && q.includes("from usuario") && q.includes("email = $1")) {
        const email = String(params[0] || "").toLowerCase();
        if (mockRegisteredEmails.has(email) && mockLastInsertedUser?.email === email) {
          return { rows: [{ ...mockLastInsertedUser }] };
        }
        return { rows: [] };
      }

      // securityTokenRepository: createEmailVerificationToken
      if (q.includes("insert into") && (q.includes("email_verification_token") || q.includes("security_token"))) {
        return { rows: [] };
      }

      // Invalidate tokens
      if (q.includes("update") && q.includes("token")) {
        return { rows: [] };
      }

      return { rows: [] };
    }),
  };
  return { poolPromise: Promise.resolve(mPool) };
});

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

// ── Mock authMiddleware (para rutas no testeadas aquí) ─────────
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

// Helper: genera un form_started_at válido (>2s de antigüedad)
function validFormStart() {
  return Date.now() - 5000;
}

// ── Tests ──────────────────────────────────────────────────────
describe("Pruebas de Integración - Registro con datos inválidos", () => {
  beforeEach(() => {
    mockRegisteredEmails.clear();
    mockLastInsertedUser = null;
    mockSentMails.length = 0;
  });

  test("Registro sin email devuelve 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      nombre: "Test",
      apellido: "User",
      password: "Password1",
      form_started_at: validFormStart(),
    });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message || "")).toMatch(/campos obligatorios/i);
  });

  test("Registro con contraseña débil devuelve 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      nombre: "Test",
      apellido: "User",
      email: "nuevo@email.com",
      password: "1234",
      form_started_at: validFormStart(),
    });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message || "")).toMatch(/mínimo 8 caracteres/i);
  });

  test("Registro sin nombre devuelve 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      apellido: "User",
      email: "nuevo@email.com",
      password: "Password1",
      form_started_at: validFormStart(),
    });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message || "")).toMatch(/campos obligatorios/i);
  });

  test("Registro exitoso con datos válidos devuelve 201", async () => {
    const res = await request(app).post("/api/auth/register").send({
      nombre: "Nuevo",
      apellido: "Cliente",
      email: "nuevocliente@email.com",
      password: "Password1",
      form_started_at: validFormStart(),
    });

    expect(res.statusCode).toBe(201);
    expect(String(res.body.message || "")).toMatch(/registro exitoso/i);
  });

  test("Registro con email duplicado devuelve 409", async () => {
    // Primero registramos un usuario
    mockRegisteredEmails.add("duplicado@email.com");

    const res = await request(app).post("/api/auth/register").send({
      nombre: "Otro",
      apellido: "Usuario",
      email: "duplicado@email.com",
      password: "Password1",
      form_started_at: validFormStart(),
    });

    expect(res.statusCode).toBe(409);
    expect(String(res.body.message || "")).toMatch(/ya registrado/i);
  });
});

export {};
