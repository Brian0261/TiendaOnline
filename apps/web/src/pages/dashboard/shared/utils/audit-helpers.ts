import type { AuditModule, AuditRow } from "../types/audit.types";
import { AUDIT_MODULE_OPTIONS } from "../types/audit.types";

export function normalizeAuditModule(value: string | null | undefined): AuditModule {
  const v = String(value || "")
    .trim()
    .toUpperCase();
  if (
    v === "INVENTARIO" ||
    v === "DESPACHO" ||
    v === "PRODUCTO" ||
    v === "CATEGORIA" ||
    v === "PEDIDO" ||
    v === "DELIVERY" ||
    v === "REPORTE" ||
    v === "SEGURIDAD" ||
    v === "SISTEMA"
  ) {
    return v;
  }
  return "";
}

export function inferAuditModuleFromAction(action: string): AuditModule {
  const key = String(action || "")
    .trim()
    .toUpperCase();
  if (key.startsWith("INVENTARIO") || key.startsWith("STOCK")) return "INVENTARIO";
  if (key.startsWith("SALIDA_DESPACHO") || key.startsWith("DESPACHO")) return "DESPACHO";
  if (key.startsWith("PRODUCTO")) return "PRODUCTO";
  if (key.startsWith("CATEGORIA")) return "CATEGORIA";
  if (key.startsWith("DELIVERY")) return "DELIVERY";
  if (key.startsWith("PEDIDO") || key.startsWith("TRANSICION_ESTADO") || key.startsWith("PREPARAR_PEDIDO") || key.startsWith("REEMBOLSO")) {
    return "PEDIDO";
  }
  if (key.startsWith("REPORTE") || key.startsWith("VENTAS")) return "REPORTE";
  if (key.startsWith("LOGIN") || key.startsWith("AUTH") || key.startsWith("TOKEN") || key.startsWith("PASSWORD")) return "SEGURIDAD";
  return "SISTEMA";
}

export function getAuditModuleLabel(moduleValue: AuditModule): string {
  const found = AUDIT_MODULE_OPTIONS.find(opt => opt.value === moduleValue);
  return found?.label || "Sistema";
}

export function getAuditActionLabel(action: string): string {
  const key = String(action || "")
    .trim()
    .toUpperCase();
  if (!key) return "—";

  const labels: Record<string, string> = {
    INVENTARIO_EXPORTADO: "Inventario exportado",
    INVENTARIO_ADMIN_EXPORTADO: "Inventario admin exportado",
    INVENTARIO_ENTRADA_REGISTRADA: "Entrada de inventario registrada",
    SALIDA_DESPACHO: "Salida de despacho",
    PRODUCTO_ACTIVADO: "Producto activado",
    PRODUCTO_DESACTIVADO: "Producto desactivado",
    PRODUCTO_ACTUALIZADO: "Producto actualizado",
    DELIVERY_ASIGNADO: "Repartidor asignado",
    DELIVERY_EN_RUTA: "Reparto en ruta",
    DELIVERY_ENTREGADO: "Entrega confirmada",
    DELIVERY_NO_ENTREGADO: "Entrega no completada",
    TRANSICION_ESTADO: "Cambio de estado",
    PREPARAR_PEDIDO: "Pedido preparado",
    USUARIO_REACTIVADO: "Usuario reactivado",
  };

  if (labels[key]) return labels[key];
  return key.replaceAll("_", " ");
}

export function getAuditRowModule(row: AuditRow): AuditModule {
  const fromApi = normalizeAuditModule(row.modulo);
  if (fromApi) return fromApi;
  return inferAuditModuleFromAction(row.accion);
}

export function getAuditEntityLabel(row: AuditRow): string {
  const entityType = String(row.entidad_tipo || "")
    .trim()
    .toUpperCase();
  const entityId = Number(row.entidad_id || 0);

  if (entityType === "PEDIDO" && entityId > 0) return `Pedido #${entityId}`;
  if (Number(row.id_pedido || 0) > 0) return `Pedido #${row.id_pedido}`;
  return "—";
}

export function getAuditReferenceLabel(row: AuditRow): string {
  const referenceLabel = String(row.referencia_label || "").trim();
  if (referenceLabel) return referenceLabel;

  const legacyEntity = getAuditEntityLabel(row);
  if (legacyEntity !== "—") return legacyEntity;

  const rowModule = getAuditRowModule(row);
  if (rowModule === "PRODUCTO") return "Producto";
  if (rowModule === "INVENTARIO") return "Inventario";
  if (rowModule === "DESPACHO") return "Despacho";
  if (rowModule === "REPORTE") return "Reporte";
  if (rowModule === "SEGURIDAD") return "Seguridad";
  return "General";
}
