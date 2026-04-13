import { useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { clearCart, loadCart, removeFromCart, setQuantity, type CartItem } from "../../cart/cartService";
import { PLACEHOLDER_PRODUCT } from "../../shared/image";
import type { ApiError } from "../../api/http";

const SHIPPING = 5;

export function CartPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [stockAlerts, setStockAlerts] = useState<Record<number, string>>({});

  const clearStockAlert = useCallback((productId: number) => {
    setStockAlerts(prev => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cart", "items"],
    queryFn: () => loadCart(),
  });

  const items = useMemo(() => data || [], [data]);

  const subtotal = useMemo(() => items.reduce((s, it) => s + Number(it.product.price ?? 0) * Number(it.quantity ?? 0), 0), [items]);
  const total = useMemo(() => subtotal + SHIPPING, [subtotal]);

  const mutateQty = useMutation({
    mutationFn: async (input: { productId: number; qty: number }) => setQuantity(input.productId, input.qty),
    onMutate: async variables => {
      // Cancelar refetches en vuelo para que no sobreescriban nuestro update optimista
      await qc.cancelQueries({ queryKey: ["cart", "items"] });

      // Guardar snapshot para rollback
      const previousItems = qc.getQueryData<CartItem[]>(["cart", "items"]);

      // Actualizar cache optimistamente
      qc.setQueryData<CartItem[]>(["cart", "items"], old => {
        if (!old) return old;
        return old.map(it => (it.product.id === variables.productId ? { ...it, quantity: Math.max(1, variables.qty) } : it));
      });

      clearStockAlert(variables.productId);
      return { previousItems };
    },
    onError: (error: unknown, variables, context) => {
      // Rollback al snapshot previo
      if (context?.previousItems) {
        qc.setQueryData(["cart", "items"], context.previousItems);
      }

      const apiErr = error as Partial<ApiError>;
      if (apiErr.status === 409) {
        const details = apiErr.details as Record<string, unknown> | undefined;
        const detail = details?.detail as Record<string, unknown> | undefined;
        const disponible = detail?.disponible;
        const msg = typeof disponible === "number" ? `Solo hay ${disponible} unidades disponibles` : "Stock insuficiente para la cantidad solicitada";
        setStockAlerts(prev => ({ ...prev, [variables.productId]: msg }));
      }
    },
    onSettled: () => {
      // Siempre sincronizar con servidor después de éxito o error
      qc.invalidateQueries({ queryKey: ["cart", "items"] });
      qc.invalidateQueries({ queryKey: ["cart", "count"] });
    },
  });

  const mutateRemove = useMutation({
    mutationFn: async (productId: number) => removeFromCart(productId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["cart", "items"] });
      await qc.invalidateQueries({ queryKey: ["cart", "count"] });
    },
  });

  const mutateClear = useMutation({
    mutationFn: async () => clearCart(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["cart", "items"] });
      await qc.invalidateQueries({ queryKey: ["cart", "count"] });
    },
  });

  const isEmpty = !isLoading && !error && items.length === 0;

  return (
    <main className="container-fluid py-5">
      <div className="text-center mb-5">
        <h1 className="fw-bold">Mi Carrito de Compras</h1>
        <p className="text-muted">Revisa y gestiona los productos en tu carrito</p>
      </div>

      {isLoading ? <p>Cargando...</p> : null}
      {error ? <p>No se pudo cargar el carrito.</p> : null}

      {isEmpty ? (
        <div className="text-center py-5">
          <i className="fas fa-shopping-cart empty-cart-icon"></i>
          <h3 className="mb-3">Tu carrito está vacío</h3>
          <p className="text-muted mb-4">¡Explora nuestros productos y encuentra lo que necesitas!</p>
          <Link to="/products" className="btn btn-primary-custom btn-lg px-4">
            <i className="fas fa-store me-2"></i> Ver Catálogo
          </Link>
        </div>
      ) : null}

      {!isEmpty && !isLoading && !error ? (
        <div className="row flex-nowrap justify-content-center">
          <div className="cart-list-container p-0 me-4" style={{ overflowX: "auto" }}>
            <div className="cart-table table-responsive">
              <table className="table table-hover align-middle">
                <thead className="table-dark">
                  <tr>
                    <th scope="col" style={{ width: "38%" }}>
                      Producto
                    </th>
                    <th scope="col" style={{ width: "27%" }}>
                      Descripción
                    </th>
                    <th scope="col" className="text-center">
                      Precio Unitario
                    </th>
                    <th scope="col" className="text-center">
                      Cantidad
                    </th>
                    <th scope="col" className="text-center">
                      Subtotal
                    </th>
                    <th scope="col" className="text-center">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const rowSubtotal = Number(it.product.price ?? 0) * Number(it.quantity ?? 0);

                    return (
                      <tr key={it.product.id}>
                        <td>
                          <div className="d-flex align-items-center gap-3">
                            <img
                              src={it.product.image || PLACEHOLDER_PRODUCT}
                              className="cart-item-img"
                              alt={it.product.name}
                              onError={e => {
                                (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_PRODUCT;
                              }}
                            />
                            <div>
                              <h6 className="mb-1">{it.product.name}</h6>
                              <small className="text-muted"></small>
                            </div>
                          </div>
                        </td>
                        <td>{it.product.description || ""}</td>
                        <td className="text-center">S/ {Number(it.product.price ?? 0).toFixed(2)}</td>
                        <td className="text-center">
                          <div className="quantity-control justify-content-center">
                            <button
                              className="btn btn-sm btn-outline-secondary quantity-btn"
                              type="button"
                              onClick={() => mutateQty.mutate({ productId: it.product.id, qty: Number(it.quantity ?? 1) - 1 })}
                              disabled={Number(it.quantity ?? 1) <= 1}
                              aria-label="Disminuir"
                            >
                              <i className="fas fa-minus"></i>
                            </button>
                            <input
                              type="number"
                              min={1}
                              className="form-control form-control-sm quantity-input"
                              value={it.quantity}
                              onChange={e => {
                                const v = Number(e.target.value);
                                if (!Number.isFinite(v)) return;
                                mutateQty.mutate({ productId: it.product.id, qty: v });
                              }}
                            />
                            <button
                              className="btn btn-sm btn-outline-secondary quantity-btn"
                              type="button"
                              onClick={() => mutateQty.mutate({ productId: it.product.id, qty: Number(it.quantity ?? 1) + 1 })}
                              aria-label="Aumentar"
                            >
                              <i className="fas fa-plus"></i>
                            </button>
                          </div>
                          {stockAlerts[it.product.id] ? (
                            <div className="alert alert-warning d-flex align-items-center gap-1 py-1 px-2 mt-1 mb-0 small" role="alert">
                              <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
                              {stockAlerts[it.product.id]}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-center fw-bold">S/ {rowSubtotal.toFixed(2)}</td>
                        <td className="text-center">
                          <button
                            className="btn btn-sm btn-danger"
                            type="button"
                            onClick={() => mutateRemove.mutate(it.product.id)}
                            disabled={mutateRemove.isPending}
                            aria-label="Eliminar"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="col-auto d-flex align-items-start" style={{ paddingLeft: 0 }}>
            <div className="cart-summary">
              <h4 className="mb-4">Resumen de Compra</h4>
              <div className="d-flex justify-content-between mb-2">
                <span>Subtotal:</span>
                <span>S/ {subtotal.toFixed(2)}</span>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Envío:</span>
                <span>S/ {SHIPPING.toFixed(2)}</span>
              </div>
              <hr />
              <div className="d-flex justify-content-between mb-4">
                <h5>Total:</h5>
                <h5>S/ {total.toFixed(2)}</h5>
              </div>
              <button className="btn btn-primary-custom w-100 py-2" type="button" onClick={() => nav("/checkout")}>
                <i className="fas fa-credit-card me-2"></i> Proceder al Pago
              </button>
              <Link to="/products" className="btn btn-outline-secondary w-100 mt-2 py-2">
                <i className="fas fa-arrow-left me-2"></i> Seguir Comprando
              </Link>
              <button
                className="btn btn-outline-danger w-100 mt-3"
                type="button"
                onClick={() => mutateClear.mutate()}
                disabled={mutateClear.isPending}
              >
                Vaciar carrito
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
