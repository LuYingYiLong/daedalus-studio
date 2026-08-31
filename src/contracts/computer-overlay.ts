import type { ClientPreferences } from "./client-preferences";
import type { ResolvedStudioTheme } from "./theme-color";

export type ComputerOverlayLanguage = "en-US" | "zh-CN";

/** Main 单向提供外观字段；不向 Overlay 暴露完整客户端配置或系统能力 */
export type ComputerOverlayAppearance = Pick<ClientPreferences,
  "themeColor" | "fontFamily" | "fontFamilyCode" | "uiFontSize" | "codeFontSize" | "animationsEnabled"
> & {
  resolvedTheme: ResolvedStudioTheme;
  resolvedLanguage: ComputerOverlayLanguage;
};

export type ComputerOverlayState = {
  state: "starting" | "running" | "paused" | "cancelled";
  cursor: { x: number; y: number };
  cursorVisible: boolean;
  clickSequence: number;
  highlight?: { x: number; y: number; width: number; height: number } | null;
  code?: string;
  resuming?: boolean;
  preview?: boolean;
  appearance?: ComputerOverlayAppearance;
};
