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

	useEffect((): (() => void) => {
		const root: HTMLElement = document.documentElement;
		const viewport: VisualViewport | null = globalThis.visualViewport ?? null;
		let baselineLayoutHeight: number = Math.max(
			globalThis.innerHeight,
			viewport?.height ?? 0,
		);
		let frameId: number | null = null;

		const updateViewportHeight = (): void => {
			frameId = null;
			const layoutHeight: number = globalThis.innerHeight;
			const height: number = viewport?.height ?? layoutHeight;
			if (!Number.isFinite(height) || height <= 0) return;
			if (layoutHeight > baselineLayoutHeight + 80) {
				baselineLayoutHeight = layoutHeight;
			}
			root.style.setProperty("--ds-remote-viewport-height", `${Math.round(height)}px`);
			const visualViewportInset: number = Math.max(
				0,
				layoutHeight - height - Math.max(0, viewport?.offsetTop ?? 0),
			);
			const layoutResizeInset: number = Math.max(0, baselineLayoutHeight - layoutHeight);
			root.style.setProperty(
				"--ds-remote-visual-ime-inset-bottom",
				`${Math.round(visualViewportInset)}px`,
			);
			root.style.setProperty(
				"--ds-remote-layout-resize-bottom",
				`${Math.round(layoutResizeInset)}px`,
			);
		};
		const scheduleViewportHeightUpdate = (): void => {
			if (frameId !== null) return;
			frameId = globalThis.requestAnimationFrame(updateViewportHeight);
		};

		updateViewportHeight();
		globalThis.addEventListener("resize", scheduleViewportHeightUpdate);
		globalThis.addEventListener("orientationchange", scheduleViewportHeightUpdate);
		viewport?.addEventListener("resize", scheduleViewportHeightUpdate);
		viewport?.addEventListener("scroll", scheduleViewportHeightUpdate);

		return (): void => {
			globalThis.removeEventListener("resize", scheduleViewportHeightUpdate);
			globalThis.removeEventListener("orientationchange", scheduleViewportHeightUpdate);
			viewport?.removeEventListener("resize", scheduleViewportHeightUpdate);
			viewport?.removeEventListener("scroll", scheduleViewportHeightUpdate);
			if (frameId !== null) globalThis.cancelAnimationFrame(frameId);
			root.style.removeProperty("--ds-remote-viewport-height");
			root.style.removeProperty("--ds-remote-visual-ime-inset-bottom");
			root.style.removeProperty("--ds-remote-layout-resize-bottom");
		};
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
