import { app, nativeTheme } from "electron";
import type { ComputerOverlayAppearance } from "../../../contracts/computer-overlay";
import { clientPreferencesService } from "../client-preferences";
import { resolveWindowTheme } from "../window-theme";

function resolveOverlayLanguage(language: string | undefined): "en-US" | "zh-CN" {
  if (language === "zh-CN" || language === "en-US") return language;
  return app.getLocale?.().toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function getComputerOverlayAppearance(): ComputerOverlayAppearance {
  const preferences = clientPreferencesService.getCachedPreferences();
  return {
    resolvedTheme: resolveWindowTheme(preferences.theme, nativeTheme.shouldUseDarkColors),
    resolvedLanguage: resolveOverlayLanguage(preferences.language),
    themeColor: preferences.themeColor,
    fontFamily: preferences.fontFamily,
    fontFamilyCode: preferences.fontFamilyCode,
    uiFontSize: preferences.uiFontSize,
    codeFontSize: preferences.codeFontSize,
    animationsEnabled: preferences.animationsEnabled,
  };
}
