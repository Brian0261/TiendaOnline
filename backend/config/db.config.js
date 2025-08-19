// backend/config/db.config.js
const sql = require("mssql");
require("dotenv").config();

/**
 * Preferimos una sola connection string en PROD (Azure) vía DB_CONN.
 * Si no existe, usamos los parámetros locales (útil para desarrollo).
 */

const hasConnStr = !!process.env.DB_CONN;

const poolCfg = {
  max: parseInt(process.env.SQL_POOL_MAX || "10", 10),
  min: parseInt(process.env.SQL_POOL_MIN || "0", 10),
  idleTimeoutMillis: parseInt(process.env.SQL_POOL_IDLE || "30000", 10),
};

let config;

if (hasConnStr) {
  // Azure / staging / prod (usar secreto DB_CONN)
  config = {
    connectionString: process.env.DB_CONN,
    options: {
      // En Azure SQL debe ir en true
      encrypt: true,
      trustServerCertificate: false,
    },
    pool: poolCfg,
  };
} else {
  // Local (tu config actual). Puedes sobrescribir con variables si quieres.
  config = {
    server: process.env.DB_SERVER || "localhost",
    database: process.env.DB_NAME || "db_bodega",
    user: process.env.DB_USER || "bodega_user",
    password: process.env.DB_PASSWORD || "123",
    options: {
      // Local: sin SSL
      encrypt: false,
      trustServerCertificate: true,
    },
    pool: poolCfg,
  };
}

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    const mode = hasConnStr ? "connectionString (DB_CONN)" : `${config.server}/${config.database}`;
    console.log(`✅ Conexión a SQL Server establecida usando ${mode}`);
    return pool;
  })
  .catch(err => {
    console.error("❌ Error al conectar con SQL Server", err);
    // En producción conviene terminar si no hay DB
    if (process.env.NODE_ENV === "production") process.exit(1);
    throw err;
  });

module.exports = {
  sql,
  poolPromise,
};
