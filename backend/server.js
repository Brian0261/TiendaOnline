// backend/server.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");
const jwt = require("jsonwebtoken");
const { addClient } = require("./utils/sse");
const { poolPromise } = require("./config/db.config");

dotenv.config();

/* ────────────────────────────
   Rutas de carpetas
────────────────────────────── */
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const VIEWS_DIR = path.join(FRONTEND_DIR, "views");

const app = express();

/* ────────────────────────────
   CORS
────────────────────────────── */
const CORS_ORIGINS = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map(s => s.trim()) : ["http://localhost:3000"];

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
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

/* ────────────────────────────
   Body-parsers
────────────────────────────── */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

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
app.use(express.static(FRONTEND_DIR));

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

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/config", configRoutes);
app.use("/api/categories", categoryRoutes);

/* ────────────────────────────
   Vistas (no bloquean si no existen)
────────────────────────────── */
app.get("/", (_req, res, next) => {
  const file = path.join(VIEWS_DIR, "index.html");
  res.sendFile(file, err => (err ? res.status(200).send("API OK") : null));
});

app.get("/:section/:page.html", (req, res, next) => {
  const file = path.join(VIEWS_DIR, req.params.section, `${req.params.page}.html`);
  res.sendFile(file, err => (err ? next() : null));
});

/* ────────────────────────────
   Devuelve la API key (solo lectura)
────────────────────────────── */
app.get("/api/config/maps-key", (req, res) => {
  res.json({ key: process.env.GOOGLE_MAPS_API_KEY || "" });
});

/* ────────────────────────────
   Config de reparto (mock desde .env)
────────────────────────────── */
app.get("/api/config/delivery", (req, res) => {
  const num = (v, def) => (isNaN(Number(v)) ? def : Number(v));
  res.json({
    store: {
      lat: num(process.env.STORE_LAT, -12.046373),
      lng: num(process.env.STORE_LNG, -77.042754),
    },
    radiusKm: num(process.env.DELIVERY_RADIUS_KM, 6),
    pricing: {
      base: num(process.env.SHIPPING_BASE, 5),
      perKm: num(process.env.SHIPPING_PER_KM, 1.2),
      freeOver: num(process.env.FREE_SHIPPING_OVER, 120),
    },
  });
});

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
const PORT = process.env.PORT || 3000;
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

module.exports = server;
