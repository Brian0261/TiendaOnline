import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/useAuth";
import { ShipmentsSection } from "./sections/ShipmentsSection";

export function DeliveryShell() {
  const nav = useNavigate();
  const { logout, user } = useAuth();
  const deliveryDisplayName = `${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim() || "Usuario";

  return (
    <div className="d-flex">
      <aside id="sidebar" className="d-flex flex-column flex-shrink-0 p-3">
        <div className="text-center mb-4">
          <img src="/assets/images/logo-bodega.png" alt="logo" className="rounded-circle mb-2" width={80} height={80} />
          <h5 className="m-0 fw-semibold text-truncate" title={deliveryDisplayName}>
            {deliveryDisplayName}
          </h5>
          <div className="small text-muted">Repartidor</div>
        </div>

        <div className="menu-title">Panel Reparto</div>

        <div className="mt-auto">
          <button
            id="logout-btn"
            className="btn logout-btn w-100 d-inline-flex align-items-center justify-content-center"
            onClick={() => {
              logout();
              nav("/", { replace: true });
            }}
          >
            <i className="bi bi-box-arrow-right me-2"></i>
            Salir
          </button>
        </div>
      </aside>

      <main className="flex-grow-1 p-4">
        <ShipmentsSection />
      </main>
    </div>
  );
}
