import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LoginForm } from "../pages/auth/LoginForm";

type LoginModalProps = {
  open: boolean;
  onClose: () => void;
  onLoggedIn: (user: { rol?: unknown }) => void;
};

export function LoginModal({ open, onClose, onLoggedIn }: LoginModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="modal fade show login-modal" role="dialog" aria-modal="true" aria-labelledby="loginModalLabel" style={{ display: "block" }}>
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }}>
          <div className="modal-content">
            <div className="modal-header border-0 pb-0">
              <button type="button" className="btn-close ms-auto" aria-label="Cerrar" onClick={onClose}></button>
            </div>

            <div className="modal-body pt-0">
              <div className="d-flex justify-content-center mb-3">
                <img src="/assets/images/logo-bodega.png" alt="Minimarket Express" style={{ height: 34, width: "auto" }} />
              </div>

              <h4 className="mb-1" id="loginModalLabel">
                Inicia sesión para comprar
              </h4>

              <div className="text-muted mb-3" style={{ fontSize: "0.95rem" }}>
                Acceso para clientes de la tienda.
              </div>

              <LoginForm
                loginChannel="customer"
                submitClassName="btn btn-dark w-100 rounded-pill"
                onSuccess={u => {
                  onClose();
                  onLoggedIn(u);
                }}
              />

              <div className="mt-2 small text-muted">
                ¿Eres empleado o administrador? <a href="https://backoffice.minimarketexpress.shop/login">Ingresa al portal interno</a>
              </div>

              <div className="mt-3">
                <Link className="d-inline-block" to="/forgot-password" onClick={onClose}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              <div className="mt-3 text-center">
                <span className="text-muted">¿Aún no tienes cuenta? </span>
                <Link to="/register" onClick={onClose}>
                  Regístrate
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
  );
}
