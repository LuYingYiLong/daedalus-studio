export const DEFAULT_STUDIO_FONT_FAMILY: string = `"Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
export const DEFAULT_STUDIO_FONT_FAMILY_CODE: string = `"Fira Code", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, "Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", monospace`;

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

export function applyStudioFontVariables(
	style: CSSStyleDeclaration,
	fontFamily?: string,
	fontFamilyCode?: string
): void {
	style.setProperty("--ds-font-family", normalizeStudioFontFamily(fontFamily, DEFAULT_STUDIO_FONT_FAMILY));
	style.setProperty("--ds-font-family-code", normalizeStudioFontFamily(fontFamilyCode, DEFAULT_STUDIO_FONT_FAMILY_CODE));
}
