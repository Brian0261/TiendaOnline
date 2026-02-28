export type FormattedDateTime = {
  raw: string;
  date: string;
  time?: string;
};

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("es-PE", {
  hour: "2-digit",
  minute: "2-digit",
});

function isDateOnlyString(value: string): boolean {
  // Ej: 2026-01-01 (sin hora)
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatDateTime(value: unknown, mode: "auto" | "date" | "datetime" = "auto"): FormattedDateTime | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  const isDateOnly = mode === "date" || (mode === "auto" && isDateOnlyString(raw));

  return {
    raw,
    date: dateFmt.format(d),
    time: isDateOnly ? undefined : timeFmt.format(d),
  };
}
