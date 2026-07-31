import { describe, expect, it } from "vitest";
import {
	createStudioAccentPalette,
	createStudioTheme,
	DEFAULT_STUDIO_THEME_COLOR
} from "@/styles/studio-theme";

describe("Studio theme color", () => {
	it("uses the saved color as the Ant Design primary token", () => {
		const theme = createStudioTheme("dark", "#c05a91");

		expect(theme.token?.colorPrimary).toBe("#c05a91");
		expect(theme.token?.colorPrimaryHover).not.toBe("#c05a91");
		expect(theme.token?.colorPrimaryActive).not.toBe("#c05a91");
	});

	it("derives custom CSS accent colors and readable contrast text", () => {
		const darkAccent = createStudioAccentPalette("dark", "#ffffff");
		const lightAccent = createStudioAccentPalette("light", "invalid");

		expect(darkAccent.primary).toBe("#ffffff");
		expect(darkAccent.contrastText).toBe("#141414");
		expect(darkAccent.muted).toContain("24%");
		expect(lightAccent.primary).toBe(DEFAULT_STUDIO_THEME_COLOR);
		expect(lightAccent.muted).toContain("18%");
	});
});
