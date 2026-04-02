import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/useAuth";
import { fetchEmployeeKpis } from "../shared/services/ordersService";
import { getErrorMessage } from "../shared/utils/errors";
import type { EmployeeKpis } from "../shared/types/orders.types";
import { PendingSection } from "./sections/PendingSection";
import { StatusLogSection } from "./sections/StatusLogSection";
import { InventorySection } from "./sections/InventorySection";
import { DispatchSection } from "./sections/DispatchSection";
import { DeliverySection } from "./sections/DeliverySection";

type Section = "pending" | "status-log" | "inventory" | "dispatch" | "delivery";

const SECTION_TITLES: Record<Section, string> = {
  pending: "Pedidos pendientes",
  "status-log": "Historial de estados",
  inventory: "Inventario",
  dispatch: "Despachos",
  delivery: "Asignación de reparto",
};

export function EmployeeShell() {
  const nav = useNavigate();
  const { logout, user } = useAuth();
  const [section, setSection] = useState<Section>("pending");

  const employeeDisplayName = `${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim() || "Usuario";

  useEffect(() => {
    document.body.classList.add("d-flex");
    return () => {
      document.body.classList.remove("d-flex");
    };
  }, []);

  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
  } = useQuery<EmployeeKpis>({
    queryKey: ["employee", "kpis"],
    queryFn: fetchEmployeeKpis,
  });

  return (
    <div className="d-flex">
      <aside id="sidebar" className="d-flex flex-column flex-shrink-0 p-3">
        <div className="text-center mb-4">
          <img src="/assets/images/logo-bodega.png" alt="logo" className="rounded-circle mb-2" width={80} height={80} />
          <h5 className="m-0 fw-semibold text-truncate" title={employeeDisplayName}>
            {employeeDisplayName}
          </h5>
          <div className="small text-muted">Empleado</div>
        </div>

        <div className="menu-title">Panel Empleado</div>
        <ul className="nav nav-pills flex-column mb-auto">
          <li className="nav-item">
            <button className={`nav-link ${section === "pending" ? "active" : ""}`} onClick={() => setSection("pending")}>
              <i className="fa-solid fa-clipboard-list"></i> Pedidos pendientes
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "dispatch" ? "active" : ""}`} onClick={() => setSection("dispatch")}>
              <i className="fa-solid fa-truck"></i> Despachos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "delivery" ? "active" : ""}`} onClick={() => setSection("delivery")}>
              <i className="fa-solid fa-motorcycle"></i> Asignación de reparto
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "inventory" ? "active" : ""}`} onClick={() => setSection("inventory")}>
              <i className="fa-solid fa-boxes-stacked"></i> Inventario
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "status-log" ? "active" : ""}`} onClick={() => setSection("status-log")}>
              <i className="fa-solid fa-list"></i> Historial de estados
            </button>
          </li>
          <li className="mt-auto">
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
          </li>
        </ul>
      </aside>

      <main className="flex-grow-1 p-4">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">{SECTION_TITLES[section]}</h4>
            <div className="text-muted small">Gestión operativa de pedidos y su trazabilidad.</div>
          </div>

          <div className="d-flex align-items-center justify-content-end gap-2 flex-wrap">
            <span className="badge bg-light text-dark">Pendientes: {kpisLoading ? "…" : (kpis?.pendientes ?? "—")}</span>
            <span className="badge bg-light text-dark">En camino: {kpisLoading ? "…" : (kpis?.encamino ?? "—")}</span>
            <span className="badge bg-light text-dark">Entregados hoy: {kpisLoading ? "…" : (kpis?.entregadosHoy ?? "—")}</span>
            <span className="small text-muted">KPIs globales (no se filtran por esta vista)</span>
          </div>
        </div>

        {kpisError ? <div className="alert alert-warning">{getErrorMessage(kpisError)}</div> : null}

        {section === "pending" ? <PendingSection /> : null}
        {section === "status-log" ? <StatusLogSection /> : null}
        {section === "inventory" ? <InventorySection /> : null}
        {section === "dispatch" ? <DispatchSection /> : null}
        {section === "delivery" ? <DeliverySection /> : null}
      </main>
    </div>
  );
}
