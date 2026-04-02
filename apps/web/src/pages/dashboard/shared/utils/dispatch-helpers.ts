import type { DispatchDraftItem, DispatchListFilters } from "../types/dispatch.types";
import type { InventoryRow } from "../types/inventory.types";
import { toDateInputValue } from "./format";

export function createDefaultDispatchFilters(): DispatchListFilters {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    fechaInicio: toDateInputValue(start),
    fechaFin: toDateInputValue(end),
    search: "",
    pageSize: "20",
  };
}

export function createEmptyDispatchItem(): DispatchDraftItem {
  return { id_inventario: "", cantidad: "", searchDraft: "", selectedLabel: "" };
}

export function getDispatchDuplicateInventoryIds(items: DispatchDraftItem[]): Set<number> {
  const duplicates = new Set<number>();
  const seen = new Set<number>();
  for (const item of items) {
    const inventoryId = Number(item.id_inventario);
    if (!Number.isFinite(inventoryId) || inventoryId <= 0) continue;
    if (seen.has(inventoryId)) duplicates.add(inventoryId);
    seen.add(inventoryId);
  }
  return duplicates;
}

export function ensureDispatchFiltersIncludeDate(filters: DispatchListFilters, targetDate: string): { next: DispatchListFilters; adjusted: boolean } {
  const next = { ...filters };
  let adjusted = false;

  if (next.fechaInicio && next.fechaInicio > targetDate) {
    next.fechaInicio = targetDate;
    adjusted = true;
  }

  if (next.fechaFin && next.fechaFin < targetDate) {
    next.fechaFin = targetDate;
    adjusted = true;
  }

  if (next.fechaInicio && next.fechaFin && next.fechaInicio > next.fechaFin) {
    next.fechaInicio = targetDate;
    next.fechaFin = targetDate;
    adjusted = true;
  }

  return { next, adjusted };
}

export function getDispatchItemErrorMessage({
  item,
  inventoryById,
  duplicateIds,
  strict = false,
}: {
  item: DispatchDraftItem;
  inventoryById: Map<number, InventoryRow>;
  duplicateIds: Set<number>;
  strict?: boolean;
}): string | null {
  const hasSelection = item.id_inventario.trim().length > 0;
  const hasSearch = item.searchDraft.trim().length > 0;
  const hasQuantity = item.cantidad.trim().length > 0;
  const touched = hasSelection || hasSearch || hasQuantity;

  if (!strict && !touched) return null;

  const parts: string[] = [];
  const inventoryId = Number(item.id_inventario);
  const quantity = Number(item.cantidad);

  if (!hasSelection) {
    parts.push("Selecciona un inventario válido");
  } else if (!Number.isFinite(inventoryId) || inventoryId <= 0) {
    parts.push("Inventario inválido");
  }

  if (!hasQuantity) {
    parts.push("Ingresa una cantidad");
  } else if (!Number.isFinite(quantity) || quantity <= 0) {
    parts.push("Cantidad inválida");
  }

  if (Number.isFinite(inventoryId) && inventoryId > 0 && duplicateIds.has(inventoryId)) {
    parts.push("Inventario duplicado");
  }

  const found = inventoryById.get(inventoryId);
  if (found && Number.isFinite(quantity) && quantity > Number(found.stock || 0)) {
    parts.push(`Supera stock disponible (${found.stock})`);
  }

  return parts.length ? parts.join(" · ") : null;
}
