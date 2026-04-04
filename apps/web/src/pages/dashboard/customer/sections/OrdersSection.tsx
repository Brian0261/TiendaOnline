import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "../../../../api/baseUrl";
import { api } from "../../../../api/http";
import { fetchMyOrders } from "../../shared/services/customerService";
import type { Order } from "../../shared/types/customer.types";
import { formatDateTime } from "../../../../shared/datetime";

function getToken(): string | null {
  return localStorage.getItem("auth_token") || localStorage.getItem("token") || null;
}

const statusMap: Record<string, string> = {
  PENDIENTE_PAGO: "danger",
  PENDIENTE: "warning",
  "EN CAMINO": "info",
  PREPARADO: "primary",
  ENTREGADO: "success",
  CANCELADO: "secondary",
  ANULADO: "secondary",
  OBSERVADO: "danger",
};

export function OrdersSection({ visible }: { visible: boolean }) {
  const qc = useQueryClient();
  const reconciledRef = useRef(false);

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["orders", "my"],
    queryFn: fetchMyOrders,
    enabled: visible,
  });

  // Reconciliación post-pago: si volvemos de MP con un orderId pendiente,
  // consultamos el estado del pago para finalizarlo si el webhook no llegó.
  useEffect(() => {
    if (!visible || reconciledRef.current) return;
    const pendingOrder = sessionStorage.getItem("mp_pending_order");
    if (!pendingOrder) return;
    reconciledRef.current = true;
    sessionStorage.removeItem("mp_pending_order");

    api
      .get<{ status: string }>(`/payment/mercadopago/status?orderId=${encodeURIComponent(pendingOrder)}`)
      .then(result => {
        if (result.status === "confirmed") {
          void qc.invalidateQueries({ queryKey: ["orders", "my"] });
        }
      })
      .catch(() => {
        // Silenciar: el webhook puede haber funcionado correctamente
      });
  }, [visible, qc]);

  // SSE: refresca pedidos en tiempo real
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let closed = false;
    let es: EventSource | null = null;

    const connect = () => {
      if (closed) return;
      try {
        es = new EventSource(buildApiUrl(`/orders/stream?token=${encodeURIComponent(token)}`));
        es.addEventListener("order-update", () => {
          void qc.invalidateQueries({ queryKey: ["orders", "my"] });
        });
        es.onerror = () => {
          try {
            es?.close();
          } catch {
            // ignore
          }
          es = null;
          setTimeout(connect, 3000);
        };
      } catch {
        // ignore
      }
    };

    connect();
    return () => {
      closed = true;
      try {
        es?.close();
      } catch {
        // ignore
      }
    };
  }, [qc]);

  const orderRows = useMemo(() => orders || [], [orders]);

  return (
    <section id="section-orders" style={{ display: visible ? "block" : "none" }}>
      <div className="card card-soft">
        <div className="card-body">
          <h5 className="card-title">Mis Compras Online</h5>
          <div id="orders-list" className="orders-table">
            {ordersLoading ? <div className="text-center my-3">Cargando...</div> : null}

            {!ordersLoading && orderRows.length === 0 ? (
              <div className="alert alert-warning text-center mb-0">
                <b>¡Oh! Aún no tienes compras online.</b>
                <br />
                <Link to="/products" className="btn btn-primary mt-2">
                  Comprar
                </Link>
              </div>
            ) : null}

            {!ordersLoading && orderRows.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-striped table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th># Pedido</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Comprobante</th>
                      <th>Total (S/)</th>
                      <th>Productos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.map(o => {
                      const cls = (statusMap[o.estado_pedido] || "secondary").toLowerCase();
                      const dt = formatDateTime(o.fecha_creacion, "datetime");
                      return (
                        <tr key={o.id_pedido}>
                          <td className="fw-semibold">{o.id_pedido}</td>
                          <td className="text-nowrap">
                            {!dt ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <div title={dt.raw}>
                                <div className="fw-semibold">{dt.date}</div>
                                <div className="text-muted small">{dt.time}</div>
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`badge status-badge status-${cls}`}>{o.estado_pedido}</span>
                          </td>
                          <td>
                            {o.numero_comprobante ? (
                              <div>
                                <div className="fw-semibold">{o.numero_comprobante}</div>
                                <div className="text-muted small">{o.tipo_comprobante || "COMPROBANTE"}</div>
                              </div>
                            ) : (
                              <span className="text-muted">Pendiente</span>
                            )}
                          </td>
                          <td className="fw-semibold">{Number(o.total_pedido ?? 0).toFixed(2)}</td>
                          <td className="products-col">{o.productos.map(p => `${p.nombre} x${p.cantidad}`).join("\n")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
