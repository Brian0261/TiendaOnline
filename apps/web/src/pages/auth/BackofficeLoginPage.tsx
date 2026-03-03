import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LoginForm } from "./LoginForm";

function dashboardPath(rol: string | undefined): string {
  const r = String(rol || "")
    .trim()
    .toUpperCase();
  if (r === "ADMIN" || r === "ADMINISTRADOR") return "/dashboard/admin";
  if (r === "REPARTIDOR" || r === "DELIVERY" || r === "RIDER") return "/dashboard/delivery";
  return "/dashboard/employee";
}

export function BackofficeLoginPage() {
  const nav = useNavigate();
  const publicStoreUrl = "https://minimarketexpress.shop/?login=1";

  useEffect(() => {
    document.title = "Backoffice | Minimarket Express";
  }, []);

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light px-3">
      <div className="card shadow-sm" style={{ width: "100%", maxWidth: 520 }}>
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-3">
            <img src="/assets/images/logo-bodega.png" alt="Minimarket Express" style={{ height: 38, width: "auto" }} />
          </div>
          <h1 className="h4 mb-1 text-center">Portal interno</h1>
          <p className="text-center fw-semibold mb-2">Backoffice Minimarket Express</p>
          <p className="text-muted text-center mb-4">Acceso exclusivo para empleados, repartidores y administradores.</p>
          <div className="alert alert-warning py-2 px-3 small" role="note">
            Uso exclusivo para personal autorizado. La actividad de acceso puede ser registrada por seguridad.
          </div>

          <LoginForm
            loginChannel="staff"
            submitClassName="btn btn-dark w-100"
            autoFocusEmail
            onSuccess={u => {
              nav(dashboardPath(String(u.rol ?? "")), { replace: true });
            }}
          />

          <div className="mt-3 text-center small">
            <a href={publicStoreUrl}>Volver al acceso de clientes</a>
          </div>
        </div>
      </div>
    </div>
  );
}
