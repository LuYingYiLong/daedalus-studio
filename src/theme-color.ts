export type ResolvedStudioTheme = "light" | "dark";

export const DEFAULT_STUDIO_THEME_COLOR: string = "#478cbf";

type RgbColor = {
	r: number;
	g: number;
	b: number;
};

export type StudioAccentPalette = {
	primary: string;
	hover: string;
	active: string;
	muted: string;
	subtle: string;
	contrastText: string;
};

type ThemeStyleTarget = {
	setProperty(property: string, value: string): void;
};

export function normalizeStudioThemeColor(value: unknown): string {
	return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())
		? value.trim().toLowerCase()
		: DEFAULT_STUDIO_THEME_COLOR;
}

function parseHexColor(value: string): RgbColor {
	const normalized: string = normalizeStudioThemeColor(value);
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16)
	};
}

function toHexColor(color: RgbColor): string {
	const channel = (value: number): string => Math.round(value).toString(16).padStart(2, "0");
	return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function mixColor(color: RgbColor, target: number, amount: number): string {
	return toHexColor({
		r: color.r + (target - color.r) * amount,
		g: color.g + (target - color.g) * amount,
		b: color.b + (target - color.b) * amount
	});
}

export function createStudioAccentPalette(
	resolvedTheme: ResolvedStudioTheme,
	themeColor: string = DEFAULT_STUDIO_THEME_COLOR
): StudioAccentPalette {
	const color: RgbColor = parseHexColor(themeColor);
	const primary: string = toHexColor(color);
	const relativeLuminance: number = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
	return {
		primary,
		hover: mixColor(color, 255, resolvedTheme === "dark" ? 0.16 : 0.12),
		active: mixColor(color, 0, resolvedTheme === "dark" ? 0.18 : 0.14),
		muted: `rgb(${color.r} ${color.g} ${color.b} / ${resolvedTheme === "dark" ? "24%" : "18%"})`,
		subtle: `rgb(${color.r} ${color.g} ${color.b} / ${resolvedTheme === "dark" ? "14%" : "10%"})`,
		contrastText: relativeLuminance > 0.62 ? "#141414" : "#ffffff"
	};
}

export function applyStudioAccentVariables(
	style: ThemeStyleTarget,
	resolvedTheme: ResolvedStudioTheme,
	themeColor: string
): void {
	const accent: StudioAccentPalette = createStudioAccentPalette(resolvedTheme, themeColor);
	style.setProperty("--ds-accent", accent.primary);
	style.setProperty("--ds-accent-hover", accent.hover);
	style.setProperty("--ds-accent-active", accent.active);
	style.setProperty("--ds-accent-muted", accent.muted);
	style.setProperty("--ds-accent-subtle", accent.subtle);
	style.setProperty("--ds-text-inverse", accent.contrastText);
}
