const { poolPromise } = require("../config/db.config");

async function getOrderPaymentInfo(orderId) {
  const pool = await poolPromise;
  const orderRes = await pool.query(
    "SELECT id_pedido, total_pedido, id_usuario FROM pedido WHERE id_pedido = $1 AND estado_pedido = 'PENDIENTE_PAGO'",
    [orderId],
  );

  return orderRes.rows?.[0] || null;
}

async function getOrderItemsForPayment(orderId) {
  const pool = await poolPromise;
  const { rows } = await pool.query(
    `
      SELECT 
        p.nombre_producto AS nombre,
        dp.cantidad AS cantidad,
        dp.precio_unitario_venta AS precio
      FROM detalle_pedido dp
      INNER JOIN producto p ON p.id_producto = dp.id_producto
      WHERE dp.id_pedido = $1
    `,
    [orderId],
  );

  return (rows || []).map(r => ({
    nombre: String(r.nombre || ""),
    cantidad: Number(r.cantidad || 0),
    precio: Number(r.precio || 0),
  }));
}

async function getPaymentMethodIdByName(tipoMetodo) {
  const pool = await poolPromise;
  const { rows } = await pool.query(`SELECT id_metodo_pago FROM metodos_de_pago WHERE tipo_metodo = $1 LIMIT 1`, [tipoMetodo]);
  return rows?.[0]?.id_metodo_pago ? Number(rows[0].id_metodo_pago) : null;
}

async function ensurePaymentMethodIdByName(tipoMetodo, detalles = null) {
  const pool = await poolPromise;
  const tx = await pool.connect();

  try {
    await tx.query("BEGIN");
    await tx.query(
      `
        SELECT pg_advisory_xact_lock(hashtext($1))
      `,
      [`metodos_de_pago:${String(tipoMetodo || "").trim()}`],
    );

    const existing = await tx.query(
      `
        SELECT id_metodo_pago
        FROM metodos_de_pago
        WHERE tipo_metodo = $1
        ORDER BY id_metodo_pago ASC
        LIMIT 1
      `,
      [tipoMetodo],
    );

    let id = existing.rows?.[0]?.id_metodo_pago ? Number(existing.rows[0].id_metodo_pago) : null;

    if (!id) {
      const inserted = await tx.query(
        `
          INSERT INTO metodos_de_pago (tipo_metodo, detalles)
          VALUES ($1, $2)
          RETURNING id_metodo_pago
        `,
        [tipoMetodo, detalles],
      );
      id = inserted.rows?.[0]?.id_metodo_pago ? Number(inserted.rows[0].id_metodo_pago) : null;
    }

    await tx.query("COMMIT");
    return id;
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function upsertPaymentIntent({ provider, orderId, paymentMethodId, preferenceId, initPoint, receiptType, receiptData }) {
  const pool = await poolPromise;
  await pool.query(
    `
      INSERT INTO payment_intent (
        provider,
        id_pedido,
        payment_method_id,
        provider_preference_id,
        provider_init_point,
        receipt_type,
        receipt_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (provider, id_pedido)
      DO UPDATE SET
        payment_method_id = EXCLUDED.payment_method_id,
        provider_preference_id = EXCLUDED.provider_preference_id,
        provider_init_point = EXCLUDED.provider_init_point,
        receipt_type = EXCLUDED.receipt_type,
        receipt_data = EXCLUDED.receipt_data,
        status = 'CREATED',
        provider_payment_id = NULL,
        confirmed_at = NULL
    `,
    [provider, orderId, paymentMethodId, preferenceId || null, initPoint || null, receiptType, receiptData ? JSON.stringify(receiptData) : null],
  );
}

async function getPaymentIntentByOrder(provider, orderId) {
  const pool = await poolPromise;
  const { rows } = await pool.query(
    `
      SELECT
        provider,
        id_pedido,
        payment_method_id,
        provider_preference_id,
        provider_init_point,
        receipt_type,
        receipt_data,
        status,
        provider_payment_id,
        confirmed_at
      FROM payment_intent
      WHERE provider = $1 AND id_pedido = $2
      LIMIT 1
    `,
    [provider, orderId],
  );
  const row = rows?.[0];
  if (!row) return null;
  let receiptData = null;
  try {
    receiptData = row.receipt_data ? JSON.parse(String(row.receipt_data)) : null;
  } catch {
    receiptData = null;
  }
  return {
    provider: String(row.provider),
    orderId: Number(row.id_pedido),
    paymentMethodId: Number(row.payment_method_id),
    preferenceId: row.provider_preference_id ? String(row.provider_preference_id) : null,
    initPoint: row.provider_init_point ? String(row.provider_init_point) : null,
    receiptType: String(row.receipt_type || "BOLETA"),
    receiptData,
    status: String(row.status || ""),
    providerPaymentId: row.provider_payment_id ? String(row.provider_payment_id) : null,
    confirmedAt: row.confirmed_at || null,
  };
}

async function markPaymentIntentConfirmed({ provider, orderId, providerPaymentId }) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE payment_intent
      SET status = 'CONFIRMED',
          provider_payment_id = $3,
          confirmed_at = NOW()
      WHERE provider = $1 AND id_pedido = $2
    `,
    [provider, orderId, providerPaymentId || null],
  );
}

async function markPaymentIntentRefunded({ provider, orderId }) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE payment_intent
      SET status = 'REFUNDED'
      WHERE provider = $1 AND id_pedido = $2
    `,
    [provider, orderId],
  );
}

async function insertWebhookEventIfNew({ provider, eventId, paymentId, rawBody }) {
  const pool = await poolPromise;
  try {
    const { rows } = await pool.query(
      `
        INSERT INTO payment_webhook_event (provider, event_id, payment_id, raw_body)
        VALUES ($1, $2, $3, $4)
        RETURNING id_payment_webhook_event AS id
      `,
      [provider, eventId, paymentId || null, rawBody || null],
    );
    return { inserted: true, id: rows?.[0]?.id ? Number(rows[0].id) : null };
  } catch (err) {
    // 23505: unique_violation
    if (err && err.code === "23505") {
      return { inserted: false, id: null };
    }
    throw err;
  }
}

async function getWebhookEvent(provider, eventId) {
  const pool = await poolPromise;
  const { rows } = await pool.query(
    `
      SELECT id_payment_webhook_event, processed_at
      FROM payment_webhook_event
      WHERE provider = $1 AND event_id = $2
      LIMIT 1
    `,
    [provider, eventId],
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id_payment_webhook_event),
    processedAt: row.processed_at || null,
  };
}

async function markWebhookEventProcessed(provider, eventId) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE payment_webhook_event
      SET processed_at = NOW()
      WHERE provider = $1 AND event_id = $2
    `,
    [provider, eventId],
  );
}

module.exports = {
  getOrderPaymentInfo,
  getOrderItemsForPayment,
  getPaymentMethodIdByName,
  ensurePaymentMethodIdByName,
  upsertPaymentIntent,
  getPaymentIntentByOrder,
  markPaymentIntentConfirmed,
  markPaymentIntentRefunded,
  insertWebhookEventIfNew,
  getWebhookEvent,
  markWebhookEventProcessed,
};

export {};
