// backend/models/Order.js
const { sql, poolPromise } = require("../config/db.config");

const Order = {
  /**
   * Obtiene el resumen de ventas para un rango de fechas
   */
  async getSalesReport({ fechaInicio, fechaFin }) {
    const pool = await poolPromise;

    // 1. Total de ventas y pedidos completados
    const pedidosRes = await pool.request().input("inicio", sql.Date, fechaInicio).input("fin", sql.Date, fechaFin).query(`
        SELECT 
          COUNT(*) AS totalPedidos,
          SUM(total_pedido) AS totalVentas
        FROM PEDIDO
        WHERE estado_pedido = 'ENTREGADO'
          AND fecha_creacion >= @inicio
          AND fecha_creacion < DATEADD(day, 1, @fin)
      `);

    const totalPedidos = pedidosRes.recordset[0].totalPedidos || 0;
    const totalVentas = pedidosRes.recordset[0].totalVentas || 0;

    // 2. Top 5 productos más vendidos
    const topProductosRes = await pool.request().input("inicio", sql.Date, fechaInicio).input("fin", sql.Date, fechaFin).query(`
        SELECT TOP 5 
          P.nombre_producto AS nombre,
          SUM(DP.cantidad) AS cantidad_vendida
        FROM DETALLE_PEDIDO DP
        INNER JOIN PEDIDO PE ON DP.id_pedido = PE.id_pedido
        INNER JOIN PRODUCTO P ON DP.id_producto = P.id_producto
        WHERE PE.estado_pedido = 'ENTREGADO'
          AND PE.fecha_creacion >= @inicio
          AND PE.fecha_creacion < DATEADD(day, 1, @fin)
        GROUP BY P.nombre_producto
        ORDER BY cantidad_vendida DESC
      `);
    const topProductos = topProductosRes.recordset;

    // 3. Métodos de pago utilizados
    const metodosPagoRes = await pool.request().input("inicio", sql.Date, fechaInicio).input("fin", sql.Date, fechaFin).query(`
        SELECT 
          MP.tipo_metodo AS metodo,
          COUNT(*) AS cantidad
        FROM PEDIDO PE
        INNER JOIN METODOS_DE_PAGO MP ON PE.id_metodo_pago = MP.id_metodo_pago
        WHERE PE.estado_pedido = 'ENTREGADO'
          AND PE.fecha_creacion >= @inicio
          AND PE.fecha_creacion < DATEADD(day, 1, @fin)
        GROUP BY MP.tipo_metodo
        ORDER BY cantidad DESC
      `);
    const metodosPago = metodosPagoRes.recordset;

    return {
      totalPedidos,
      totalVentas,
      topProductos,
      metodosPago,
    };
  },

  /**
   * Devuelve el detalle de los pedidos entregados para exportar (Excel/PDF)
   */
  async getSalesDetails({ fechaInicio, fechaFin }) {
    const pool = await poolPromise;
    const result = await pool.request().input("inicio", sql.Date, fechaInicio).input("fin", sql.Date, fechaFin).query(`
        SELECT 
          PE.id_pedido,
          PE.fecha_creacion,
          U.nombre + ' ' + U.apellido AS cliente,
          MP.tipo_metodo AS metodo_pago,
          PE.total_pedido,
          P.nombre_producto,
          DP.cantidad,
          DP.precio_unitario_venta,
          DP.subtotal
        FROM PEDIDO PE
        INNER JOIN USUARIO U ON PE.id_usuario = U.id_usuario
        INNER JOIN METODOS_DE_PAGO MP ON PE.id_metodo_pago = MP.id_metodo_pago
        INNER JOIN DETALLE_PEDIDO DP ON PE.id_pedido = DP.id_pedido
        INNER JOIN PRODUCTO P ON DP.id_producto = P.id_producto
        WHERE PE.estado_pedido = 'ENTREGADO'
          AND PE.fecha_creacion >= @inicio
          AND PE.fecha_creacion < DATEADD(day, 1, @fin)
        ORDER BY PE.fecha_creacion DESC, PE.id_pedido
      `);

    return result.recordset;
  },
};

module.exports = Order;
