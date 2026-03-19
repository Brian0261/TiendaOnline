// backend/routes/diagnosticRoutes.js
const express = require("express");
const router = express.Router();
const { getPool } = require("../config/db.config");

const REQ_TIMEOUT = Number(process.env.SQL_REQUEST_TIMEOUT || 15000);

// Salud simple de app (no toca SQL)
router.get("/health", (_req, res) => {
  return res.json({ ok: true, db: "warming", ts: new Date().toISOString() });
});

// Ping a la BD (toca SQL)
router.get("/dbping", async (_req, res) => {
  const t0 = Date.now();
  try {
    const pool = await getPool();
    await pool.query("SET statement_timeout = $1", [REQ_TIMEOUT]);
    const r = await pool.query("SELECT 1 AS uno");
    const ms = Date.now() - t0;
    return res.json({ ok: true, alive: true, ms, result: r.rows });
  } catch (err) {
    const ms = Date.now() - t0;
    console.error("dbping error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "dbping failed", detail: err?.message || String(err), ms });
  }
});

// Fingerprint de paridad (tablas core + seeds críticos)
router.get("/fingerprint", async (_req, res) => {
  const t0 = Date.now();
  try {
    const pool = await getPool();
    await pool.query("SET statement_timeout = $1", [REQ_TIMEOUT]);

    const coreTables = [
      "usuario",
      "metodos_de_pago",
      "categoria",
      "marca",
      "almacen",
      "motorizado",
      "producto",
      "inventario",
      "pedido",
      "envio",
      "comprobante",
      "payment_intent",
      "payment_webhook_event",
    ];

    const tableStats = [] as Array<{ table: string; exists: boolean; rowCount: number | null }>;
    for (const table of coreTables) {
      const existsRs = await pool.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          ) AS exists
        `,
        [table],
      );
      const exists = Boolean(existsRs.rows?.[0]?.exists);

      if (!exists) {
        tableStats.push({ table, exists: false, rowCount: null });
        continue;
      }

      const countRs = await pool.query(`SELECT COUNT(*)::bigint AS n FROM public.${table}`);
      tableStats.push({ table, exists: true, rowCount: Number(countRs.rows?.[0]?.n || 0) });
    }

    const methodsRs = await pool.query(
      `
        SELECT COALESCE(
          string_agg(
            LOWER(TRIM(tipo_metodo)) || ':' || COALESCE(TRIM(detalles), ''),
            '|' ORDER BY LOWER(TRIM(tipo_metodo))
          ),
          ''
        ) AS methods_fingerprint
        FROM metodos_de_pago
      `,
    );

    const methods = await pool.query(
      `
        SELECT id_metodo_pago, tipo_metodo, detalles
        FROM metodos_de_pago
        ORDER BY LOWER(TRIM(tipo_metodo)), id_metodo_pago
      `,
    );

    const dbName = await pool.query("SELECT current_database() AS db");
    const dbUser = await pool.query("SELECT current_user AS db_user");

    return res.json({
      ok: true,
      ms: Date.now() - t0,
      db: {
        name: dbName.rows?.[0]?.db || null,
        user: dbUser.rows?.[0]?.db_user || null,
      },
      tables: tableStats,
      paymentMethods: {
        fingerprint: methodsRs.rows?.[0]?.methods_fingerprint || "",
        rows: methods.rows || [],
      },
      ts: new Date().toISOString(),
    });
  } catch (err) {
    const ms = Date.now() - t0;
    console.error("fingerprint error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "fingerprint failed", detail: err?.message || String(err), ms });
  }
});

module.exports = router;

export {};
