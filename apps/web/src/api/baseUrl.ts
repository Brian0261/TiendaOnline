function normalizeBase(base: string): string {
  return base.replace(/\/+$/, "");
}

function getHostFallbackBase(): string {
  if (typeof window === "undefined") return "/api";
  const host = window.location.hostname.toLowerCase();
  if (host === "minimarketexpress.shop" || host === "www.minimarketexpress.shop" || host === "backoffice.minimarketexpress.shop") {
    return "https://tiendaonline-production-5b3b.up.railway.app/api";
  }
  if (host === "staging.minimarketexpress.shop" || host === "backoffice-staging.minimarketexpress.shop") {
    return "https://api-staging.minimarketexpress.shop/api";
  }
  return "/api";
}

export function resolveApiBaseUrl(): string {
  const envBase = String(import.meta.env.VITE_API_BASE || "").trim();
  if (envBase) return normalizeBase(envBase);
  return normalizeBase(getHostFallbackBase());
}

export const API_BASE_URL = resolveApiBaseUrl();

export function buildApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
