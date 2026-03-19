import * as sharedImageModule from "@shared/image.js";

type SharedImageModule = {
  normalizeImageUrl?: (value?: unknown) => string;
  PLACEHOLDER_PRODUCT?: string;
  default?: {
    normalizeImageUrl?: (value?: unknown) => string;
    PLACEHOLDER_PRODUCT?: string;
  };
};

const sharedImage = sharedImageModule as SharedImageModule;
const normalizeImageUrlAny =
  sharedImage.normalizeImageUrl ||
  sharedImage.default?.normalizeImageUrl ||
  ((value?: unknown) => String(value || "/assets/images/placeholder-product.png"));

const PLACEHOLDER_PRODUCT_ANY =
  sharedImage.PLACEHOLDER_PRODUCT || sharedImage.default?.PLACEHOLDER_PRODUCT || "/assets/images/placeholder-product.png";

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
