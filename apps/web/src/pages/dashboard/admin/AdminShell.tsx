import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/useAuth";
import { downloadApiFile } from "../../../api/download";
import type { AuditRow, AuditModule } from "../shared/types/audit.types";
import { getAuditRowModule } from "../shared/utils/audit-helpers";
import { toDateInputValue } from "../shared/utils/format";

import { DashboardSection } from "./sections/DashboardSection";
import { AuditSection } from "./sections/AuditSection";
import { InventorySection } from "./sections/InventorySection";
import { DispatchSection } from "./sections/DispatchSection";
import { CategoriesSection } from "./sections/CategoriesSection";
import { UsersSection } from "./sections/UsersSection";
import { ProductsSection } from "./sections/ProductsSection";
import { ReportsSection } from "./sections/ReportsSection";
import { OrdersSection } from "./sections/OrdersSection";

export type Section = "dashboard" | "products" | "reports" | "orders" | "audit" | "inventory" | "dispatch" | "categories" | "users";

export type JumpIntent =
  | { type: "orders"; search?: string; deliveryDetailOrderId?: number }
  | { type: "inventory" }
  | { type: "dispatch" }
  | { type: "products" }
  | { type: "categories" }
  | { type: "reports" }
  | { type: "dashboard" };

export function AdminShell() {
  const nav = useNavigate();
  const { logout, user } = useAuth();
  const [section, setSection] = useState<Section>("dashboard");
  const adminDisplayName = `${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim() || "Usuario";

  const [exportingGeneric, setExportingGeneric] = useState(false);
  const [genericExportError, setGenericExportError] = useState<string | null>(null);

  const exportFile = useCallback(async (path: string, fallbackFilename: string): Promise<void> => {
    try {
      setGenericExportError(null);
      setExportingGeneric(true);
      await downloadApiFile(path, fallbackFilename);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al exportar";
      setGenericExportError(msg);
    } finally {
      setExportingGeneric(false);
    }
  }, []);

  const [jumpIntent, setJumpIntent] = useState<JumpIntent | null>(null);

  const now = useMemo(() => new Date(), []);
  const dispatchDefaults = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { fechaInicio: toDateInputValue(start), fechaFin: toDateInputValue(end), search: "" };
  }, []);

  const jumpFromAudit = useCallback((row: AuditRow) => {
    const moduleValue: AuditModule = getAuditRowModule(row);

    if (moduleValue === "PEDIDO" || moduleValue === "DELIVERY") {
      const orderId = Number(row.id_pedido || row.entidad_id || row.referencia_valor || 0);
      const search = orderId > 0 ? String(orderId) : "";
      setJumpIntent({ type: "orders", search, deliveryDetailOrderId: orderId > 0 ? orderId : undefined });
      setSection("orders");
      return;
    }

    if (moduleValue === "INVENTARIO") {
      setJumpIntent({ type: "inventory" });
      setSection("inventory");
      return;
    }

    if (moduleValue === "DESPACHO") {
      setJumpIntent({ type: "dispatch" });
      setSection("dispatch");
      return;
    }

    if (moduleValue === "PRODUCTO") {
      setJumpIntent({ type: "products" });
      setSection("products");
      return;
    }

    if (moduleValue === "CATEGORIA") {
      setJumpIntent({ type: "categories" });
      setSection("categories");
      return;
    }

    if (moduleValue === "REPORTE") {
      setJumpIntent({ type: "reports" });
      setSection("reports");
      return;
    }

    setJumpIntent({ type: "dashboard" });
    setSection("dashboard");
  }, []);

  const consumeJumpIntent = useCallback(() => {
    setJumpIntent(null);
  }, []);

  useEffect(() => {
    document.body.classList.add("d-flex");
    return () => {
      document.body.classList.remove("d-flex");
    };
  }, []);

  return (
    <div className="d-flex">
      <aside id="sidebar" className="d-flex flex-column flex-shrink-0 p-3">
        <div className="text-center mb-4">
          <img src="/assets/images/avatar-admin.png" alt="avatar" className="rounded-circle mb-2" width={80} height={80} />
          <h5 className="m-0 fw-semibold text-truncate" title={adminDisplayName}>
            {adminDisplayName}
          </h5>
          <div className="small text-muted">Administrador</div>
        </div>
        <div className="menu-title">Panel Administrador</div>
        <ul className="nav nav-pills flex-column mb-auto" id="sideNav">
          <li className="nav-item">
            <button className={`nav-link ${section === "dashboard" ? "active" : ""}`} onClick={() => setSection("dashboard")}>
              <i className="bi bi-speedometer2 me-2"></i>Dashboard
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "orders" ? "active" : ""}`} onClick={() => setSection("orders")}>
              <i className="bi bi-receipt me-2"></i>Historial de Pedidos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "inventory" ? "active" : ""}`} onClick={() => setSection("inventory")}>
              <i className="bi bi-boxes me-2"></i>Inventario
            </button>
          </li>
          <li>
            <button
              className={`nav-link ${section === "dispatch" ? "active" : ""}`}
              onClick={() => {
                setSection("dispatch");
              }}
            >
              <i className="bi bi-truck me-2"></i>Despachos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "products" ? "active" : ""}`} onClick={() => setSection("products")}>
              <i className="bi bi-box-seam me-2"></i>Productos
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "categories" ? "active" : ""}`} onClick={() => setSection("categories")}>
              <i className="bi bi-tags me-2"></i>Categorías
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "users" ? "active" : ""}`} onClick={() => setSection("users")}>
              <i className="bi bi-people me-2"></i>Usuarios
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "reports" ? "active" : ""}`} onClick={() => setSection("reports")}>
              <i className="bi bi-bar-chart me-2"></i>Reporte de Ventas
            </button>
          </li>
          <li>
            <button className={`nav-link ${section === "audit" ? "active" : ""}`} onClick={() => setSection("audit")}>
              <i className="bi bi-journal-text me-2"></i>Auditoría
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
        {section === "dashboard" ? <DashboardSection now={now} /> : null}
        {section === "audit" ? <AuditSection onJumpFromAudit={jumpFromAudit} /> : null}
        {section === "inventory" ? (
          <InventorySection
            jumpIntent={jumpIntent?.type === "inventory" ? jumpIntent : null}
            onConsumeJump={consumeJumpIntent}
            exportFile={exportFile}
            exportingGeneric={exportingGeneric}
            genericExportError={genericExportError}
          />
        ) : null}
        {section === "dispatch" ? (
          <DispatchSection
            dispatchDefaults={dispatchDefaults}
            jumpIntent={jumpIntent?.type === "dispatch" ? jumpIntent : null}
            onConsumeJump={consumeJumpIntent}
            exportFile={exportFile}
            exportingGeneric={exportingGeneric}
            genericExportError={genericExportError}
          />
        ) : null}
        {section === "categories" ? <CategoriesSection /> : null}
        {section === "users" ? <UsersSection /> : null}
        {section === "products" ? (
          <ProductsSection jumpIntent={jumpIntent?.type === "products" ? jumpIntent : null} onConsumeJump={consumeJumpIntent} />
        ) : null}
        {section === "reports" ? (
          <ReportsSection exportFile={exportFile} exportingGeneric={exportingGeneric} genericExportError={genericExportError} />
        ) : null}
        {section === "orders" ? (
          <OrdersSection
            jumpIntent={jumpIntent?.type === "orders" ? jumpIntent : null}
            onConsumeJump={consumeJumpIntent}
            exportFile={exportFile}
            exportingGeneric={exportingGeneric}
            genericExportError={genericExportError}
          />
        ) : null}
      </main>
    </div>
  );
}
