import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/http";
import type { ApiError } from "../../api/http";
import { addToCart, loadCart } from "../../cart/cartService";
import { normalizeImageUrl, PLACEHOLDER_PRODUCT } from "../../shared/image";
import { AddToCartModal, type AddToCartModalProduct } from "../../shared/AddToCartModal";
import { useState } from "react";

type Product = {
  id: number;
  nombre: string;
  descripcion?: string;
  precio: number;
  imagen?: string;
  stock?: number;
  categoryName?: string;
  brandName?: string;
};

export function ProductDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();

  const [addedOpen, setAddedOpen] = useState(false);
  const [addedProduct, setAddedProduct] = useState<AddToCartModalProduct | null>(null);
  const [addedQty, setAddedQty] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => api.get<Product>(`/products/${id}`),
    enabled: !!id,
  });

  return (
    <div>
      <h1 className="mb-3">Detalle</h1>

      {isLoading && <p>Cargando...</p>}
      {error && <p>Error al cargar detalle.</p>}

      {data && (
        <div className="row g-4" id="product-detail">
          <div className="col-12 col-md-5">
            <img
              src={normalizeImageUrl(data.imagen)}
              alt={data.nombre}
              className="img-fluid rounded"
              style={{ width: "100%", height: 360 }}
              onError={e => {
                (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_PRODUCT;
              }}
            />
          </div>

          <div className="col-12 col-md-7">
            <h2 className="mb-2">{data.nombre}</h2>

            {data.categoryName || data.brandName ? (
              <p className="text-muted mb-2">
                {data.categoryName ? <span className="me-2">{data.categoryName}</span> : null}
                {data.brandName ? <span>{data.brandName}</span> : null}
              </p>
            ) : null}

            <p id="p-desc" className="mb-3">
              {data.descripcion}
            </p>

            <h4 className="mb-3">S/ {Number(data.precio ?? 0).toFixed(2)}</h4>
            {data.stock != null && Number.isFinite(Number(data.stock)) ? <p className="text-muted">Stock: {Number(data.stock)}</p> : null}

            <div className="d-flex gap-2">
              <Link className="btn btn-outline-secondary" to="/products">
                Volver
              </Link>
              <button
                className="btn btn-primary-custom"
                type="button"
                onClick={async () => {
                  try {
                    await addToCart({
                      id: data.id,
                      nombre: data.nombre,
                      precio: data.precio,
                      imagen: data.imagen,
                      descripcion: data.descripcion,
                    });
                  } catch (err) {
                    const apiErr = err as Partial<ApiError>;
                    if (apiErr.status !== 409) throw err;
                  }
                  await qc.invalidateQueries({ queryKey: ["cart", "count"] });
                  await qc.invalidateQueries({ queryKey: ["cart", "items"] });

                  const items = await loadCart();
                  const current = items.find(i => i.product.id === data.id);

                  const parsedStock = Number(data.stock);
                  setAddedProduct({
                    id: data.id,
                    nombre: data.nombre,
                    precio: Number(data.precio ?? 0),
                    imagen: data.imagen,
                    stock: Number.isFinite(parsedStock) ? parsedStock : undefined,
                  });
                  setAddedQty(current?.quantity ?? 1);
                  setAddedOpen(true);
                }}
              >
                Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}

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
