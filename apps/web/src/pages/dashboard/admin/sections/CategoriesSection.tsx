import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCategories,
  createCategory as createCategorySvc,
  updateCategory as updateCategorySvc,
  deleteCategory as deleteCategorySvc,
} from "../../shared/services/categoriesService";
import { getErrorMessage } from "../../shared/utils/errors";
import type { CategoryRow } from "../../shared/types/categories.types";

export function CategoriesSection() {
  const qc = useQueryClient();

  const [categoryNewName, setCategoryNewName] = useState<string>("");
  const [categoryEditingId, setCategoryEditingId] = useState<number | null>(null);
  const [categoryEditingName, setCategoryEditingName] = useState<string>("");
  const [categoryConfirmDeleteId, setCategoryConfirmDeleteId] = useState<number | null>(null);

  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery<CategoryRow[]>({
    queryKey: ["admin", "categories"],
    queryFn: fetchCategories,
  });

  const createCategory = useMutation({
    mutationFn: (nombre: string) => createCategorySvc(nombre),
    onSuccess: async () => {
      setCategoryNewName("");
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  const updateCategory = useMutation({
    mutationFn: (input: { id: number; nombre: string }) => updateCategorySvc(input.id, input.nombre),
    onSuccess: async () => {
      setCategoryEditingId(null);
      setCategoryEditingName("");
      setCategoryConfirmDeleteId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => deleteCategorySvc(id),
    onSuccess: async () => {
      setCategoryConfirmDeleteId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">Categorías</h4>
            <div className="text-muted small">Administra la clasificación del catálogo y su uso en productos.</div>
          </div>
        </div>

        {categoriesError ? <div className="alert alert-danger">{getErrorMessage(categoriesError)}</div> : null}
        {createCategory.isError ? <div className="alert alert-danger">{getErrorMessage(createCategory.error)}</div> : null}
        {updateCategory.isError ? <div className="alert alert-danger">{getErrorMessage(updateCategory.error)}</div> : null}
        {deleteCategory.isError ? <div className="alert alert-danger">{getErrorMessage(deleteCategory.error)}</div> : null}

        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            if (!categoryNewName.trim()) return;
            createCategory.mutate(categoryNewName.trim());
          }}
        >
          <div className="col-12 col-md-8">
            <label className="form-label" htmlFor="cat-new">
              Nueva categoría
            </label>
            <input
              id="cat-new"
              type="text"
              className="form-control form-control-sm"
              value={categoryNewName}
              onChange={e => setCategoryNewName(e.target.value)}
              placeholder="Ej. Accesorios"
            />
          </div>
          <div className="col-12 col-md-4">
            <button type="submit" className="btn btn-sm btn-primary w-100" disabled={createCategory.isPending}>
              {createCategory.isPending ? "Guardando..." : "Crear"}
            </button>
          </div>
        </form>

        {categoriesLoading ? <div className="text-muted">Cargando...</div> : null}

        {!categoriesLoading && categories && categories.length === 0 ? <div className="alert alert-info mb-0">Sin categorías.</div> : null}

        {!categoriesLoading && categories && categories.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th style={{ width: 170 }}>Productos</th>
                  <th className="text-end" style={{ width: 240 }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map(c => {
                  const editing = categoryEditingId === c.id;
                  const confirmingDelete = categoryConfirmDeleteId === c.id;
                  const totalProductos = Number(c.total_productos || 0);
                  const canDelete = totalProductos === 0;
                  return (
                    <tr key={c.id}>
                      <td>
                        {editing ? (
                          <input
                            className="form-control form-control-sm"
                            value={categoryEditingName}
                            onChange={e => setCategoryEditingName(e.target.value)}
                          />
                        ) : (
                          c.nombre
                        )}
                      </td>
                      <td>
                        <span className={`badge ${totalProductos > 0 ? "text-bg-secondary" : "text-bg-light"}`}>
                          {totalProductos} {totalProductos === 1 ? "producto" : "productos"}
                        </span>
                      </td>
                      <td className="text-end">
                        {!editing && !confirmingDelete ? (
                          <div className="d-flex gap-2 justify-content-end flex-wrap">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => {
                                setCategoryEditingId(c.id);
                                setCategoryEditingName(c.nombre);
                                setCategoryConfirmDeleteId(null);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={deleteCategory.isPending || !canDelete}
                              title={canDelete ? "Eliminar categoría" : "No se puede eliminar: tiene productos asociados"}
                              onClick={() => {
                                if (!canDelete) return;
                                setCategoryConfirmDeleteId(c.id);
                              }}
                            >
                              Eliminar
                            </button>
                            {!canDelete ? <div className="w-100 small text-muted">Tiene productos asociados.</div> : null}
                          </div>
                        ) : null}

                        {editing ? (
                          <div className="d-flex gap-2 justify-content-end flex-wrap">
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={updateCategory.isPending}
                              onClick={() => {
                                if (!categoryEditingName.trim()) return;
                                updateCategory.mutate({ id: c.id, nombre: categoryEditingName.trim() });
                              }}
                            >
                              {updateCategory.isPending ? "Guardando..." : "Guardar"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => {
                                setCategoryEditingId(null);
                                setCategoryEditingName("");
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : null}

                        {confirmingDelete ? (
                          <div className="d-flex flex-column align-items-end gap-2">
                            <div className="small text-muted">¿Eliminar categoría "{c.nombre}"?</div>
                            <div className="d-flex gap-2 justify-content-end flex-wrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                disabled={deleteCategory.isPending}
                                onClick={() => {
                                  deleteCategory.mutate(c.id);
                                }}
                              >
                                {deleteCategory.isPending ? "Eliminando..." : "Confirmar"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={deleteCategory.isPending}
                                onClick={() => {
                                  setCategoryConfirmDeleteId(null);
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
