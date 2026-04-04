export type DeliveryDetail = {
  id_pedido: number;
  estado_pedido: string;
  direccion_envio: string | null;
  estado_envio: string | null;
  fecha_asignacion?: string | null;
  fecha_inicio_ruta?: string | null;
  fecha_entrega?: string | null;
  motivo_no_entrega?: string | null;
  cliente: string | null;
  cliente_telefono: string | null;
  id_motorizado: number | null;
  repartidor: string | null;
  repartidor_email: string | null;
  nombre_receptor?: string | null;
  dni_receptor?: string | null;
  observacion?: string | null;
  evidencia_fecha?: string | null;
};

export type DeliveryQueueRow = {
  id_pedido: number;
  fecha_creacion: string;
  estado_pedido: string;
  direccion_envio: string;
  total_pedido: number;
  cliente: string;
  telefono: string | null;
  id_envio: number | null;
  estado_envio: string | null;
  id_motorizado: number | null;
  tipo_entrega: "DOMICILIO" | "RECOJO";
};

export type DeliveryRider = {
  id_motorizado: number;
  nombre: string;
  apellido: string;
  telefono: string;
  licencia: string;
  id_usuario: number | null;
  email_usuario: string;
};

export type Shipment = {
  id_pedido: number;
  fecha_creacion: string;
  estado_pedido: "PREPARADO" | "EN CAMINO" | "ENTREGADO" | string;
  direccion_envio: string;
  total_pedido: number;
  cliente: string;
  telefono: string | null;
  estado_envio: string;
  fecha_asignacion?: string | null;
  fecha_inicio_ruta?: string | null;
  fecha_entrega?: string | null;
  motivo_no_entrega?: string | null;
};
