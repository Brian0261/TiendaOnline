import { api } from "../../../../api/http";
import type { Profile, Order, ProfileFormValues } from "../types/customer.types";

export function fetchProfile(): Promise<{ user: Profile }> {
  return api.get<{ user: Profile }>("/auth/me");
}

export function updateProfile(values: ProfileFormValues): Promise<{ user: Profile }> {
  const payload = {
    nombre: values.nombre,
    apellido: values.apellido,
    telefono: values.telefono,
    direccion_principal: values.direccion_principal,
  };
  return api.put<{ user: Profile }>("/auth/me", payload);
}

export function fetchMyOrders(): Promise<Order[]> {
  return api.get<Order[]>("/orders/my");
}
