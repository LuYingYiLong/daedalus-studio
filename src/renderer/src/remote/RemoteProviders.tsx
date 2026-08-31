import { useEffect, useState } from "react";
import SharedVisualProviders from "@/app/shell/SharedVisualProviders";
import { resolveSystemLanguage, type ResolvedLanguage } from "@/platform/i18n";
import type { ResolvedTheme } from "@/domain/theme/studio-theme-preference";
import { DEFAULT_STUDIO_THEME_COLOR } from "../../../contracts/theme-color";
import {
	DEFAULT_STUDIO_CODE_FONT_SIZE,
	DEFAULT_STUDIO_FONT_FAMILY,
	DEFAULT_STUDIO_FONT_FAMILY_CODE,
	DEFAULT_STUDIO_UI_FONT_SIZE,
} from "../../../contracts/studio-fonts";
import styles from "./RemoteProviders.module.css";

function resolveTheme(): ResolvedTheme {
	return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches === true ? "dark" : "light";
}

function RemoteProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
	const [theme, setTheme] = useState<ResolvedTheme>(resolveTheme);
	const language: ResolvedLanguage = resolveSystemLanguage();

	useEffect((): (() => void) => {
		const media: MediaQueryList = globalThis.matchMedia("(prefers-color-scheme: dark)");
		const update = (): void => setTheme(media.matches ? "dark" : "light");
		media.addEventListener("change", update);
		return (): void => media.removeEventListener("change", update);
	}, []);

	return (
		<SharedVisualProviders
			resolvedTheme={theme}
			resolvedLanguage={language}
			themeColor={DEFAULT_STUDIO_THEME_COLOR}
			fontFamily={DEFAULT_STUDIO_FONT_FAMILY}
			fontFamilyCode={DEFAULT_STUDIO_FONT_FAMILY_CODE}
			uiFontSize={Math.max(15, DEFAULT_STUDIO_UI_FONT_SIZE)}
			codeFontSize={DEFAULT_STUDIO_CODE_FONT_SIZE}
			animationsEnabled={true}
			themeVariant="mobile"
			className={styles.root}
		>
			{children}
		</SharedVisualProviders>
	);
}

export default RemoteProviders;
