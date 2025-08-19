const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../config/db.config");

// GET /api/diag/dbping -> prueba rápida de consulta
router.get("/dbping", async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .timeout(parseInt(process.env.SQL_REQUEST_TIMEOUT || "15000", 10))
      .query("SELECT 1 AS alive");
    return res.json({ ok: true, alive: result.recordset[0]?.alive === 1 });
  } catch (err) {
    console.error("dbping error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "dbping failed", detail: String(err?.message || err) });
  }
});

module.exports = router;
