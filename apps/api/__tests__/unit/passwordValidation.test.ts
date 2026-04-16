// __tests__/unit/passwordValidation.test.ts
// U1 — Validación de contraseña fuerte
// Prueba la función isStrongPassword de authService:
//   Requiere mínimo 8 caracteres, al menos 1 mayúscula y 1 dígito.

// Mockear db.config para evitar que authService dispare conexión real a PostgreSQL.
jest.mock("../../config/db.config", () => ({
  poolPromise: Promise.resolve({ query: jest.fn(async () => ({ rows: [] })) }),
}));

const { isStrongPassword } = require("../../services/authService");

describe("Pruebas Unitarias - Validación de contraseña fuerte", () => {
  test("Acepta contraseña válida con mayúscula, dígito y 8+ caracteres", () => {
    expect(isStrongPassword("Password1")).toBe(true);
  });

  test("Acepta contraseña larga con múltiples mayúsculas y dígitos", () => {
    expect(isStrongPassword("MiClave99Segura")).toBe(true);
  });

  test("Rechaza contraseña sin mayúscula", () => {
    expect(isStrongPassword("password1")).toBe(false);
  });

  test("Rechaza contraseña sin dígito", () => {
    expect(isStrongPassword("PASSWORD")).toBe(false);
  });

  test("Rechaza contraseña con menos de 8 caracteres", () => {
    expect(isStrongPassword("Pass1")).toBe(false);
  });

  test("Rechaza cadena vacía", () => {
    expect(isStrongPassword("")).toBe(false);
  });

  test("Rechaza null y undefined sin lanzar error", () => {
    expect(isStrongPassword(null)).toBe(false);
    expect(isStrongPassword(undefined)).toBe(false);
  });
});

export {};
