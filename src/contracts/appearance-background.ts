export type BackgroundImageFit = "cover" | "contain" | "repeat";

export type BackgroundImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export type BackgroundImagePreference = {
	/** File name inside the Studio appearance-backgrounds directory. */
	fileName: string;
	mimeType: BackgroundImageMimeType;
	byteSize: number;
	width: number;
	height: number;
	sha256: string;
};

export const APPEARANCE_BACKGROUND_SCHEME: string = "daedalus-background";
export const APPEARANCE_BACKGROUND_HOST: string = "background";
export const APPEARANCE_BACKGROUND_DIRECTORY_NAME: string = "appearance-backgrounds";
export const APPEARANCE_BACKGROUND_FILE_PATTERN: RegExp = /^[0-9a-f]{64}\.(?:png|jpg|webp)$/;
export const APPEARANCE_BACKGROUND_SHA256_PATTERN: RegExp = /^[0-9a-f]{64}$/;

export const MAX_APPEARANCE_BACKGROUND_BYTES: number = 12 * 1024 * 1024;
export const MAX_APPEARANCE_BACKGROUND_EDGE: number = 3840;
export const MIN_APPEARANCE_BACKGROUND_EDGE: number = 64;

export const APPEARANCE_BACKGROUND_MIME_TYPES: readonly BackgroundImageMimeType[] = [
	"image/png",
	"image/jpeg",
	"image/webp",
];

export const APPEARANCE_BACKGROUND_EXTENSION_BY_MIME: Readonly<Record<BackgroundImageMimeType, string>> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
};

export const DEFAULT_BACKGROUND_IMAGE_OPACITY: number = 0.4;
export const MIN_BACKGROUND_IMAGE_OPACITY: number = 0.05;
export const MAX_BACKGROUND_IMAGE_OPACITY: number = 1;
export const BACKGROUND_IMAGE_OPACITY_STEP: number = 0.05;

export const DEFAULT_BACKGROUND_IMAGE_BLUR: number = 0;
export const MIN_BACKGROUND_IMAGE_BLUR: number = 0;
export const MAX_BACKGROUND_IMAGE_BLUR: number = 40;

export const DEFAULT_BACKGROUND_IMAGE_FIT: BackgroundImageFit = "cover";

export const BACKGROUND_IMAGE_VARIABLES: Readonly<Record<"image" | "opacity" | "blur" | "size" | "repeat", string>> = {
	image: "--ds-background-image",
	opacity: "--ds-background-opacity",
	blur: "--ds-background-blur",
	size: "--ds-background-size",
	repeat: "--ds-background-repeat",
};

type BackgroundStyleTarget = {
	setProperty(property: string, value: string): void;
	removeProperty(property: string): string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBackgroundImageMimeType(value: unknown): value is BackgroundImageMimeType {
	return typeof value === "string" && (APPEARANCE_BACKGROUND_MIME_TYPES as readonly string[]).includes(value);
}

function isBackgroundImageFileConsistent(fileName: string, mimeType: BackgroundImageMimeType, sha256: string): boolean {
	const expectedExtension: string = APPEARANCE_BACKGROUND_EXTENSION_BY_MIME[mimeType];
	const expectedFileName: string = `${sha256}.${expectedExtension}`;
	return fileName === expectedFileName;
}

export function normalizeBackgroundImageFit(value: unknown): BackgroundImageFit {
	return value === "cover" || value === "contain" || value === "repeat"
		? value
		: DEFAULT_BACKGROUND_IMAGE_FIT;
}

export function normalizeBackgroundImageOpacity(
	value: unknown,
	fallback: number = DEFAULT_BACKGROUND_IMAGE_OPACITY
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(MAX_BACKGROUND_IMAGE_OPACITY, Math.max(MIN_BACKGROUND_IMAGE_OPACITY, value));
}

export function normalizeBackgroundImageBlur(
	value: unknown,
	fallback: number = DEFAULT_BACKGROUND_IMAGE_BLUR
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(MAX_BACKGROUND_IMAGE_BLUR, Math.max(MIN_BACKGROUND_IMAGE_BLUR, Math.round(value)));
}

/**
 * Validates persisted background metadata. A preference is only accepted when the
 * file name, mime type and checksum agree, so a hand-edited preferences file can
 * never point the renderer at an arbitrary path.
 */
export function normalizeBackgroundImage(value: unknown): BackgroundImagePreference | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (!isRecord(value)) {
		return null;
	}

	const fileName: unknown = value.fileName;
	const mimeType: unknown = value.mimeType;
	const byteSize: unknown = value.byteSize;
	const width: unknown = value.width;
	const height: unknown = value.height;
	const sha256: unknown = value.sha256;

	if (typeof fileName !== "string" || !APPEARANCE_BACKGROUND_FILE_PATTERN.test(fileName)) return null;
	if (!isBackgroundImageMimeType(mimeType)) return null;
	if (typeof sha256 !== "string" || !APPEARANCE_BACKGROUND_SHA256_PATTERN.test(sha256)) return null;
	if (!isBackgroundImageFileConsistent(fileName, mimeType, sha256)) return null;
	if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize <= 0 || byteSize > MAX_APPEARANCE_BACKGROUND_BYTES) return null;
	if (typeof width !== "number" || !Number.isInteger(width) || width < MIN_APPEARANCE_BACKGROUND_EDGE || width > MAX_APPEARANCE_BACKGROUND_EDGE) return null;
	if (typeof height !== "number" || !Number.isInteger(height) || height < MIN_APPEARANCE_BACKGROUND_EDGE || height > MAX_APPEARANCE_BACKGROUND_EDGE) return null;

	return { fileName, mimeType, byteSize, width, height, sha256 };
}

export function buildAppearanceBackgroundUrl(image: BackgroundImagePreference | null): string | null {
	if (image === null || !APPEARANCE_BACKGROUND_FILE_PATTERN.test(image.fileName)) {
		return null;
	}
	return `${APPEARANCE_BACKGROUND_SCHEME}://${APPEARANCE_BACKGROUND_HOST}/${image.fileName}?v=${image.sha256}`;
}

function getBackgroundImageSize(fit: BackgroundImageFit): string {
	return fit === "cover" ? "cover" : fit === "contain" ? "contain" : "auto";
}

function getBackgroundImageRepeat(fit: BackgroundImageFit): string {
	return fit === "repeat" ? "repeat" : "no-repeat";
}

/**
 * Publishes the background preference as CSS variables. The content surfaces read
 * these variables; clearing the image removes the variables instead of setting an
 * empty url, so no request is issued for a missing file.
 */
export function applyStudioBackgroundVariables(
	style: BackgroundStyleTarget,
	params: {
		image: BackgroundImagePreference | null;
		opacity?: unknown;
		blur?: unknown;
		fit?: unknown;
	}
): void {
	const url: string | null = buildAppearanceBackgroundUrl(params.image);
	if (url === null) {
		style.removeProperty(BACKGROUND_IMAGE_VARIABLES.image);
		style.removeProperty(BACKGROUND_IMAGE_VARIABLES.size);
		style.removeProperty(BACKGROUND_IMAGE_VARIABLES.repeat);
	} else {
		const fit: BackgroundImageFit = normalizeBackgroundImageFit(params.fit);
		style.setProperty(BACKGROUND_IMAGE_VARIABLES.image, `url("${url}")`);
		style.setProperty(BACKGROUND_IMAGE_VARIABLES.size, getBackgroundImageSize(fit));
		style.setProperty(BACKGROUND_IMAGE_VARIABLES.repeat, getBackgroundImageRepeat(fit));
	}
	style.setProperty(
		BACKGROUND_IMAGE_VARIABLES.opacity,
		String(normalizeBackgroundImageOpacity(params.opacity))
	);
	style.setProperty(
		BACKGROUND_IMAGE_VARIABLES.blur,
		`${normalizeBackgroundImageBlur(params.blur)}px`
	);
}
