import { describe, expect, it } from "vitest";
import { normalizeClientPreferencesPatch } from "@main/services/client-preferences-store";
import {
	APPEARANCE_BACKGROUND_FILE_PATTERN,
	BACKGROUND_IMAGE_VARIABLES,
	MAX_APPEARANCE_BACKGROUND_BYTES,
	applyStudioBackgroundVariables,
	buildAppearanceBackgroundUrl,
	normalizeBackgroundImage,
	normalizeBackgroundImageBlur,
	normalizeBackgroundImageFit,
	normalizeBackgroundImageOpacity,
	type BackgroundImagePreference,
} from "../../src/contracts/appearance-background";

const SHA256: string = "a".repeat(64);
const IMAGE: BackgroundImagePreference = {
	fileName: `${SHA256}.png`,
	mimeType: "image/png",
	byteSize: 1024,
	width: 1920,
	height: 1080,
	sha256: SHA256,
};

type StyleTarget = {
	values: Map<string, string>;
	setProperty(property: string, value: string): void;
	removeProperty(property: string): string;
};

function createStyleTarget(): StyleTarget {
	const values: Map<string, string> = new Map<string, string>();
	return {
		values,
		setProperty(property: string, value: string): void {
			values.set(property, value);
		},
		removeProperty(property: string): string {
			const previous: string = values.get(property) ?? "";
			values.delete(property);
			return previous;
		},
	};
}

describe("appearance background contract", () => {
	it("accepts only consistent and bounded background metadata", () => {
		expect(normalizeBackgroundImage(IMAGE)).toEqual(IMAGE);
		expect(normalizeBackgroundImage(null)).toBeNull();
		expect(normalizeBackgroundImage(undefined)).toBeNull();
		expect(normalizeBackgroundImage(`${SHA256}.png`)).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, fileName: `${SHA256}.gif` })).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, fileName: `../${SHA256}.png` })).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, mimeType: "image/jpeg" })).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, sha256: "b".repeat(64) })).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, byteSize: MAX_APPEARANCE_BACKGROUND_BYTES + 1 })).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, byteSize: 0 })).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, width: 12 })).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, height: 99999 })).toBeNull();
		expect(normalizeBackgroundImage({ ...IMAGE, width: 1.5 })).toBeNull();
	});

	it("builds a content-addressed url and rejects unsafe file names", () => {
		expect(buildAppearanceBackgroundUrl(IMAGE)).toBe(
			`daedalus-background://background/${SHA256}.png?v=${SHA256}`,
		);
		expect(buildAppearanceBackgroundUrl(null)).toBeNull();
		expect(buildAppearanceBackgroundUrl({ ...IMAGE, fileName: "evil.png" })).toBeNull();
		expect(APPEARANCE_BACKGROUND_FILE_PATTERN.test("evil.png")).toBe(false);
		expect(APPEARANCE_BACKGROUND_FILE_PATTERN.test(`${SHA256}.webp`)).toBe(true);
	});

	it("publishes the background variables and clears them for an empty preference", () => {
		const style: StyleTarget = createStyleTarget();
		applyStudioBackgroundVariables(style, { image: IMAGE, opacity: 0.5, blur: 8, fit: "contain" });

		expect(style.values.get(BACKGROUND_IMAGE_VARIABLES.image)).toBe(
			`url("daedalus-background://background/${SHA256}.png?v=${SHA256}")`,
		);
		expect(style.values.get(BACKGROUND_IMAGE_VARIABLES.opacity)).toBe("0.5");
		expect(style.values.get(BACKGROUND_IMAGE_VARIABLES.blur)).toBe("8px");
		expect(style.values.get(BACKGROUND_IMAGE_VARIABLES.size)).toBe("contain");
		expect(style.values.get(BACKGROUND_IMAGE_VARIABLES.repeat)).toBe("no-repeat");

		applyStudioBackgroundVariables(style, { image: null, opacity: 0.4, blur: 0, fit: "cover" });
		expect(style.values.has(BACKGROUND_IMAGE_VARIABLES.image)).toBe(false);
		expect(style.values.has(BACKGROUND_IMAGE_VARIABLES.size)).toBe(false);
		expect(style.values.has(BACKGROUND_IMAGE_VARIABLES.repeat)).toBe(false);
		expect(style.values.get(BACKGROUND_IMAGE_VARIABLES.opacity)).toBe("0.4");
		expect(style.values.get(BACKGROUND_IMAGE_VARIABLES.blur)).toBe("0px");
	});

	it("clamps opacity, blur and fit to the supported ranges", () => {
		expect(normalizeBackgroundImageOpacity(9)).toBe(1);
		expect(normalizeBackgroundImageOpacity(0)).toBe(0.05);
		expect(normalizeBackgroundImageOpacity("wide")).toBe(0.4);
		expect(normalizeBackgroundImageOpacity(Number.NaN)).toBe(0.4);
		expect(normalizeBackgroundImageBlur(999)).toBe(40);
		expect(normalizeBackgroundImageBlur(-5)).toBe(0);
		expect(normalizeBackgroundImageBlur(7.6)).toBe(8);
		expect(normalizeBackgroundImageFit("stretch")).toBe("cover");
		expect(normalizeBackgroundImageFit("repeat")).toBe("repeat");
		expect(normalizeBackgroundImageFit(undefined)).toBe("cover");
	});

	it("normalizes the client preferences patch for the background fields", () => {
		expect(normalizeClientPreferencesPatch({ backgroundImage: IMAGE }).backgroundImage).toEqual(IMAGE);
		expect(normalizeClientPreferencesPatch({ backgroundImage: null }).backgroundImage).toBeNull();
		expect(
			normalizeClientPreferencesPatch({ backgroundImage: { fileName: "evil.png" } }).backgroundImage,
		).toBeNull();
		expect(normalizeClientPreferencesPatch({ backgroundImageOpacity: 0.25 }).backgroundImageOpacity).toBe(0.25);
		expect(normalizeClientPreferencesPatch({ backgroundImageBlur: 12 }).backgroundImageBlur).toBe(12);
		expect(normalizeClientPreferencesPatch({ backgroundImageFit: "contain" }).backgroundImageFit).toBe("contain");
		expect("backgroundImageFit" in normalizeClientPreferencesPatch({ backgroundImageFit: "stretch" })).toBe(false);
		expect("backgroundImageOpacity" in normalizeClientPreferencesPatch({ backgroundImageOpacity: "0.5" })).toBe(false);
	});
});
