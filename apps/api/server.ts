// backend/server.js
const dotenv = require("dotenv");
dotenv.config(); // solo una vez
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const path = require("path");
const { addClient } = require("./utils/sse");
const { poolPromise } = require("./config/db.config");

const app = express();

// Importante cuando estás detrás de Nginx/Reverse Proxy (req.ip correcto para rate limiting).
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

/* ────────────────────────────
   CORS
────────────────────────────── */
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
  : ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"];

app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* ────────────────────────────
   Logging (solo en dev)
────────────────────────────── */
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/* ────────────────────────────
   Body-parsers
────────────────────────────── */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ────────────────────────────
   HEALTH: responder sin depender de BD
────────────────────────────── */
let dbReady = false;
app.get("/health", (_req, res) => {
  res.json({ ok: true, db: dbReady ? "up" : "warming", ts: new Date().toISOString() });
});

/* ────────────────────────────
   Content Security Policy (CSP)
────────────────────────────── */
app.use((req, res, next) => {
  const csp = [
    "default-src 'self' http://localhost:3000",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://maps.googleapis.com https://kit.fontawesome.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://ka-f.fontawesome.com",
    "img-src 'self' blob: data: https://via.placeholder.com https://pnghq.com https://maps.gstatic.com https://maps.googleapis.com",
    `connect-src 'self' ${CORS_ORIGINS.join(" ")} https://maps.googleapis.com https://maps.gstatic.com`,
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  next();
});

/* ────────────────────────────
   Archivos estáticos (si existen en la imagen)
────────────────────────────── */
// En modo Dockerizado, el frontend se sirve por Nginx.
// El backend debe ser solo API.

/* ────────────────────────────
   NO CACHE para la API
────────────────────────────── */
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

/* ────────────────────────────
  Uploads estáticos (imágenes subidas)
────────────────────────────── */
app.use("/api/uploads", express.static(path.join(process.cwd(), "uploads")));

/* ────────────────────────────
   Rutas API
────────────────────────────── */
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const reportRoutes = require("./routes/reportRoutes");
const orderRoutes = require("./routes/orderRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const configRoutes = require("./routes/configRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const diagnosticRoutes = require("./routes/diagnosticRoutes");
const auditRoutes = require("./routes/auditRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/config", configRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/diag", diagnosticRoutes);
app.use("/api/audit", auditRoutes);

/* ────────────────────────────
   SSE: stream de cambios de pedidos
────────────────────────────── */
app.get("/api/orders/stream", (req, res) => {
  try {
    const token = req.query.token || (req.headers.authorization || "").split(" ")[1];
    if (!token) return res.sendStatus(401);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id_usuario || payload.user?.id_usuario || payload.id || payload.sub;
    if (!userId) return res.sendStatus(401);
    addClient(Number(userId), res);
  } catch {
    return res.sendStatus(401);
  }
});

/* ────────────────────────────
   404
────────────────────────────── */
app.use("*", (_req, res) => res.status(404).send("Not Found"));

/* ────────────────────────────
   Manejador de errores genérico
────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Algo salió mal en el servidor" });
});

/* ────────────────────────────
   Arranque del servidor (NO bloquear por SQL)
────────────────────────────── */
/*const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

const server = app.listen(PORT, () => {
  if (PUBLIC_BASE_URL) {
    console.log(`🚀 API lista en ${PUBLIC_BASE_URL} (puerto interno ${PORT})`);
  } else {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  }
});

// Calentar/conectar SQL en segundo plano
poolPromise
  .then(() => {
    dbReady = true;
    console.log("✅ DB lista (pool conectado)");
  })
  .catch(err => {
    console.error("⚠️ No se pudo conectar a SQL en el arranque:", err?.message || err);
    // NO process.exit(1). Reintenta con las primeras consultas.
  });

module.exports = server;*/

/* ────────────────────────────
   Arranque del servidor (Modo Condicional)
────────────────────────────── */
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

let server;

// SOLUCIÓN: Solo levantar el puerto si NO estamos corriendo pruebas
if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    if (PUBLIC_BASE_URL) {
      console.log(`🚀 API lista en ${PUBLIC_BASE_URL} (puerto interno ${PORT})`);
    } else {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    }
  });
}

// Calentar/conectar SQL en segundo plano
poolPromise
  .then(() => {
    dbReady = true;
    if (process.env.NODE_ENV !== "test") console.log("✅ DB lista (pool conectado)");
  })
  .catch(err => {
    // En test no queremos ensuciar la consola con errores de conexión real
    if (process.env.NODE_ENV !== "test") {
      console.error("⚠️ No se pudo conectar a SQL en el arranque:", err?.message || err);
    }
  });

// Exportamos 'app' en lugar de 'server' para que Supertest pueda levantar su propio puerto temporal
module.exports = app;

export {};
