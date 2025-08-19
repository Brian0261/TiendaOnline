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
    const req = pool.request();
    req.timeout = REQ_TIMEOUT; // <- propiedad, no función
    const r = await req.query("SELECT 1 AS uno");
    const ms = Date.now() - t0;
    return res.json({ ok: true, alive: true, ms, result: r.recordset });
  } catch (err) {
    const ms = Date.now() - t0;
    console.error("dbping error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "dbping failed", detail: err?.message || String(err), ms });
  }
});

module.exports = router;
