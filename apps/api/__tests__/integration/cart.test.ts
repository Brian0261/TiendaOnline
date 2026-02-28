// backend/__tests__/integration/cart.test.js
const request = require("supertest");
const app = require("../../server"); // Importamos tu app express

// MOCK de la Base de Datos
// Esto intercepta las llamadas a la BD para que no fallen ni guarden datos reales
jest.mock("../../config/db.config", () => {
  const mPool = {
    query: jest.fn().mockImplementation(async (sqlText, _params) => {
      const q = String(sqlText || "").toLowerCase();
      // Stock total (inventario)
      if (q.includes("sum(i.cantidad_disponible)") && q.includes("from inventario")) {
        return { rows: [{ stock_total: 999 }] };
      }
      // Reservas activas
      if (q.includes("from reserva_stock_item") && q.includes("rs.estado = 'activa'")) {
        return { rows: [{ reservado: 0 }] };
      }

      return { rows: [] };
    }),
  };
  return {
    poolPromise: Promise.resolve(mPool),
  };
});

// MOCK del Middleware de Auth
// Esto permite saltarse el login real e inyectar un usuario falso
jest.mock("../../middlewares/authMiddleware", () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id_usuario: 1, rol: "CLIENTE" }; // Usuario simulado
    next();
  },
  authorizeRoles: () => (req, res, next) => next(),
}));

describe("Pruebas de Integración - API Carrito", () => {
  // Prueba de caso de éxito
  test("POST /api/cart/add - Debe agregar un ítem correctamente", async () => {
    const response = await request(app).post("/api/cart/add").send({
      id_producto: 101,
      cantidad: 2,
    });

    // Validamos que el controlador responda 200 y éxito
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });

  // Prueba de validación de datos
  test("POST /api/cart/add - Debe rechazar cantidad negativa", async () => {
    const response = await request(app).post("/api/cart/add").send({
      id_producto: 101,
      cantidad: -5, // Dato inválido
    });

    expect(response.statusCode).toBe(400); // Bad Request
  });
});
export {};
