const request = require("supertest");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const mockSentMails = [];

jest.mock("nodemailer", () => {
  const sendMail = jest.fn(async payload => {
    mockSentMails.push(payload);
    return { messageId: "msg-test" };
  });

  return {
    createTransport: jest.fn(() => ({ sendMail })),
    __reset: () => {
      mockSentMails.length = 0;
      sendMail.mockClear();
    },
  };
});

const mockDbState = {
  usersByEmail: new Map(),
  usersById: new Map(),
  passwordResetTokens: [],
};

function resetDbState() {
  mockDbState.usersByEmail.clear();
  mockDbState.usersById.clear();
  mockDbState.passwordResetTokens = [];

  const baseUser = {
    id_usuario: 1,
    nombre: "Cliente",
    apellido: "Demo",
    email: "cli@email.com",
    contrasena: "Password1",
    rol: "CLIENTE",
    email_verificado: true,
    estado: "ACTIVO",
  };

  mockDbState.usersByEmail.set(baseUser.email, { ...baseUser });
  mockDbState.usersById.set(baseUser.id_usuario, { ...baseUser });
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

jest.mock("../../config/db.config", () => {
  const mPool = {
    query: jest.fn(async (sqlText, params = []) => {
      const query = String(sqlText || "").toLowerCase();

      if (query.includes("select * from usuario where email = $1")) {
        const email = String(params[0] || "").toLowerCase();
        const user = mockDbState.usersByEmail.get(email);
        return { rows: user ? [{ ...user }] : [] };
      }

      if (query.includes("update password_reset_token") && query.includes("where id_usuario = $1")) {
        const userId = Number(params[0]);
        const now = Date.now();
        mockDbState.passwordResetTokens = mockDbState.passwordResetTokens.map(row => {
          if (row.id_usuario === userId && !row.used_at && row.expires_at.getTime() > now) {
            return { ...row, used_at: new Date(now) };
          }
          return row;
        });
        return { rows: [] };
      }

      if (query.includes("insert into password_reset_token")) {
        mockDbState.passwordResetTokens.push({
          id_usuario: Number(params[0]),
          token_hash: String(params[1]),
          expires_at: new Date(params[2]),
          used_at: null,
        });
        return { rows: [] };
      }

      return { rows: [] };
    }),
    connect: jest.fn(async () => {
      return {
        query: async (sqlText, params = []) => {
          const query = String(sqlText || "").toLowerCase();

          if (query.includes("begin") || query.includes("commit") || query.includes("rollback")) {
            return { rows: [] };
          }

          if (query.includes("update password_reset_token") && query.includes("where token_hash = $1")) {
            const tokenHash = String(params[0] || "");
            const now = Date.now();
            const tokenRow = mockDbState.passwordResetTokens.find(
              row => row.token_hash === tokenHash && row.used_at == null && row.expires_at.getTime() > now,
            );
            if (!tokenRow) return { rows: [] };
            tokenRow.used_at = new Date(now);
            return { rows: [{ id_usuario: tokenRow.id_usuario }] };
          }

          if (query.includes("update usuario") && query.includes("set contrasena = $2")) {
            const userId = Number(params[0]);
            const newHash = String(params[1]);
            const user = mockDbState.usersById.get(userId);
            if (!user) return { rows: [] };
            const nextUser = { ...user, contrasena: newHash };
            mockDbState.usersById.set(userId, nextUser);
            mockDbState.usersByEmail.set(nextUser.email, nextUser);
            return { rows: [] };
          }

          return { rows: [] };
        },
        release: () => {},
      };
    }),
  };

  return {
    poolPromise: Promise.resolve(mPool),
  };
});

jest.mock("../../middlewares/authMiddleware", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id_usuario: 1, rol: "CLIENTE" };
    next();
  },
  optionalAuthenticateToken: (req, _res, next) => {
    req.user = { id_usuario: 1, rol: "CLIENTE" };
    next();
  },
  authorizeRoles: () => (_req, _res, next) => next(),
}));

const app = require("../../server");

describe("Pruebas de Integración - Auth recuperación de contraseña", () => {
  beforeEach(() => {
    resetDbState();
    const nodemailer = require("nodemailer");
    nodemailer.__reset();

    process.env.NODE_ENV = "test";
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_REQUIRE_AUTH = "false";
    process.env.WEB_BASE_URL = "http://localhost:8080";
    process.env.PASSWORD_RESET_TTL_MINUTES = "60";
    process.env.DEV_EMAIL_LINKS = "1";
  });

  test("POST /api/auth/login/customer permite login aunque email no esté verificado", async () => {
    const currentUser = mockDbState.usersByEmail.get("cli@email.com");
    const unverifiedUser = {
      ...currentUser,
      email_verificado: false,
    };

    mockDbState.usersByEmail.set("cli@email.com", unverifiedUser);
    mockDbState.usersById.set(1, unverifiedUser);

    const response = await request(app).post("/api/auth/login/customer").send({ email: "cli@email.com", password: "Password1" });

    expect(response.statusCode).toBe(200);
    expect(String(response.body?.message || "")).toMatch(/inicio de sesión exitoso/i);
  });

  test("POST /api/auth/forgot-password retorna mensaje genérico y envía correo si existe", async () => {
    const response = await request(app).post("/api/auth/forgot-password").send({ email: "cli@email.com" });

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toMatch(/si el correo existe/i);
    expect(mockSentMails.length).toBe(1);
    expect(String(mockSentMails[0].to || "").toLowerCase()).toBe("cli@email.com");
    expect(String(mockSentMails[0].html || "")).toMatch(/reset-password\?token=/i);
  });

  test("POST /api/auth/forgot-password no enumera usuarios inexistentes", async () => {
    const response = await request(app).post("/api/auth/forgot-password").send({ email: "noexiste@email.com" });

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toMatch(/si el correo existe/i);
    expect(mockSentMails.length).toBe(0);
  });

  test("POST /api/auth/forgot-password usa URL de staging cuando WEB_BASE_URL apunta a staging", async () => {
    process.env.WEB_BASE_URL = "https://staging.tiendaonline.example";

    const response = await request(app).post("/api/auth/forgot-password").send({ email: "cli@email.com" });

    expect(response.statusCode).toBe(200);
    expect(mockSentMails.length).toBe(1);
    expect(String(mockSentMails[0].html || "")).toMatch(/https:\/\/staging\.tiendaonline\.example\/reset-password\?token=/i);
  });

  test("POST /api/auth/reset-password consume token una sola vez y permite login con nueva contraseña", async () => {
    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: "cli@email.com" });
    expect(forgot.statusCode).toBe(200);
    expect(mockSentMails.length).toBe(1);

    const html = String(mockSentMails[0].html || "");
    const match = html.match(/reset-password\?token=([a-f0-9]+)/i);
    expect(match).not.toBeNull();

    const token = match?.[1] || "";
    const newPassword = "NuevaPass9";

    const resetOk = await request(app).post("/api/auth/reset-password").send({ token, newPassword });
    expect(resetOk.statusCode).toBe(200);

    const resetAgain = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "OtraPass9" });
    expect(resetAgain.statusCode).toBe(400);
    expect(String(resetAgain.body?.message || "")).toMatch(/token inválido o expirado/i);

    const login = await request(app).post("/api/auth/login/customer").send({ email: "cli@email.com", password: newPassword });
    expect(login.statusCode).toBe(200);
    expect(String(login.body?.message || "")).toMatch(/inicio de sesión exitoso/i);
  });

  test("POST /api/auth/reset-password rechaza contraseña débil", async () => {
    const response = await request(app).post("/api/auth/reset-password").send({
      token: "abc",
      newPassword: "debil",
    });

    expect(response.statusCode).toBe(400);
    expect(String(response.body?.message || "")).toMatch(/mínimo 8 caracteres/i);
  });

  test("POST /api/auth/reset-password rechaza token inválido", async () => {
    const response = await request(app).post("/api/auth/reset-password").send({
      token: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      newPassword: "ValidaPass9",
    });

    expect(response.statusCode).toBe(400);
    expect(String(response.body?.message || "")).toMatch(/token inválido o expirado/i);
  });

  test("POST /api/auth/reset-password rechaza token expirado", async () => {
    const expiredToken = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    mockDbState.passwordResetTokens.push({
      id_usuario: 1,
      token_hash: sha256Hex(expiredToken),
      expires_at: new Date(Date.now() - 60_000),
      used_at: null,
    });

    const response = await request(app).post("/api/auth/reset-password").send({
      token: expiredToken,
      newPassword: "ValidaPass9",
    });

    expect(response.statusCode).toBe(400);
    expect(String(response.body?.message || "")).toMatch(/token inválido o expirado/i);
  });

  test("POST /api/auth/forgot-password aplica rate limiting dedicado", async () => {
    let lastStatus = 200;
    for (let i = 0; i < 9; i += 1) {
      const response = await request(app).post("/api/auth/forgot-password").send({ email: "cli@email.com" });
      lastStatus = response.statusCode;
    }

    expect(lastStatus).toBe(429);
  });
});

export {};
