import { useEffect, useState } from "react";

export type ComputerOverlayState = {
  state: "starting" | "running" | "paused" | "cancelled";
  cursor: { x: number; y: number };
  cursorVisible: boolean;
  clickSequence: number;
  code?: string;
  resuming?: boolean;
  preview?: boolean;
};
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
