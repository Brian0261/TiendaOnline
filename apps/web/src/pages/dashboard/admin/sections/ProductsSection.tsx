import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "../../shared/utils/errors";
import { money } from "../../shared/utils/format";
import {
  fetchProducts,
  fetchProductCategories,
  fetchProductBrands,
  createProduct as createProductApi,
  updateProduct as updateProductApi,
  deactivateProduct as deactivateProductApi,
  activateProduct as activateProductApi,
} from "../../shared/services/productsService";

import type { JumpIntent } from "../AdminShell";

interface Props {
  jumpIntent: JumpIntent | null;
  onConsumeJump: () => void;
}

export function ProductsSection({ jumpIntent, onConsumeJump }: Props) {
  const qc = useQueryClient();

  /* ── Estado local ────────────────────────────────────────── */
  const [productStatus, setProductStatus] = useState<"active" | "inactive">("active");
  const [productSearch, setProductSearch] = useState<string>("");

  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [createProductDraft, setCreateProductDraft] = useState<{
    name: string;
    description: string;
    price: string;
    stock: string;
    categoryId: string;
    brandId: string;
    image: File | null;
  }>({ name: "", description: "", price: "", stock: "0", categoryId: "", brandId: "", image: null });

  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editProductDraft, setEditProductDraft] = useState<{
    name: string;
    description: string;
    price: string;
    categoryId: string;
    brandId: string;
    image: File | null;
  }>({ name: "", description: "", price: "", categoryId: "", brandId: "", image: null });
  const [editOriginalImageUrl, setEditOriginalImageUrl] = useState<string | null>(null);

  /* ── Jump intent ─────────────────────────────────────────── */
  const [prevJump, setPrevJump] = useState<typeof jumpIntent>(null);
  if (jumpIntent && jumpIntent !== prevJump) {
    setPrevJump(jumpIntent);
    if (jumpIntent.type === "products") setProductStatus("active");
  }

  useEffect(() => {
    if (jumpIntent?.type === "products") onConsumeJump();
  }, [jumpIntent, onConsumeJump]);

  /* ── Image preview (derived values) ──────────────────────── */
  const createImagePreviewUrl = useMemo(
    () => (createProductDraft.image ? URL.createObjectURL(createProductDraft.image) : null),
    [createProductDraft.image],
  );
  useEffect(() => {
    return () => {
      if (createImagePreviewUrl) URL.revokeObjectURL(createImagePreviewUrl);
    };
  }, [createImagePreviewUrl]);

  const editImagePreviewUrl = useMemo(() => (editProductDraft.image ? URL.createObjectURL(editProductDraft.image) : null), [editProductDraft.image]);
  useEffect(() => {
    return () => {
      if (editImagePreviewUrl) URL.revokeObjectURL(editImagePreviewUrl);
    };
  }, [editImagePreviewUrl]);

  /* ── Queries ─────────────────────────────────────────────── */
  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
  } = useQuery({
    queryKey: ["admin", "products", productStatus, productSearch],
    queryFn: () => fetchProducts({ status: productStatus, search: productSearch }),
  });

  const {
    data: productCategories,
    isLoading: productCategoriesLoading,
    error: productCategoriesError,
  } = useQuery({
    queryKey: ["admin", "product-categories"],
    queryFn: fetchProductCategories,
  });

  const {
    data: productBrands,
    isLoading: productBrandsLoading,
    error: productBrandsError,
  } = useQuery({
    queryKey: ["admin", "product-brands"],
    queryFn: fetchProductBrands,
  });

  /* ── Mutaciones ──────────────────────────────────────────── */
  const createProduct = useMutation({
    mutationFn: (form: FormData) => createProductApi(form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      setCreateProductDraft({ name: "", description: "", price: "", stock: "0", categoryId: "", brandId: "", image: null });
      setShowCreateProduct(false);
      setProductStatus("active");
    },
  });

  const updateProduct = useMutation({
    mutationFn: (input: { id: number; form: FormData }) => updateProductApi(input.id, input.form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      setEditingProductId(null);
      setEditProductDraft({ name: "", description: "", price: "", categoryId: "", brandId: "", image: null });
      setEditOriginalImageUrl(null);
    },
  });

  const deactivateProduct = useMutation({
    mutationFn: (id: number) => deactivateProductApi(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });

  const activateProduct = useMutation({
    mutationFn: (id: number) => activateProductApi(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">Productos</h4>
            <div className="text-muted small">Activar / desactivar productos del catálogo.</div>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowCreateProduct(v => !v)}>
              {showCreateProduct ? "Cerrar" : "Nuevo producto"}
            </button>
            <div className="btn-group btn-group-sm" role="group" aria-label="Estado">
              <button
                type="button"
                className={`btn btn-outline-secondary ${productStatus === "active" ? "active" : ""}`}
                onClick={() => setProductStatus("active")}
              >
                Activos
              </button>
              <button
                type="button"
                className={`btn btn-outline-secondary ${productStatus === "inactive" ? "active" : ""}`}
                onClick={() => setProductStatus("inactive")}
              >
                Inactivos
              </button>
            </div>
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ width: 240 }}
              placeholder="Buscar..."
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Crear producto ──────────────────────────────────── */}
        {showCreateProduct ? (
          <div className="border rounded p-3 mb-3">
            <div className="fw-semibold mb-2">Crear producto</div>

            {productCategoriesError ? <div className="alert alert-danger">{getErrorMessage(productCategoriesError)}</div> : null}
            {productBrandsError ? <div className="alert alert-danger">{getErrorMessage(productBrandsError)}</div> : null}
            {createProduct.isError ? <div className="alert alert-danger">{getErrorMessage(createProduct.error)}</div> : null}

            <form
              className="row g-2"
              onSubmit={e => {
                e.preventDefault();

                const name = createProductDraft.name.trim();
                const description = createProductDraft.description.trim();
                const price = createProductDraft.price.trim();
                const stock = createProductDraft.stock.trim();
                const categoryId = createProductDraft.categoryId.trim();
                const brandId = createProductDraft.brandId.trim();

                if (!name || !price || !categoryId || !brandId) return;

                const form = new FormData();
                form.append("name", name);
                form.append("description", description);
                form.append("price", price);
                form.append("stock", stock || "0");
                form.append("categoryId", categoryId);
                form.append("brandId", brandId);
                if (createProductDraft.image) form.append("image", createProductDraft.image);

                createProduct.mutate(form);
              }}
            >
              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Nombre</label>
                <input
                  className="form-control form-control-sm"
                  value={createProductDraft.name}
                  required
                  onChange={e => setCreateProductDraft(s => ({ ...s, name: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Precio</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="form-control form-control-sm"
                  value={createProductDraft.price}
                  required
                  onChange={e => setCreateProductDraft(s => ({ ...s, price: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Stock inicial</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="form-control form-control-sm"
                  value={createProductDraft.stock}
                  onChange={e => setCreateProductDraft(s => ({ ...s, stock: e.target.value }))}
                />
              </div>

              <div className="col-12">
                <label className="form-label mb-1">Descripción</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  value={createProductDraft.description}
                  onChange={e => setCreateProductDraft(s => ({ ...s, description: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Categoría</label>
                <select
                  className="form-select form-select-sm"
                  value={createProductDraft.categoryId}
                  required
                  disabled={productCategoriesLoading || !productCategories?.length}
                  onChange={e => setCreateProductDraft(s => ({ ...s, categoryId: e.target.value }))}
                >
                  <option value="">{productCategoriesLoading ? "Cargando..." : "Selecciona"}</option>
                  {productCategories?.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Marca</label>
                <select
                  className="form-select form-select-sm"
                  value={createProductDraft.brandId}
                  required
                  disabled={productBrandsLoading || !productBrands?.length}
                  onChange={e => setCreateProductDraft(s => ({ ...s, brandId: e.target.value }))}
                >
                  <option value="">{productBrandsLoading ? "Cargando..." : "Selecciona"}</option>
                  {productBrands?.map(b => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Imagen (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="form-control form-control-sm"
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    setCreateProductDraft(s => ({ ...s, image: f }));
                  }}
                />
                <div className="text-muted small mt-1">Si no subes imagen, se usará un placeholder.</div>
              </div>

              {createImagePreviewUrl ? (
                <div className="col-12 col-md-6">
                  <label className="form-label mb-1">Vista previa</label>
                  <div>
                    <img
                      src={createImagePreviewUrl}
                      alt="Vista previa"
                      className="img-thumbnail"
                      style={{ maxWidth: 220, maxHeight: 220, objectFit: "cover" }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="col-12 d-flex gap-2 justify-content-end">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowCreateProduct(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-sm btn-success" disabled={createProduct.isPending}>
                  {createProduct.isPending ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* ── Editar producto ─────────────────────────────────── */}
        {editingProductId != null ? (
          <div className="border rounded p-3 mb-3">
            <div className="fw-semibold mb-2">Editar producto</div>

            {productCategoriesError ? <div className="alert alert-danger">{getErrorMessage(productCategoriesError)}</div> : null}
            {productBrandsError ? <div className="alert alert-danger">{getErrorMessage(productBrandsError)}</div> : null}
            {updateProduct.isError ? <div className="alert alert-danger">{getErrorMessage(updateProduct.error)}</div> : null}

            <form
              className="row g-2"
              onSubmit={e => {
                e.preventDefault();

                const name = editProductDraft.name.trim();
                const description = editProductDraft.description.trim();
                const price = editProductDraft.price.trim();
                const categoryId = editProductDraft.categoryId.trim();
                const brandId = editProductDraft.brandId.trim();

                if (!name || !price || !categoryId || !brandId) return;

                const form = new FormData();
                form.append("name", name);
                form.append("description", description);
                form.append("price", price);
                form.append("categoryId", categoryId);
                form.append("brandId", brandId);
                if (editProductDraft.image) form.append("image", editProductDraft.image);

                updateProduct.mutate({ id: editingProductId, form });
              }}
            >
              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Nombre</label>
                <input
                  className="form-control form-control-sm"
                  value={editProductDraft.name}
                  required
                  onChange={e => setEditProductDraft(s => ({ ...s, name: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Precio</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="form-control form-control-sm"
                  value={editProductDraft.price}
                  required
                  onChange={e => setEditProductDraft(s => ({ ...s, price: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Stock</label>
                <input type="text" className="form-control form-control-sm" value="Gestionar en Inventario" disabled />
              </div>

              <div className="col-12">
                <label className="form-label mb-1">Descripción</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  value={editProductDraft.description}
                  onChange={e => setEditProductDraft(s => ({ ...s, description: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Categoría</label>
                <select
                  className="form-select form-select-sm"
                  value={editProductDraft.categoryId}
                  required
                  disabled={productCategoriesLoading || !productCategories?.length}
                  onChange={e => setEditProductDraft(s => ({ ...s, categoryId: e.target.value }))}
                >
                  <option value="">{productCategoriesLoading ? "Cargando..." : "Selecciona"}</option>
                  {productCategories?.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Marca</label>
                <select
                  className="form-select form-select-sm"
                  value={editProductDraft.brandId}
                  required
                  disabled={productBrandsLoading || !productBrands?.length}
                  onChange={e => setEditProductDraft(s => ({ ...s, brandId: e.target.value }))}
                >
                  <option value="">{productBrandsLoading ? "Cargando..." : "Selecciona"}</option>
                  {productBrands?.map(b => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Imagen (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="form-control form-control-sm"
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    setEditProductDraft(s => ({ ...s, image: f }));
                  }}
                />
                <div className="text-muted small mt-1">Si no subes imagen, se mantiene la actual.</div>
              </div>

              {editImagePreviewUrl || editOriginalImageUrl ? (
                <div className="col-12 col-md-6">
                  <label className="form-label mb-1">Vista previa</label>
                  <div className="d-flex align-items-center gap-2">
                    <img
                      src={editImagePreviewUrl || editOriginalImageUrl || ""}
                      alt="Vista previa"
                      className="img-thumbnail"
                      style={{ maxWidth: 220, maxHeight: 220, objectFit: "cover" }}
                    />
                    {editImagePreviewUrl ? <div className="text-muted small">Nueva imagen seleccionada</div> : null}
                  </div>
                </div>
              ) : null}

              <div className="col-12 d-flex gap-2 justify-content-end">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={updateProduct.isPending}
                  onClick={() => {
                    setEditingProductId(null);
                    setEditProductDraft({ name: "", description: "", price: "", categoryId: "", brandId: "", image: null });
                    setEditOriginalImageUrl(null);
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-sm btn-success" disabled={updateProduct.isPending}>
                  {updateProduct.isPending ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* ── Errores globales ────────────────────────────────── */}
        {productsError ? <div className="alert alert-danger">{getErrorMessage(productsError)}</div> : null}
        {deactivateProduct.isError ? <div className="alert alert-danger">{getErrorMessage(deactivateProduct.error)}</div> : null}
        {activateProduct.isError ? <div className="alert alert-danger">{getErrorMessage(activateProduct.error)}</div> : null}

        {/* ── Tabla ───────────────────────────────────────────── */}
        {productsLoading ? <div className="text-muted">Cargando...</div> : null}

        {!productsLoading && products && products.length === 0 ? <div className="alert alert-info mb-0">Sin productos.</div> : null}

        {!productsLoading && products && products.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th>Marca</th>
                  <th>Categoría</th>
                  <th className="text-end">Precio</th>
                  <th className="text-end">Stock</th>
                  <th className="text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td className="fw-semibold">{p.id}</td>
                    <td>{p.nombre}</td>
                    <td>{p.brandName || "—"}</td>
                    <td>{p.categoryName || "—"}</td>
                    <td className="text-end">{money.format(Number(p.precio ?? 0))}</td>
                    <td className="text-end">{p.stock ?? 0}</td>
                    <td className="text-end">
                      <div className="d-flex gap-2 justify-content-end flex-wrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => {
                            setShowCreateProduct(false);
                            setEditingProductId(p.id);
                            setEditOriginalImageUrl(p.imagen || null);
                            setEditProductDraft({
                              name: String(p.nombre || ""),
                              description: String(p.descripcion || ""),
                              price: String(p.precio ?? ""),
                              categoryId: String(p.id_categoria ?? ""),
                              brandId: String(p.id_marca ?? ""),
                              image: null,
                            });
                          }}
                        >
                          Editar
                        </button>
                        {productStatus === "active" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={deactivateProduct.isPending}
                            onClick={() => deactivateProduct.mutate(p.id)}
                          >
                            {deactivateProduct.isPending ? "Procesando..." : "Desactivar"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success"
                            disabled={activateProduct.isPending}
                            onClick={() => activateProduct.mutate(p.id)}
                          >
                            {activateProduct.isPending ? "Procesando..." : "Activar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
