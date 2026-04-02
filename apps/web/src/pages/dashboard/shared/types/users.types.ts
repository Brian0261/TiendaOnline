import type { PaginatedResponse } from "./common.types";

export type ManagedUserRole = "" | "CLIENTE" | "EMPLEADO" | "REPARTIDOR";
export type ManagedUserState = "" | "ACTIVO" | "INACTIVO";

export type ManagedUserRow = {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  direccion_principal?: string | null;
  rol: ManagedUserRole;
  estado: ManagedUserState;
  email_verificado: boolean;
  fecha_registro: string;
  id_motorizado?: number | null;
  licencia?: string | null;
};

export type ManagedUsersPaginatedResponse = PaginatedResponse<ManagedUserRow>;
