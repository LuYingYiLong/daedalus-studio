import { useEffect, useLayoutEffect, useState } from "react";
import type { ComputerOverlayState } from "../../../../contracts/computer-overlay";
import { applyStudioAccentVariables } from "../../../../contracts/theme-color";
import { applyStudioFontVariables } from "../../../../contracts/studio-fonts";

export type { ComputerOverlayState } from "../../../../contracts/computer-overlay";
declare global {
  interface Window {
    computerOverlay: {
      ready(): void;
      pulse(): void;
      cancel(): void;
      resume(): void;
      subscribe(listener: (state: ComputerOverlayState) => void): () => void;
    };
  }
}

export function useComputerOverlay(): ComputerOverlayState {
  const [state, setState] = useState<ComputerOverlayState>({
    state: "starting",
    cursor: { x: -100, y: -100 },
    cursorVisible: false,
    clickSequence: 0,
  });
  const appearance = state.appearance;
  useLayoutEffect(() => {
    if (!appearance) return;
    const root = document.documentElement;
    root.dataset.theme = appearance.resolvedTheme;
    root.dataset.motion = appearance.animationsEnabled ? "on" : "off";
    applyStudioAccentVariables(root.style, appearance.resolvedTheme, appearance.themeColor);
    applyStudioFontVariables(root.style, appearance.fontFamily, appearance.fontFamilyCode, appearance.uiFontSize, appearance.codeFontSize);
  }, [appearance?.resolvedTheme, appearance?.themeColor, appearance?.fontFamily, appearance?.fontFamilyCode, appearance?.uiFontSize, appearance?.codeFontSize, appearance?.animationsEnabled]);
  useEffect(() => {
    const unsubscribe = window.computerOverlay.subscribe(setState);
    window.computerOverlay.ready();
    const timer = setInterval(window.computerOverlay.pulse, 500);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);
  return state;
}
