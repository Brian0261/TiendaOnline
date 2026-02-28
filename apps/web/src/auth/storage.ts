import type { AuthUser } from "./types";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token");
}

export function writeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  // Compatibilidad legacy
  localStorage.removeItem("token");
}

export function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY) || localStorage.getItem("user");
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as AuthUser;
    if (u && u.rol != null) {
      const r = String(u.rol).trim();
      return { ...u, rol: r };
    }
    return u;
  } catch {
    return null;
  }
}

export function writeUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  localStorage.removeItem(USER_KEY);
  // Compatibilidad legacy
  localStorage.removeItem("user");
}
