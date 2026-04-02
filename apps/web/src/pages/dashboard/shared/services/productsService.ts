import { api } from "../../../../api/http";
import type { ProductRow, ProductCatalogOption } from "../types/products.types";

export function fetchProducts(filters: { status: string; search?: string }): Promise<ProductRow[]> {
  const q = new URLSearchParams();
  q.set("status", filters.status);
  if (filters.search?.trim()) q.set("search", filters.search.trim());
  return api.get<ProductRow[]>(`/products?${q.toString()}`);
}

export function fetchProductCategories(): Promise<ProductCatalogOption[]> {
  return api.get<ProductCatalogOption[]>("/products/categories");
}

export function fetchProductBrands(): Promise<ProductCatalogOption[]> {
  return api.get<ProductCatalogOption[]>("/products/brands");
}

export function createProduct(form: FormData): Promise<ProductRow> {
  return api.post<ProductRow>("/products", form);
}

export function updateProduct(id: number, form: FormData): Promise<ProductRow> {
  return api.put<ProductRow>(`/products/${id}`, form);
}

export function deactivateProduct(id: number): Promise<unknown> {
  return api.del<unknown>(`/products/${id}`);
}

export function activateProduct(id: number): Promise<unknown> {
  return api.put<unknown>(`/products/${id}/activate`);
}
