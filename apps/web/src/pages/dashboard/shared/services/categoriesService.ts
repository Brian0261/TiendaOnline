import { api } from "../../../../api/http";
import type { CategoryRow } from "../types/categories.types";

export function fetchCategories(): Promise<CategoryRow[]> {
  return api.get<CategoryRow[]>("/categories");
}

export function createCategory(nombre: string): Promise<CategoryRow> {
  return api.post<CategoryRow>("/categories", { nombre });
}

export function updateCategory(id: number, nombre: string): Promise<CategoryRow> {
  return api.put<CategoryRow>(`/categories/${id}`, { nombre });
}

export function deleteCategory(id: number): Promise<unknown> {
  return api.del<unknown>(`/categories/${id}`);
}
