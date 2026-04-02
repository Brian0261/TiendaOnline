export const money = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatStateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value).trim().replace(/_/g, " ");
}

export function toDateInputValue(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

export function getInventorySelectionLabel(row: { id_inventario: number; nombre_producto: string }): string {
  return `${row.nombre_producto} · ID ${row.id_inventario}`;
}

export function getTodayDateInputInLima(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
