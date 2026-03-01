export const PLACEHOLDER_PRODUCT = "/assets/images/placeholder-product.png";

export function normalizeImageUrl(raw: unknown): string {
  if (!raw) return PLACEHOLDER_PRODUCT;
  if (typeof raw !== "string") return PLACEHOLDER_PRODUCT;

  const trimmed = raw.trim();
  if (!trimmed) return PLACEHOLDER_PRODUCT;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (/^\/?api\/uploads\//i.test(trimmed)) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  if (/^\/?assets\/images\//i.test(trimmed)) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  let cleaned = trimmed
    .replace(/^\/?views\/products\//, "")
    .replace(/^\/?assets\//, "assets/")
    .replace(/^\/+/, "");

  if (/^assets\/images\//.test(cleaned)) {
    return `/${cleaned}`;
  }

  cleaned = cleaned.replace(/^images\//, "").replace(/^products\//, "");
  return `/api/uploads/images/${cleaned}`;
}

export {};
