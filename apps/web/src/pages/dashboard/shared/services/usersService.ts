import { api } from "../../../../api/http";
import type { ManagedUserRow, ManagedUsersPaginatedResponse } from "../types/users.types";
import { normalizeManagedUserRole, normalizeManagedUserState } from "../utils/user-helpers";

export function fetchUsers(filters: {
  page: number;
  pageSize?: string;
  search?: string;
  rol?: string;
  estado?: string;
}): Promise<ManagedUsersPaginatedResponse> {
  const q = new URLSearchParams();
  q.set("page", String(filters.page));
  q.set("pageSize", filters.pageSize || "20");
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  if (normalizeManagedUserRole(filters.rol)) q.set("rol", filters.rol!);
  if (normalizeManagedUserState(filters.estado)) q.set("estado", filters.estado!);
  return api.get<ManagedUsersPaginatedResponse>(`/users?${q.toString()}`);
}

export function createEmployee(payload: {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion_principal: string;
  contrasena: string;
}): Promise<ManagedUserRow> {
  return api.post<ManagedUserRow>("/users/employees", payload);
}

export function createRider(payload: {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion_principal: string;
  contrasena: string;
  licencia: string;
}): Promise<ManagedUserRow> {
  return api.post<ManagedUserRow>("/users/riders", payload);
}

export function updateUser(payload: {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion_principal: string;
  licencia: string;
  rol: string;
}): Promise<ManagedUserRow> {
  const { id_usuario, ...body } = payload;
  return api.put<ManagedUserRow>(`/users/${id_usuario}`, body);
}

export function deactivateUser(id_usuario: number): Promise<{ ok: true; id_usuario: number; estado: string }> {
  return api.patch<{ ok: true; id_usuario: number; estado: string }>(`/users/${id_usuario}/deactivate`);
}

export function reactivateUser(id_usuario: number): Promise<{ ok: true; id_usuario: number; estado: string }> {
  return api.patch<{ ok: true; id_usuario: number; estado: string }>(`/users/${id_usuario}/reactivate`);
}
