const express = require("express");
const router = express.Router();

// GET /api/config/maps-key  → usada por checkout.js
router.get("/maps-key", (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GMAPS_API_KEY || "";
  res.json({ key });
});

// GET /api/config/delivery  → única sede y reglas fijas
router.get("/delivery", (req, res) => {
  res.json({
    store: {
      name: "Almacén Central",
      address: "Av. Principal 123, Lima",
      lat: -12.046373,
      lng: -77.042754,
      phone: "(01) 123-4567",
      hours: "Lunes a Sábado 9am - 9pm · Domingo 9am - 6pm",
    },
    pricing: { base: 5 }, // envío fijo S/5 a domicilio
  });
});

module.exports = router;

export {};
