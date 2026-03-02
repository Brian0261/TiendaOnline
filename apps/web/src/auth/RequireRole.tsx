import { Navigate } from "react-router-dom";
import type { Role } from "./types";
import { useAuth } from "./useAuth";

type Props = {
  role: Role;
  children: React.ReactNode;
};

function normalizeRole(rol: unknown): string {
  const raw = (rol == null ? "" : String(rol)).trim().toUpperCase();
  if (raw === "ADMIN") return "ADMINISTRADOR";
  if (raw === "ADMINISTRADOR") return "ADMINISTRADOR";
  if (raw === "EMPLEADO" || raw === "EMPLOYEE") return "EMPLEADO";
  if (raw === "CLIENTE" || raw === "CUSTOMER") return "CLIENTE";
  return raw;
}

export function RequireRole({ role, children }: Props) {
  const { user, isAuthenticated } = useAuth();
  const userRole = normalizeRole(user?.rol);
  const isInternalRole = role === "ADMINISTRADOR" || role === "EMPLEADO";

  if (!isAuthenticated || !user || userRole !== role) {
    return <Navigate to={isInternalRole ? "/backoffice/login" : "/?login=1"} replace />;
  }

  return <>{children}</>;
}
