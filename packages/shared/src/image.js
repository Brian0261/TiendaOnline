const PLACEHOLDER_PRODUCT = "/assets/images/placeholder-product.png";

/**
 * Normaliza cualquier valor de imagen a una URL válida del sitio.
 * - null/undefined/"" -> placeholder
 * - absoluta (http/https) -> se deja igual
 * - "/assets/images/x" -> se deja igual
 * - "assets/images/x" -> "/assets/images/x"
 * - "views/products/assets/images/x" -> "/assets/images/x"
 * - "x.webp" -> "/api/uploads/images/x.webp"
 */
function normalizeImageUrl(raw) {
  if (!raw) return PLACEHOLDER_PRODUCT;
  if (typeof raw !== "string") return PLACEHOLDER_PRODUCT;

  const trimmed = raw.trim();
  if (!trimmed) return PLACEHOLDER_PRODUCT;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Imágenes servidas por el backend (uploads). En una tienda real estas
  // rutas son la fuente de verdad para productos.
  if (/^\/?api\/uploads\//i.test(trimmed)) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  // Permite rutas explícitas del frontend (UI/branding/placeholder).
  if (/^\/?assets\/images\//i.test(trimmed)) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  // Compatibilidad con rutas antiguas
  let cleaned = trimmed
    .replace(/^\/?views\/products\//, "")
    .replace(/^\/?assets\//, "assets/")
    .replace(/^\/+/, "");

  // Si aun viene en formato assets/images/*, lo dejamos tal cual.
  if (/^assets\/images\//.test(cleaned)) {
    return `/${cleaned}`;
  }

  // Default "tienda real": si no es una URL conocida, asumimos que es un archivo
  // de uploads (p.ej. "1752...webp" o "products/1752...webp").
  cleaned = cleaned.replace(/^images\//, "").replace(/^products\//, "");
  return `/api/uploads/images/${cleaned}`;
}

module.exports = {
  PLACEHOLDER_PRODUCT,
  normalizeImageUrl,
};
