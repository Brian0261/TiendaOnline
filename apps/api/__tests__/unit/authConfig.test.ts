// __tests__/unit/authConfig.test.ts
// U4 — Configuración JWT según entorno
// Verifica que en producción/staging se exijan secretos reales
// y que en dev/test se usen fallbacks sin error.

// Mockear dotenv para que no cargue valores del archivo .env real.
jest.mock("dotenv", () => ({ config: jest.fn() }));

describe("Pruebas Unitarias - Configuración JWT por entorno", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Limpiar cualquier secreto que venga del .env real
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("En NODE_ENV=test usa fallback 'dev_secret' sin lanzar error", () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    const config = require("../../config/auth.config");
    expect(config.JWT_SECRET).toBe("dev_secret");
    expect(config.JWT_REFRESH_SECRET).toBe("dev_refresh_secret");
  });

  test("En NODE_ENV=production sin JWT_SECRET lanza error", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = "real_refresh_secret";

    expect(() => require("../../config/auth.config")).toThrow("JWT_SECRET es obligatorio en staging/producción");
  });

  test("En NODE_ENV=production con JWT_SECRET de solo espacios lanza error", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "   ";
    process.env.JWT_REFRESH_SECRET = "real_refresh_secret";

    expect(() => require("../../config/auth.config")).toThrow("JWT_SECRET es obligatorio en staging/producción");
  });

  test("En NODE_ENV=staging sin JWT_REFRESH_SECRET lanza error", () => {
    process.env.NODE_ENV = "staging";
    process.env.JWT_SECRET = "real_secret";
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => require("../../config/auth.config")).toThrow("JWT_REFRESH_SECRET es obligatorio en staging/producción");
  });

  test("En NODE_ENV=production con ambos secretos válidos no lanza error", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "super_secure_secret_123";
    process.env.JWT_REFRESH_SECRET = "super_secure_refresh_456";

    const config = require("../../config/auth.config");
    expect(config.JWT_SECRET).toBe("super_secure_secret_123");
    expect(config.JWT_REFRESH_SECRET).toBe("super_secure_refresh_456");
  });
});

export {};
