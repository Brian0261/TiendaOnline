// backend/config/db.config.js
const sql = require("mssql");

const CONN_TIMEOUT = Number(process.env.SQL_CONN_TIMEOUT || 15000); // ms
const REQ_TIMEOUT = Number(process.env.SQL_REQUEST_TIMEOUT || 15000); // ms

const CONNECTION_STRING = (process.env.DB_CONN || "").trim();

// Config de respaldo por variables separadas (local/dev)
const fallbackConfig = {
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_DATABASE || "db_bodega",
  user: process.env.DB_USER || "",
  password: process.env.DB_PASSWORD || "",
  options: {
    encrypt: process.env.DB_ENCRYPT === "true" || false,
    trustServerCertificate: process.env.DB_TRUSTED_CONNECTION === "true" || false,
  },
  pool: { max: 20, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: CONN_TIMEOUT,
  requestTimeout: REQ_TIMEOUT,
};

let _pool = null;
let _connecting = null;

async function createPool() {
  // 1) Si hay DB_CONN, úsala directamente (forma soportada por mssql)
  const pool = CONNECTION_STRING ? new sql.ConnectionPool(CONNECTION_STRING) : new sql.ConnectionPool(fallbackConfig);

  // 2) Evitar que connect() se quede colgado: timebox con Promise.race
  const connectPromise = pool.connect();
  const timeoutMs = CONN_TIMEOUT + 2000;
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`SQL connect timeout after ${timeoutMs}ms`)), timeoutMs));

  await Promise.race([connectPromise, timeout]);

  // 3) Escucha errores del pool para forzar reconexión en el futuro
  pool.on("error", err => {
    console.error("⚠️  Pool SQL error:", err?.message || err);
    _pool = null;
  });

  console.log("✅ Pool SQL conectado");
  return pool;
}

async function getPool() {
  if (_pool && _pool.connected) return _pool;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    try {
      _pool = await createPool();
      return _pool;
    } finally {
      _connecting = null;
    }
  })();

  return _connecting;
}

module.exports = {
  sql,
  getPool,
  // compatibilidad con código que espera poolPromise
  poolPromise: (async () => {
    try {
      return await getPool();
    } catch (e) {
      console.error("❌ Error conectando a SQL:", e?.message || e);
      throw e; // importantísimo: rechazar para que el controlador responda 500 y no se cuelgue
    }
  })(),
};
