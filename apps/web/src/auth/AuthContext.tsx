import React, { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/http";
import type { AuthUser, Role } from "./types";
import { clearToken, clearUser, readToken, readUser, writeToken, writeUser } from "./storage";
import { AuthContext } from "./context";
import { migrateServerCartToGuestOnLogout, syncGuestCartToServer } from "../cart/cartService";

type LoginResponse = {
  token: string;
  user: AuthUser;
  message?: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<{ message?: string; requiresEmailVerification?: boolean }>;
  logout: () => void;
};

function normalizeRole(rol: unknown): Role | string | undefined {
  if (rol == null) return undefined;
  const r = String(rol).trim().toUpperCase();
  if (r === "ADMIN") return "ADMINISTRADOR";
  if (r === "CLIENTE" || r === "EMPLEADO" || r === "ADMINISTRADOR") return r;
  if (r === "CUSTOMER") return "CLIENTE";
  if (r === "EMPLOYEE") return "EMPLEADO";
  return r;
}

type RegisterInput = {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  telefono?: string;
  direccion_principal?: string;
  // Anti-bot (opcionales para no romper usos existentes)
  website?: string;
  form_started_at?: number;
};

type RegisterResponse = {
  message?: string;
  requiresEmailVerification?: boolean;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(() => readToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    const u = readUser();
    if (!u) return null;
    return { ...u, rol: normalizeRole(u.rol) };
  });

  const logout = useCallback(() => {
    const tokenSnapshot = token || readToken();

    // Best-effort: limpia cookie httpOnly del refresh token en el backend.
    api.post("/auth/logout").catch(() => {
      // Ignorar errores (por ejemplo, si el servidor no está disponible).
    });

    // Migra el carrito del usuario a modo invitado (best-effort).
    void (async () => {
      try {
        if (tokenSnapshot) {
          await migrateServerCartToGuestOnLogout(tokenSnapshot);
        }
      } catch {
        // ignore
      } finally {
        await qc.invalidateQueries({ queryKey: ["cart", "items"] });
        await qc.invalidateQueries({ queryKey: ["cart", "count"] });
      }
    })();

    clearToken();
    clearUser();
    setToken(null);
    setUser(null);
    // Re-sincroniza UI del carrito a modo invitado (rápido).
    void qc.invalidateQueries({ queryKey: ["cart", "items"] });
    void qc.invalidateQueries({ queryKey: ["cart", "count"] });
  }, [qc, token]);

  const login = useCallback(
    async (input: LoginInput) => {
      const res = await api.post<LoginResponse>("/auth/login", {
        email: input.email,
        contrasena: input.password,
      });

      writeToken(res.token);
      writeUser({ ...res.user, rol: normalizeRole(res.user.rol) });

      setToken(res.token);
      setUser({ ...res.user, rol: normalizeRole(res.user.rol) });

      // Si había carrito invitado, lo subimos al carrito del usuario.
      try {
        await syncGuestCartToServer();
      } catch {
        // best-effort
      } finally {
        await qc.invalidateQueries({ queryKey: ["cart", "items"] });
        await qc.invalidateQueries({ queryKey: ["cart", "count"] });
      }

      return res.user;
    },
    [qc]
  );

  const register = useCallback(async (input: RegisterInput) => {
    const res = await api.post<RegisterResponse>("/auth/register", {
      nombre: input.nombre,
      apellido: input.apellido,
      email: input.email,
      contrasena: input.password,
      telefono: input.telefono,
      direccion_principal: input.direccion_principal,
      website: input.website,
      form_started_at: input.form_started_at,
    });

    // Doble opt-in: el registro NO inicia sesión automáticamente.
    // Además, limpiamos cualquier sesión previa para evitar estados confusos en UI.
    clearToken();
    clearUser();
    setToken(null);
    setUser(null);
    return { message: res?.message, requiresEmailVerification: Boolean(res?.requiresEmailVerification) };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
    }),
    [login, logout, register, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
