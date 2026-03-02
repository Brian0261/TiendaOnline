import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

const AUTH_EXPIRED_EVENT = "auth:expired";

export function AppLayout() {
  const { pathname } = useLocation();
  const p = pathname.toLowerCase();
  const isStaffDashboard = p.startsWith("/dashboard/admin") || p.startsWith("/dashboard/employee");
  const isBackoffice = p.startsWith("/backoffice/");
  const hidePublicLayout = isStaffDashboard || isBackoffice;
  const isHome = p === "/";
  const [authNotice, setAuthNotice] = useState<string>("");

  useEffect(() => {
    const onAuthExpired = (ev: Event) => {
      const custom = ev as CustomEvent<{ message?: string }>;
      const text = custom.detail?.message || "Tu sesión expiró. Vuelve a iniciar sesión para mantener tu carrito sincronizado.";
      setAuthNotice(text);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired as EventListener);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired as EventListener);
  }, []);

  return (
    <>
      {!hidePublicLayout ? <Navbar /> : null}

      {!hidePublicLayout && authNotice ? (
        <div className="container mt-3">
          <div className="alert alert-warning alert-dismissible fade show mb-0" role="alert">
            {authNotice}
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setAuthNotice("")}></button>
          </div>
        </div>
      ) : null}

      {hidePublicLayout ? (
        <Outlet />
      ) : (
        <main className={isHome ? undefined : "container"} style={isHome ? undefined : { paddingTop: 24, paddingBottom: 24 }}>
          <Outlet />
        </main>
      )}

      {!hidePublicLayout ? <Footer /> : null}
    </>
  );
}
