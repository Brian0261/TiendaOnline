const sql = require("mssql");

const config = {
  server: "localhost", // o localhost\\SQLEXPRESS si usas una instancia nombrada
  database: "db_bodega",
  user: "bodega_user",
  password: "123",
  options: {
    encrypt: false, // porque es local y no usas SSL
    trustServerCertificate: true,
  },
  pool: {
    max: 20, // 🔝 Máximo de conexiones simultáneas (ajustable)
    min: 5, // 🔽 Mantén algunas siempre vivas para velocidad
    idleTimeoutMillis: 30000, // 💤 Cierra inactivas tras 30 segundos
  },
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log("✅ Conexión a SQL Server establecida");
    return pool;
  })
  .catch(err => {
    console.error("❌ Error al conectar con SQL Server", err);
  });

module.exports = {
  sql,
  poolPromise,
};
