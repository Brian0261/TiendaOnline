# backend/features/pedidos.feature
Feature: Cálculo de Pedido
  Como cliente quiero ver el total correcto antes de pagar

  Scenario: Cálculo de subtotal con envío a domicilio
    Given tengo un producto "Arroz" con precio 5.00 y cantidad 4
    And selecciono envío a "DOMICILIO" con costo 10.00
    When calculo el total del pedido
    Then el subtotal debe ser 20.00
    And el total final debe ser 30.00