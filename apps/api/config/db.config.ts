// backend/config/db.config.js
const { Pool } = require("pg");

const connectionString = process.env.PG_URL || process.env.DATABASE_URL || "";
const sslEnabled = String(process.env.PG_SSL || process.env.DB_SSL || "").toLowerCase() === "true";
const sslRejectUnauthorized = String(process.env.PG_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false";

const config = connectionString
  ? {
      connectionString,
      ssl: sslEnabled ? { rejectUnauthorized: sslRejectUnauthorized } : undefined,
    }
  : {
      host: process.env.PG_HOST || process.env.DB_HOST || "localhost",
      port: parseInt(process.env.PG_PORT || process.env.DB_PORT || "5432", 10),
      user: process.env.PG_USER || process.env.DB_USER,
      password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.PG_DATABASE || process.env.DB_NAME || process.env.DB_DATABASE,
      ssl: sslEnabled ? { rejectUnauthorized: sslRejectUnauthorized } : undefined,
    };

const pool = new Pool({
  ...config,
  max: 10,
  idleTimeoutMillis: 30000,
});

async function connectWithRetry(retries = 15, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("✅ Conectado a PostgreSQL");
      return pool;
    } catch (e) {
      console.log(`❌ Conexión PostgreSQL intento ${i} falló: ${e.message}`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.warn("⚠️ No se pudo conectar a PostgreSQL en el arranque.");
  return null;
}

const poolPromise = connectWithRetry();

async function getPool() {
  const readyPool = await poolPromise;
  if (!readyPool) throw new Error("Pool no inicializado");
  return readyPool;
}

module.exports = { pool, config, poolPromise, getPool };

export {};
