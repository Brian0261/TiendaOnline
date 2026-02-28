type DownloadError = {
  status: number;
  message: string;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringField(body: unknown, key: string): string | null {
  if (!isRecord(body)) return null;
  const value = body[key];
  return typeof value === "string" ? value : null;
}

function getToken(): string | null {
  return localStorage.getItem("auth_token") || localStorage.getItem("token") || null;
}

function setToken(token: string): void {
  localStorage.setItem("auth_token", token);
}

const BASE_URL = import.meta.env.VITE_API_BASE || "/api";

function buildUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function getFilenameFromDisposition(disposition: string | null, fallback: string): string {
  const d = disposition || "";
  const match = d.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = (match?.[1] || match?.[2] || fallback).trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw || fallback;
  }
}

async function parseErrorResponse(res: Response): Promise<DownloadError> {
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  const message =
    (typeof body === "string" && body.trim() ? body : null) ??
    readStringField(body, "message") ??
    readStringField(body, "error") ??
    `HTTP ${res.status}`;

  return { status: res.status, message, details: body };
}

async function tryRefreshToken(): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const token = readStringField(body, "token");
  if (!token) return null;
  setToken(token);
  return token;
}

async function fetchWithAuth(url: string, allowRefresh: boolean): Promise<Response> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { method: "GET", headers, credentials: "include" });

  if (res.status === 401 && allowRefresh && token) {
    const newToken = await tryRefreshToken();
    if (!newToken) return res;

    const retryHeaders = new Headers();
    retryHeaders.set("Authorization", `Bearer ${newToken}`);
    return fetch(url, { method: "GET", headers: retryHeaders, credentials: "include" });
  }

  return res;
}

export async function downloadApiFile(path: string, fallbackFilename: string): Promise<void> {
  const url = buildUrl(path);
  const res = await fetchWithAuth(url, true);

  if (!res.ok) {
    const err = await parseErrorResponse(res);
    throw new Error(err.message);
  }

  const blob = await res.blob();
  const filename = getFilenameFromDisposition(res.headers.get("content-disposition"), fallbackFilename);

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename || fallbackFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
