export const DEFAULT_STUDIO_FONT_FAMILY: string = `"Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
export const DEFAULT_STUDIO_FONT_FAMILY_CODE: string = `"Fira Code", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, "Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", monospace`;
export const DEFAULT_STUDIO_UI_FONT_SIZE: number = 14;
export const DEFAULT_STUDIO_CODE_FONT_SIZE: number = 13;

export const MIN_STUDIO_UI_FONT_SIZE: number = 12;
export const MAX_STUDIO_UI_FONT_SIZE: number = 18;
export const MIN_STUDIO_CODE_FONT_SIZE: number = 11;
export const MAX_STUDIO_CODE_FONT_SIZE: number = 20;

const MAX_STUDIO_FONT_FAMILY_LENGTH: number = 512;

export function isSafeStudioFontFamily(value: string): boolean {
	return value.length <= MAX_STUDIO_FONT_FAMILY_LENGTH
		&& !/[\u0000-\u001f\u007f;{}<>]/u.test(value)
		&& !/(?:url|expression)\s*\(/iu.test(value);
}

export function normalizeStudioFontFamily(value: unknown, fallback: string): string {
	if (typeof value !== "string") {
		return fallback;
	}
	const normalized: string = value.trim();
	return normalized.length > 0 && isSafeStudioFontFamily(normalized) ? normalized : fallback;
}

export function normalizeStudioFontFamilyPatch(value: string, fallback: string, fieldName: string): string {
	const normalized: string = value.trim();
	if (normalized.length === 0) {
		return fallback;
	}
	if (!isSafeStudioFontFamily(normalized)) {
		throw new Error(`${fieldName} contains invalid CSS font-family syntax.`);
	}
	return normalized;
}

export function normalizeStudioFontSize(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function applyStudioFontVariables(
	style: CSSStyleDeclaration,
	fontFamily?: string,
	fontFamilyCode?: string,
	uiFontSize?: number,
	codeFontSize?: number
): void {
	style.setProperty("--ds-font-family", normalizeStudioFontFamily(fontFamily, DEFAULT_STUDIO_FONT_FAMILY));
	style.setProperty("--ds-font-family-code", normalizeStudioFontFamily(fontFamilyCode, DEFAULT_STUDIO_FONT_FAMILY_CODE));
	style.setProperty("--ds-font-size", `${normalizeStudioFontSize(uiFontSize, DEFAULT_STUDIO_UI_FONT_SIZE, MIN_STUDIO_UI_FONT_SIZE, MAX_STUDIO_UI_FONT_SIZE)}px`);
	style.setProperty("--ds-font-size-code", `${normalizeStudioFontSize(codeFontSize, DEFAULT_STUDIO_CODE_FONT_SIZE, MIN_STUDIO_CODE_FONT_SIZE, MAX_STUDIO_CODE_FONT_SIZE)}px`);
}
