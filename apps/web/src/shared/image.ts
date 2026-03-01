import { normalizeImageUrl as normalizeImageUrlAny, PLACEHOLDER_PRODUCT as PLACEHOLDER_PRODUCT_ANY } from "@shared/image.js";

export const PLACEHOLDER_PRODUCT: string = PLACEHOLDER_PRODUCT_ANY;

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

function getApiOrigin(): string {
  try {
    return new URL(API_BASE, window.location.origin).origin;
  } catch {
    return "";
  }
}

function resolveUploadUrl(url: string): string {
  if (!/^\/api\/uploads\//i.test(url)) return url;
  const origin = getApiOrigin();
  if (!origin) return url;
  return `${origin}${url}`;
}

export function normalizeImageUrl(raw?: string | null): string {
  const normalized = normalizeImageUrlAny(raw as unknown);
  return resolveUploadUrl(normalized);
}
