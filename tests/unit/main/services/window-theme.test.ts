import { describe, expect, it } from "vitest";
import { getWindowThemeColors, resolveWindowTheme } from "@main/services/window-theme";

describe("window theme", () => {
	it("resolves explicit and system theme preferences", () => {
		expect(resolveWindowTheme("dark", false)).toBe("dark");
		expect(resolveWindowTheme("light", true)).toBe("light");
		expect(resolveWindowTheme("system", true)).toBe("dark");
		expect(resolveWindowTheme("system", false)).toBe("light");
	});

	it("returns matching title bar colors for Windows caption buttons", () => {
		expect(getWindowThemeColors("dark")).toEqual({
			backgroundColor: "#141414",
			titleBarOverlayColor: "#ffffff00",
			symbolColor: "#e8e8e8"
		});
		expect(getWindowThemeColors("light")).toEqual({
			backgroundColor: "#f5f5f5",
			titleBarOverlayColor: "#ffffff00",
			symbolColor: "#141414"
		});
	});
});
