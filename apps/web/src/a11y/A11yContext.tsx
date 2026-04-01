import React, { useCallback, useEffect, useMemo, useState } from "react";
import { A11yContext } from "./context";
import { COLOR_MODES } from "./types";
import type { ColorMode, MotionMode } from "./types";

const LS_COLOR = "mmx_a11y_color" as const;
const LS_MOTION = "mmx_a11y_motion" as const;

const HTML_ATTR_COLOR = "data-a11y-color" as const;
const HTML_ATTR_MOTION = "data-a11y-motion" as const;

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin acceso a localStorage: el modo aplica igual en la sesión actual
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // idem
  }
}

/** Inicialización lazy: se ejecuta una sola vez antes del primer render. */
function readColorMode(): ColorMode {
  const saved = safeGetItem(LS_COLOR);
  if (saved && (COLOR_MODES as string[]).includes(saved)) {
    return saved as ColorMode;
  }
  return "default";
}

function readMotionMode(): MotionMode {
  const saved = safeGetItem(LS_MOTION);
  if (saved === "reduced") return "reduced";
  if (saved === "default") return "default";

  // Respeta la preferencia del sistema operativo si no hay valor guardado
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "reduced";
  }
  return "default";
}

export function A11yProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>(readColorMode);
  const [motionMode, setMotionModeState] = useState<MotionMode>(readMotionMode);

  /**
   * Aplica el modo de color como atributo en <html>.
   * El navegador recalcula los selectores CSS de forma nativa,
   * sin producir ningún re-render en el árbol de React.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (colorMode === "default") {
      root.removeAttribute(HTML_ATTR_COLOR);
    } else {
      root.setAttribute(HTML_ATTR_COLOR, colorMode);
    }
  }, [colorMode]);

  useEffect(() => {
    const root = document.documentElement;
    if (motionMode === "reduced") {
      root.setAttribute(HTML_ATTR_MOTION, "reduced");
    } else {
      root.removeAttribute(HTML_ATTR_MOTION);
    }
  }, [motionMode]);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    if (mode === "default") {
      safeRemoveItem(LS_COLOR);
    } else {
      safeSetItem(LS_COLOR, mode);
    }
  }, []);

  const setMotionMode = useCallback((mode: MotionMode) => {
    setMotionModeState(mode);
    if (mode === "default") {
      safeRemoveItem(LS_MOTION);
    } else {
      safeSetItem(LS_MOTION, mode);
    }
  }, []);

  const value = useMemo(() => ({ colorMode, motionMode, setColorMode, setMotionMode }), [colorMode, motionMode, setColorMode, setMotionMode]);

  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}
