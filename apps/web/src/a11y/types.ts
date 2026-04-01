export type ColorMode = "default" | "protanopia" | "deuteranopia" | "tritanopia" | "high-contrast";

export type MotionMode = "default" | "reduced";

export const COLOR_MODES: ColorMode[] = ["default", "protanopia", "deuteranopia", "tritanopia", "high-contrast"];

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  default: "Normal",
  protanopia: "Protanopía (rojo-verde)",
  deuteranopia: "Deuteranopía (verde-rojo)",
  tritanopia: "Tritanopía (azul-amarillo)",
  "high-contrast": "Alto contraste",
};
