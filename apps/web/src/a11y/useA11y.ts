import { useContext } from "react";
import { A11yContext } from "./context";
import type { A11yState } from "./context";

export function useA11y(): A11yState {
  const ctx = useContext(A11yContext);
  if (!ctx) {
    throw new Error("useA11y debe usarse dentro de <A11yProvider>");
  }
  return ctx;
}
