import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoginForm } from "./LoginForm";

function dashboardPath(rol: string | undefined): string {
  const r = String(rol || "")
    .trim()
    .toUpperCase();
  if (r === "ADMIN" || r === "ADMINISTRADOR") return "/dashboard/admin";
  return "/dashboard/employee";
}

export function BackofficeLoginPage() {
  const nav = useNavigate();

  useEffect(() => {
    document.title = "Portal interno | Minimarket Express";
  }, []);

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light px-3">
      <div className="card shadow-sm" style={{ width: "100%", maxWidth: 520 }}>
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-3">
            <img src="/assets/images/logo-bodega.png" alt="Minimarket Express" style={{ height: 38, width: "auto" }} />
          </div>
          <h1 className="h4 mb-1 text-center">Portal interno</h1>
          <p className="text-muted text-center mb-4">Acceso exclusivo para empleados y administradores.</p>

          <LoginForm
            loginChannel="staff"
            submitClassName="btn btn-dark w-100"
            onSuccess={u => {
              nav(dashboardPath(String(u.rol ?? "")), { replace: true });
            }}
          />

          <div className="mt-3 text-center small">
            <Link to="/?login=1">Volver al acceso de clientes</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
