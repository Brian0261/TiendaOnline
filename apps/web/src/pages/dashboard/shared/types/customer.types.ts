export type Profile = {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  direccion_principal?: string | null;
  rol?: string;
};

export type Order = {
  id_pedido: number;
  fecha_creacion: string;
  estado_pedido: string;
  total_pedido: number;
  tipo_comprobante?: string | null;
  numero_comprobante?: string | null;
  estado_comprobante?: string | null;
  productos: Array<{ nombre: string; cantidad: number; precio_unitario_venta: number }>;
};

export type ProfileFormValues = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion_principal: string;
};
