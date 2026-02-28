import { normalizeImageUrl as normalizeImageUrlAny, PLACEHOLDER_PRODUCT as PLACEHOLDER_PRODUCT_ANY } from "@shared/image.js";

export const PLACEHOLDER_PRODUCT: string = PLACEHOLDER_PRODUCT_ANY;

export function normalizeImageUrl(raw?: string | null): string {
  return normalizeImageUrlAny(raw as unknown);
}
