import { createContext } from "react";
import type { AuthUser } from "./types";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (input: { email: string; password: string; channel?: "customer" | "staff" }) => Promise<AuthUser>;
  register: (input: {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
    telefono?: string;
    direccion_principal?: string;
    website?: string;
    form_started_at?: number;
  }) => Promise<{ message?: string; requiresEmailVerification?: boolean }>;
  logout: () => void;
};

export const AuthContext = createContext<AuthState | null>(null);
