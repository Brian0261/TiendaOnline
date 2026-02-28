// backend/models/Order.js
const { poolPromise } = require("../config/db.config");

const Order = {
  /**
   * Obtiene el resumen de ventas para un rango de fechas
   */
  async getSalesReport({ fechaInicio, fechaFin }) {
    const pool = await poolPromise;

    // 1. Total de ventas y pedidos completados
    const pedidosRes = await pool.query(
      `
        SELECT 
          COUNT(*) AS "totalPedidos",
          COALESCE(SUM(total_pedido),0) AS "totalVentas"
        FROM pedido
        WHERE estado_pedido = 'ENTREGADO'
          AND fecha_creacion >= $1
          AND fecha_creacion < ($2::date + interval '1 day')
      `,
      [fechaInicio, fechaFin],
    );

    const totalPedidos = pedidosRes.rows[0].totalPedidos || 0;
    const totalVentas = pedidosRes.rows[0].totalVentas || 0;

    // 2. Top 5 productos más vendidos
    const topProductosRes = await pool.query(
      `
        SELECT
          p.nombre_producto AS nombre,
          SUM(dp.cantidad) AS cantidad_vendida
        FROM detalle_pedido dp
        INNER JOIN pedido pe ON dp.id_pedido = pe.id_pedido
        INNER JOIN producto p ON dp.id_producto = p.id_producto
        WHERE pe.estado_pedido = 'ENTREGADO'
          AND pe.fecha_creacion >= $1
          AND pe.fecha_creacion < ($2::date + interval '1 day')
        GROUP BY p.nombre_producto
        ORDER BY cantidad_vendida DESC
        LIMIT 5
      `,
      [fechaInicio, fechaFin],
    );
    const topProductos = topProductosRes.rows || [];

    // 3. Métodos de pago utilizados
    const metodosPagoRes = await pool.query(
      `
        SELECT 
          mp.tipo_metodo AS metodo,
          COUNT(*) AS cantidad
        FROM pedido pe
        INNER JOIN metodos_de_pago mp ON pe.id_metodo_pago = mp.id_metodo_pago
        WHERE pe.estado_pedido = 'ENTREGADO'
          AND pe.fecha_creacion >= $1
          AND pe.fecha_creacion < ($2::date + interval '1 day')
        GROUP BY mp.tipo_metodo
        ORDER BY cantidad DESC
      `,
      [fechaInicio, fechaFin],
    );
    const metodosPago = metodosPagoRes.rows || [];

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
    const result = await pool.query(
      `
        SELECT 
          pe.id_pedido,
          pe.fecha_creacion,
          u.nombre || ' ' || u.apellido AS cliente,
          mp.tipo_metodo AS metodo_pago,
          pe.total_pedido,
          p.nombre_producto,
          dp.cantidad,
          dp.precio_unitario_venta,
          dp.subtotal
        FROM pedido pe
        INNER JOIN usuario u ON pe.id_usuario = u.id_usuario
        INNER JOIN metodos_de_pago mp ON pe.id_metodo_pago = mp.id_metodo_pago
        INNER JOIN detalle_pedido dp ON pe.id_pedido = dp.id_pedido
        INNER JOIN producto p ON dp.id_producto = p.id_producto
        WHERE pe.estado_pedido = 'ENTREGADO'
          AND pe.fecha_creacion >= $1
          AND pe.fecha_creacion < ($2::date + interval '1 day')
        ORDER BY pe.fecha_creacion DESC, pe.id_pedido
      `,
      [fechaInicio, fechaFin],
    );

    return result.rows || [];
  },
};

module.exports = Order;

export {};
