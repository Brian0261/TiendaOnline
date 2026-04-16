// __tests__/unit/authorizeRoles.test.ts
// U5 — Autorización por roles (middleware)
// Prueba que authorizeRoles permita o deniegue acceso según el rol del usuario,
// usando objetos req/res/next simulados (sin Express).

jest.mock("../../config/auth.config", () => ({
  JWT_SECRET: "test_secret",
}));

jest.mock("../../repositories/authRepository", () => ({
  getUserStatusById: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

const { authorizeRoles } = require("../../middlewares/authMiddleware");

function createMockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("Pruebas Unitarias - Middleware authorizeRoles", () => {
  test("Permite acceso cuando el rol del usuario está en la lista permitida", () => {
    const req: any = { user: { id_usuario: 1, rol: "ADMINISTRADOR" } };
    const res = createMockRes();
    const next = jest.fn();

    const middleware = authorizeRoles("ADMINISTRADOR");
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("Deniega acceso (403) cuando el rol no está en la lista permitida", () => {
    const req: any = { user: { id_usuario: 2, rol: "CLIENTE" } };
    const res = createMockRes();
    const next = jest.fn();

    const middleware = authorizeRoles("ADMINISTRADOR");
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("No tienes permisos") }));
  });

  test("Permite acceso cuando hay múltiples roles y el usuario coincide con uno", () => {
    const req: any = { user: { id_usuario: 3, rol: "EMPLEADO" } };
    const res = createMockRes();
    const next = jest.fn();

    const middleware = authorizeRoles("EMPLEADO", "ADMINISTRADOR");
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("Deniega acceso (403) cuando req.user no existe", () => {
    const req: any = {};
    const res = createMockRes();
    const next = jest.fn();

    const middleware = authorizeRoles("REPARTIDOR");
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

export {};
