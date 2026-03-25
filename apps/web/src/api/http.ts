import { API_BASE_URL, buildApiUrl } from "./baseUrl";

export type ApiError = {
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

const BASE_URL = API_BASE_URL;

function isAuthPath(path: string): boolean {
  // Evita loops de refresh en endpoints de auth.
  return path.startsWith("/auth/") || path === "/auth";
}

function isFormDataBody(body: RequestInit["body"]): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function shouldSetJsonContentType(body: RequestInit["body"]): boolean {
  if (!body) return false;
  if (isFormDataBody(body)) return false;
  if (typeof Blob !== "undefined" && body instanceof Blob) return false;
  return true;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const message =
      (typeof body === "string" && body.trim() ? body : null) ??
      readStringField(body, "message") ??
      readStringField(body, "error") ??
      `HTTP ${res.status}`;

    const err: ApiError = { status: res.status, message, details: body };
    throw err;
  }

  return body as T;
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

async function requestInternal<T>(path: string, options: RequestInit = {}, allowRefresh: boolean): Promise<T> {
  const url = buildApiUrl(path);

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && shouldSetJsonContentType(options.body)) headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...options, headers, credentials: "include" });

  // Si el access token expiró, intentamos refrescar UNA vez y reintentar.
  if (res.status === 401 && allowRefresh && !isAuthPath(path)) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      const retryHeaders = new Headers(options.headers || {});
      if (!retryHeaders.has("Content-Type") && shouldSetJsonContentType(options.body)) retryHeaders.set("Content-Type", "application/json");
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      const retryRes = await fetch(url, { ...options, headers: retryHeaders, credentials: "include" });
      return handleResponse<T>(retryRes);
    }
  }

  return handleResponse<T>(res);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  return requestInternal<T>(path, options, true);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data ? (data instanceof FormData ? data : JSON.stringify(data)) : undefined,
    }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: data ? (data instanceof FormData ? data : JSON.stringify(data)) : undefined,
    }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: data ? (data instanceof FormData ? data : JSON.stringify(data)) : undefined,
    }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
