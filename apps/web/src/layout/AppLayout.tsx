import { Outlet, useLocation } from "react-router-dom";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

export function AppLayout() {
  const { pathname } = useLocation();
  const p = pathname.toLowerCase();
  const isStaffDashboard = p.startsWith("/dashboard/admin") || p.startsWith("/dashboard/employee");
  const isHome = p === "/";

  return (
    <>
      {!isStaffDashboard ? <Navbar /> : null}

      {isStaffDashboard ? (
        <Outlet />
      ) : (
        <main className={isHome ? undefined : "container"} style={isHome ? undefined : { paddingTop: 24, paddingBottom: 24 }}>
          <Outlet />
        </main>
      )}

      {!isStaffDashboard ? <Footer /> : null}
    </>
  );
}
