import type { ResolvedStudioTheme } from "../../../../contracts/theme-color";

export type ResolvedTheme = ResolvedStudioTheme;
export type ThemePreference = ResolvedTheme | "system";

export function resolveThemePreference(
	themePreference: ThemePreference,
	systemTheme: ResolvedTheme,
): ResolvedTheme {
	return themePreference === "system" ? systemTheme : themePreference;
}
