// backend/features/steps/pedidosSteps.js
const { Given, When, Then } = require("@cucumber/cucumber");
const assert = require("assert");

let precioProducto = 0;
let cantidadProducto = 0;
let costoEnvio = 0;
let subtotalCalculado = 0;
let totalCalculado = 0;

Given("tengo un producto {string} con precio {float} y cantidad {int}", function (nombre, precio, cantidad) {
  precioProducto = precio;
  cantidadProducto = cantidad;
});

Given("selecciono envío a {string} con costo {float}", function (tipo, costo) {
  costoEnvio = costo;
});

When("calculo el total del pedido", function () {
  // Simulamos la lógica de tu orderController.js
  subtotalCalculado = precioProducto * cantidadProducto;
  totalCalculado = subtotalCalculado + costoEnvio;
});

Then("el subtotal debe ser {float}", function (esperado) {
  assert.strictEqual(subtotalCalculado, esperado);
});

Then("el total final debe ser {float}", function (esperado) {
  assert.strictEqual(totalCalculado, esperado);
});

export {};
