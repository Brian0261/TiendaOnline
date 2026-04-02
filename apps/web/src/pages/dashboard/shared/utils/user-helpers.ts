import type { ManagedUserRole, ManagedUserState } from "../types/users.types";
import type { AdminOrder } from "../types/orders.types";
import { formatStateLabel } from "./format";

export function normalizeManagedUserRole(value: unknown): ManagedUserRole {
  const raw = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  if (raw === "CLIENTE" || raw === "EMPLEADO" || raw === "REPARTIDOR") return raw;
  return "";
}

export function normalizeManagedUserState(value: unknown): ManagedUserState {
  const raw = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  if (raw === "ACTIVO" || raw === "INACTIVO") return raw;
  return "";
}

export function getManagedUserRoleLabel(role: ManagedUserRole): string {
  if (role === "CLIENTE") return "Cliente";
  if (role === "EMPLEADO") return "Empleado";
  if (role === "REPARTIDOR") return "Repartidor";
  return "—";
}

export function getAdminOrderStateLabel(order: AdminOrder): string {
  const envio = String(order.estado_envio || "").toUpperCase();
  if (envio === "NO_ENTREGADO") return "NO ENTREGADO";
  if (envio === "EN_RUTA") return "EN CAMINO";
  return formatStateLabel(order.estado_pedido);
}
