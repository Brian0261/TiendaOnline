export type Role = "CLIENTE" | "EMPLEADO" | "ADMINISTRADOR" | "REPARTIDOR";

export type AuthUser = {
  id_usuario?: number;
  email?: string;
  nombre?: string;
  apellido?: string;
  rol?: Role | string;
};
