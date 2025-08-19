// backend/config/db.config.js
const sql = require("mssql");
require("dotenv").config();

// Pool settings
const poolCfg = {
  max: parseInt(process.env.SQL_POOL_MAX || "10", 10),
  min: parseInt(process.env.SQL_POOL_MIN || "0", 10),
  idleTimeoutMillis: parseInt(process.env.SQL_POOL_IDLE || "30000", 10),
};

const connectionTimeout = parseInt(process.env.SQL_CONN_TIMEOUT || "15000", 10);
const requestTimeout = parseInt(process.env.SQL_REQUEST_TIMEOUT || "15000", 10);

// Usa DB_CONN si existe (Azure), si no, variables sueltas (local)
let config;
if (process.env.DB_CONN) {
  config = {
    connectionString: process.env.DB_CONN,
    options: { encrypt: true, trustServerCertificate: false },
    pool: poolCfg,
    connectionTimeout,
    requestTimeout,
  };
} else {
  config = {
    server: process.env.DB_SERVER || "localhost",
    database: process.env.DB_NAME || "db_bodega",
    user: process.env.DB_USER || "bodega_user",
    password: process.env.DB_PASSWORD || "123",
    options: { encrypt: false, trustServerCertificate: true },
    pool: poolCfg,
    connectionTimeout,
    requestTimeout,
  };
}

// Con reintentos infinitos (útil cuando Azure SQL está en autopause)
async function connectWithRetry(retryMs = 5000) {
  while (true) {
    try {
      const pool = await new sql.ConnectionPool(config).connect();
      console.log("✅ Conexión a SQL establecida");
      return pool;
    } catch (err) {
      console.error("⚠️ Error conectando a SQL:", err?.message || err);
      await new Promise(r => setTimeout(r, retryMs));
    }
  }
}

const poolPromise = connectWithRetry();

module.exports = { sql, poolPromise };
