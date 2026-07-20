import type { ClientPreferences } from "./client-preferences-store";

export type ResolvedWindowTheme = "light" | "dark";

export type WindowThemeColors = {
	backgroundColor: string;
	titleBarOverlayColor: string;
	symbolColor: string;
};

export function resolveWindowTheme(
	themePreference: ClientPreferences["theme"],
	systemUsesDarkColors: boolean
): ResolvedWindowTheme {
	if (themePreference === "light" || themePreference === "dark") {
		return themePreference;
	}
	return systemUsesDarkColors ? "dark" : "light";
}

export function getWindowThemeColors(resolvedTheme: ResolvedWindowTheme): WindowThemeColors {
	if (resolvedTheme === "light") {
		return {
			backgroundColor: "#f5f5f5",
			titleBarOverlayColor: "#ffffff00",
			symbolColor: "#141414"
		};
	}

	return {
		backgroundColor: "#141414",
		titleBarOverlayColor: "#ffffff00",
		symbolColor: "#e8e8e8"
	};
}
