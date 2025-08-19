// backend/server.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { addClient } = require("./utils/sse");

// Rutas de la API
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

const { poolPromise } = require("./config/db.config");

dotenv.config();

const IS_PROD = process.env.NODE_ENV === "production";

// ────────────────────────────
// Rutas de carpetas (sólo para desarrollo/local)
// ────────────────────────────
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const VIEWS_DIR = path.join(FRONTEND_DIR, "views");

// sirve estáticos en local si existe la carpeta
const SERVE_STATIC = fs.existsSync(FRONTEND_DIR) && (process.env.SERVE_STATIC === "1" || !IS_PROD);

const app = express();
app.set("trust proxy", 1); // por si corre detrás de Cloudflare/ingress

// ────────────────────────────
// CORS
// ────────────────────────────
const defaultOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const CORS_ORIGINS = (process.env.CORS_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ────────────────────────────
// Logging (solo en dev)
// ────────────────────────────
if (!IS_PROD) app.use(morgan("dev"));

// ────────────────────────────
/* Body-parsers */
// ────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ────────────────────────────
// Headers de seguridad básicos + CSP (flexible para local)
// ────────────────────────────
app.use((req, res, next) => {
  const csp = [
    "default-src 'self' http://localhost:3000 http://127.0.0.1:3000",
    // JS externos (Maps, CDNs, FontAwesome y sandbox Izipay)
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://maps.googleapis.com https://kit.fontawesome.com https://sandbox-checkout.izipay.pe https://checkout.izipay.pe",
    // Estilos (Bootstrap/FA/Google Fonts)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    // Fuentes (FA + Google). Incluye data: para iconos embebidos
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://ka-f.fontawesome.com",
    // Imágenes (incluye tiles y recursos de Maps)
    "img-src 'self' blob: data: https://via.placeholder.com https://pnghq.com https://maps.gstatic.com https://maps.googleapis.com",
    // XHR/Fetch (orígenes permitidos + Maps)
    `connect-src 'self' ${CORS_ORIGINS.join(" ")} https://maps.googleapis.com https://maps.gstatic.com`,
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ────────────────────────────
// Archivos estáticos (para desarrollo/local)
// ────────────────────────────
if (SERVE_STATIC) {
  app.use(express.static(FRONTEND_DIR));
}

// ────────────────────────────
// NO CACHE para la API (especialmente reportes)
// ────────────────────────────
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ────────────────────────────
// Healthcheck (útil para despliegues)
// ────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime(), ts: new Date().toISOString() }));

// ────────────────────────────
// Rutas API
// ────────────────────────────
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

// ────────────────────────────
// Vistas (para desarrollo/local)
// ────────────────────────────
if (SERVE_STATIC) {
  // Home
  app.get("/", (_req, res) => res.sendFile(path.join(VIEWS_DIR, "index.html")));

  // Cualquier /seccion/pagina.html
  app.get("/:section/:page.html", (req, res, next) => {
    const file = path.join(VIEWS_DIR, req.params.section, `${req.params.page}.html`);
    res.sendFile(file, err => (err ? next() : null));
  });
}

// Devuelve la API key (solo lectura)
app.get("/api/config/maps-key", (_req, res) => {
  res.json({ key: process.env.GOOGLE_MAPS_API_KEY || "" });
});

// Configuración de reparto: centro, radio y reglas de precios
app.get("/api/config/delivery", (_req, res) => {
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

// SSE: stream de cambios de pedidos para el usuario autenticado
app.get("/api/orders/stream", (req, res) => {
  try {
    // EventSource no permite headers -> pasamos token por query (?token=)
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

// 404
app.use("*", (_req, res) => {
  if (SERVE_STATIC) {
    return res.status(404).sendFile(path.join(VIEWS_DIR, "404.html"));
  }
  return res.status(404).json({ error: "Not Found" });
});

// Manejador de errores genérico
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Algo salió mal en el servidor" });
});

// ────────────────────────────
// Arranque del servidor
// ────────────────────────────
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

poolPromise
  .then(() => {
    app.listen(PORT, () => {
      if (PUBLIC_BASE_URL) {
        console.log(`🚀 API lista en ${PUBLIC_BASE_URL} (puerto interno ${PORT})`);
      } else {
        // Mensaje clickeable cuando corres: node server.js
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      }
    });
  })
  .catch(err => {
    console.error("❌ Error conectando a SQL Server:", err);
    process.exit(1);
  });
