import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeImageUrl, PLACEHOLDER_PRODUCT } from "./image";
import { setQuantity } from "../cart/cartService";

export type AddToCartModalProduct = {
  id: number;
  nombre: string;
  precio: number;
  imagen?: string | null;
  stock?: number;
};

type Props = {
  open: boolean;
  product: AddToCartModalProduct | null;
  initialQty: number;
  onClose: () => void;
};

export function AddToCartModal({ open, product, initialQty, onClose }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [qty, setQty] = useState<number>(Math.max(1, Math.floor(initialQty || 1)));
  const [busy, setBusy] = useState(false);
  const [stockWarning, setStockWarning] = useState<string | null>(null);

  const maxByStock = typeof product?.stock === "number" ? Math.max(0, Math.floor(product.stock)) : null;

  useEffect(() => {
    if (!open) return;
    const q = Math.max(1, Math.floor(initialQty || 1));
    setQty(q);
    if (maxByStock != null && q >= maxByStock) {
      setStockWarning(`Solo hay ${maxByStock} unidades disponibles`);
    } else {
      setStockWarning(null);
    }
  }, [initialQty, open, maxByStock]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const canDecrement = qty > 1 && !busy;
  const canIncrement = !busy && (maxByStock == null ? true : qty < maxByStock);

  const imageSrc = useMemo(() => {
    if (!product) return PLACEHOLDER_PRODUCT;
    return normalizeImageUrl(product.imagen);
  }, [product]);

  const changeQty = async (nextQty: number) => {
    if (!product) return;
    const q = Math.max(1, Math.floor(nextQty));
    if (maxByStock != null && q > maxByStock) {
      setStockWarning(`Solo hay ${maxByStock} unidades disponibles`);
      return;
    }
    setStockWarning(null);

    try {
      setBusy(true);
      setQty(q);
      await setQuantity(product.id, q);
      await qc.invalidateQueries({ queryKey: ["cart", "count"] });
      await qc.invalidateQueries({ queryKey: ["cart", "items"] });
    } finally {
      setBusy(false);
    }
  };

  if (!open || !product) return null;

  return (
    <>
      <div className="modal fade show" role="dialog" aria-modal="true" style={{ display: "block" }}>
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 680 }}>
          <div className="modal-content">
            <div className="modal-header">
              <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                <span className="text-success" aria-hidden="true">
                  <i className="fas fa-check-circle" />
                </span>
                <div className="fw-semibold text-truncate">Producto agregado a tu Carro</div>
              </div>
              <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
            </div>

            <div className="modal-body">
              <div className="d-flex align-items-center gap-3">
                <img
                  src={imageSrc}
                  alt={product.nombre}
                  className="rounded border flex-shrink-0"
                  style={{ width: 56, height: 56, objectFit: "contain" }}
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_PRODUCT;
                  }}
                />

                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="small text-truncate">{product.nombre}</div>
                </div>

                <div className="text-muted text-nowrap">S/ {Number(product.precio ?? 0).toFixed(2)}</div>

                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => changeQty(qty - 1)}
                    disabled={!canDecrement}
                    aria-label="Disminuir"
                  >
                    −
                  </button>
                  <div className="px-2" style={{ minWidth: 28, textAlign: "center" }}>
                    {qty}
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => changeQty(qty + 1)}
                    disabled={!canIncrement}
                    aria-label="Aumentar"
                  >
                    +
                  </button>
                </div>

                {typeof maxByStock === "number" ? (
                  <div className="small text-muted text-nowrap" style={{ marginLeft: 8 }}>
                    Stock: {maxByStock}
                  </div>
                ) : null}
              </div>

              {stockWarning ? (
                <div className="alert alert-warning d-flex align-items-center gap-2 py-2 px-3 mt-2 mb-0 small" role="alert">
                  <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
                  {stockWarning}
                </div>
              ) : null}
            </div>

            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn btn-link" onClick={onClose} disabled={busy}>
                Seguir comprando
              </button>
              <button
                type="button"
                className="btn btn-primary-custom"
                onClick={() => {
                  onClose();
                  nav("/cart");
                }}
                disabled={busy}
              >
                Ir al Carro
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
  );
}
