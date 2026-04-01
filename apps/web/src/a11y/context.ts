import { createContext } from "react";
import type { ColorMode, MotionMode } from "./types";

export type A11yState = {
  colorMode: ColorMode;
  motionMode: MotionMode;
  setColorMode: (mode: ColorMode) => void;
  setMotionMode: (mode: MotionMode) => void;
};

export const A11yContext = createContext<A11yState | null>(null);
