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

// Verifica qué cuenta de Mercado Pago está asociada al token cargado en el servidor.
router.get("/mp-owner", async (_req, res) => {
  try {
    const token = String(process.env.MP_ACCESS_TOKEN || "").trim();
    if (!token) {
      return res.status(500).json({ ok: false, message: "MP_ACCESS_TOKEN no configurado en este entorno" });
    }

    const mpRes = await fetch("https://api.mercadopago.com/users/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const text = await mpRes.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!mpRes.ok) {
      return res.status(502).json({
        ok: false,
        message: "No se pudo validar owner de Mercado Pago",
        status: mpRes.status,
        detail: json || text,
      });
    }

    return res.json({
      ok: true,
      mpOwner: {
        id: json?.id || null,
        nickname: json?.nickname || null,
        email: json?.email || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "mp-owner failed", detail: err?.message || String(err) });
  }
});

module.exports = router;

export {};
