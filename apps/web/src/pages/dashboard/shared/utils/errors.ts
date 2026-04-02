import type { ApiError } from "../../../../api/http";

export function getErrorMessage(err: unknown): string {
  if (!err) return "Ocurrió un error";
  const e = err as Partial<ApiError>;
  if (typeof e.message === "string" && e.message.trim()) return e.message;
  return "Ocurrió un error";
}
