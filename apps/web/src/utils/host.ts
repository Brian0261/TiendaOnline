const BACKOFFICE_HOST_PATTERN = /(^|\.)backoffice(?:-staging)?\.minimarketexpress\.shop$/i;

export function getCurrentHostname(): string {
  if (typeof window === "undefined") return "";
  return String(window.location.hostname || "")
    .trim()
    .toLowerCase();
}

export function isBackofficeHost(hostname = getCurrentHostname()): boolean {
  return BACKOFFICE_HOST_PATTERN.test(hostname);
}

export function getPublicStoreUrl(): string {
  const hostname = getCurrentHostname();
  if (hostname === "backoffice-staging.minimarketexpress.shop") {
    return "https://staging.minimarketexpress.shop/?login=1";
  }
  if (hostname === "backoffice.minimarketexpress.shop") {
    return "https://minimarketexpress.shop/?login=1";
  }
  return "/?login=1";
}
