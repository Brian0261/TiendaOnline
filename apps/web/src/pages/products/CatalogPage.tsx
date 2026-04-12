import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/http";
import type { ApiError } from "../../api/http";
import { addToCart } from "../../cart/cartService";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { normalizeImageUrl, PLACEHOLDER_PRODUCT } from "../../shared/image";
import { AddToCartModal, type AddToCartModalProduct } from "../../shared/AddToCartModal";
import { loadCart } from "../../cart/cartService";

type Product = {
  id: number;
  nombre: string;
  descripcion?: string;
  precio: number;
  imagen?: string;
  stock?: number;
  activo?: number | boolean;
  id_categoria?: number;
  categoryName?: string;
  brandName?: string;
};

export function CatalogPage() {
  const [params] = useSearchParams();
  const search = (params.get("search") || "").trim();
  const categoryParam = (params.get("category") || "").trim();
  const parsedCategoryId = categoryParam ? Number(categoryParam) : NaN;
  const categoryId = Number.isFinite(parsedCategoryId) && parsedCategoryId > 0 ? parsedCategoryId : null;

  const limitParam = (params.get("limit") || "").trim();
  const parsedLimit = limitParam ? Number(limitParam) : NaN;
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.trunc(parsedLimit))) : 100;

  const pageParam = (params.get("page") || "").trim();
  const parsedPage = pageParam ? Number(pageParam) : NaN;
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.trunc(parsedPage)) : 1;
  const qc = useQueryClient();

  const [stockFilter, setStockFilter] = useState<"all" | "in" | "out">("all");
  const [priceOrder, setPriceOrder] = useState<"none" | "asc" | "desc">("none");

  const [addedOpen, setAddedOpen] = useState(false);
  const [addedProduct, setAddedProduct] = useState<AddToCartModalProduct | null>(null);
  const [addedQty, setAddedQty] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["products", search, categoryId, limit, page],
    queryFn: () => {
      const query = new URLSearchParams();
      if (search) query.set("search", search);
      if (categoryId) query.set("category", String(categoryId));
      query.set("limit", String(limit));
      query.set("page", String(page));

      const url = query.toString() ? `/products?${query.toString()}` : "/products";
      return api.get<Product[]>(url);
    },
  });

  const visible = useMemo(() => {
    const list = (data || []).filter(p => {
      if (categoryId && Number(p.id_categoria ?? 0) !== categoryId) return false;
      if (search && !(p.nombre || "").toLowerCase().includes(search.toLowerCase())) return false;

      const stock = Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0;
      const outOfStock = p.activo === 0 || p.activo === false || stock <= 0;

      if (stockFilter === "in") return !outOfStock;
      if (stockFilter === "out") return outOfStock;
      return true;
    });

    if (priceOrder === "none") return list;

    return list.slice().sort((a, b) => {
      const pa = Number(a.precio ?? 0);
      const pb = Number(b.precio ?? 0);
      return priceOrder === "asc" ? pa - pb : pb - pa;
    });
  }, [categoryId, data, priceOrder, search, stockFilter]);

  return (
    <div>
      <h1 className="mb-3">Catálogo</h1>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-12 col-md-4">
          <label className="form-label">Cantidad (stock)</label>
          <select className="form-select" value={stockFilter} onChange={e => setStockFilter(e.target.value as "all" | "in" | "out")}>
            <option value="all">Todos</option>
            <option value="in">Disponibles</option>
            <option value="out">Agotados</option>
          </select>
        </div>

        <div className="col-12 col-md-4">
          <label className="form-label">Ordenar por precio</label>
          <select className="form-select" value={priceOrder} onChange={e => setPriceOrder(e.target.value as "none" | "asc" | "desc")}>
            <option value="none">Sin orden</option>
            <option value="asc">Menor a mayor</option>
            <option value="desc">Mayor a menor</option>
          </select>
        </div>
      </div>

      {search ? (
        <p className="text-muted">
          Resultados para: <strong>{search}</strong>
        </p>
      ) : null}

      {isLoading && <p>Cargando...</p>}
      {error && <p>Error al cargar productos.</p>}

      {!isLoading && !error && visible.length === 0 ? <p>No se encontraron productos.</p> : null}

      <div className="row g-3">
        {visible.map(p => (
          <div className="col-12 col-sm-6 col-md-4 col-lg-3" key={p.id}>
            <div className="product-card card h-100">
              <Link to={`/products/${p.id}`} className="text-decoration-none text-reset d-block">
                <img
                  src={normalizeImageUrl(p.imagen)}
                  className="card-img-top product-img"
                  alt={p.nombre}
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_PRODUCT;
                  }}
                />
              </Link>

              <div className="card-body d-flex flex-column">
                <Link to={`/products/${p.id}`} className="text-decoration-none text-reset">
                  <h5 className="card-title">{p.nombre}</h5>
                </Link>
                <p className="card-text text-muted">{p.descripcion || "Producto de calidad"}</p>

                {(() => {
                  const stock = Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0;
                  const outOfStock = p.activo === 0 || p.activo === false || stock <= 0;
                  const disabled = outOfStock;

                  return (
                    <div className="mt-auto">
                      <div className="mb-2">
                        {outOfStock ? <span className="text-danger">Agotado</span> : <span className="text-success">Disponible ({stock})</span>}
                      </div>

                      <div className="d-flex justify-content-between align-items-center">
                        <span className="fw-bold text-primary-custom">S/ {Number(p.precio ?? 0).toFixed(2)}</span>
                        <button
                          className="btn btn-sm btn-primary-custom"
                          type="button"
                          disabled={disabled}
                          onClick={async () => {
                            try {
                              await addToCart({ id: p.id, nombre: p.nombre, precio: p.precio, imagen: p.imagen });
                            } catch (err) {
                              const apiErr = err as Partial<ApiError>;
                              if (apiErr.status !== 409) throw err;
                              // Stock exceeded — still open the modal so user sees the limit
                            }
                            await qc.invalidateQueries({ queryKey: ["cart", "count"] });
                            await qc.invalidateQueries({ queryKey: ["cart", "items"] });

                            const items = await loadCart();
                            const current = items.find(i => i.product.id === p.id);

                            const parsedStock = Number(p.stock);
                            setAddedProduct({
                              id: p.id,
                              nombre: p.nombre,
                              precio: Number(p.precio ?? 0),
                              imagen: p.imagen,
                              stock: Number.isFinite(parsedStock) ? parsedStock : undefined,
                            });
                            setAddedQty(current?.quantity ?? 1);
                            setAddedOpen(true);
                          }}
                        >
                          <i className="fas fa-cart-plus" /> Agregar
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <AddToCartModal
        open={addedOpen}
        product={addedProduct}
        initialQty={addedQty}
        onClose={() => {
          setAddedOpen(false);
          setAddedProduct(null);
          setAddedQty(1);
        }}
      />
    </div>
  );
}
