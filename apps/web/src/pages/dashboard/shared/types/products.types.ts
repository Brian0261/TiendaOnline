export type ProductRow = {
  id: number;
  nombre: string;
  descripcion?: string;
  precio: number;
  imagen: string;
  stock: number;
  activo: boolean;
  id_categoria?: number;
  categoryName?: string;
  id_marca?: number;
  brandName?: string;
};

export type ProductCatalogOption = {
  id: number;
  name: string;
};
