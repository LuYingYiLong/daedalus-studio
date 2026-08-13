import { App, Button, Tooltip } from "antd";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import { useTimelineScrollFrameCoordinator } from "@/features/conversation/timeline-scroll-frame-context";
import {
	getMermaidRenderErrorMessage,
	renderMermaidDiagram,
	type MermaidRenderAppearance
} from "./mermaid-renderer";
import styles from "./MermaidBlock.module.css";

type MermaidBlockProps = {
	source: string;
};

type MermaidRenderState =
	| { status: "rendering"; svg: string; error: null }
	| { status: "ready"; svg: string; error: null }
	| { status: "failed"; svg: string; error: string };

function readVariable(styles: CSSStyleDeclaration, name: string, fallback: string): string {
	const value: string = styles.getPropertyValue(name).trim();
	return value.length > 0 ? value : fallback;
}

function readMermaidAppearance(): MermaidRenderAppearance {
	const root: HTMLElement = document.documentElement;
	const computedStyles: CSSStyleDeclaration = window.getComputedStyle(root);
	return {
		theme: root.dataset.theme === "light" ? "light" : "dark",
		background: readVariable(computedStyles, "--ds-bg", "#141414"),
		surface: readVariable(computedStyles, "--ds-surface", "#1b1b1b"),
		surfaceMuted: readVariable(computedStyles, "--ds-bg-sunken", "#1b1b1b"),
		border: readVariable(computedStyles, "--ds-border", "#3b3b3b"),
		accent: readVariable(computedStyles, "--ds-accent", "#478cbf"),
		textPrimary: readVariable(computedStyles, "--ds-text-primary", "#e8e8e8"),
		textSecondary: readVariable(computedStyles, "--ds-text-secondary", "#b8b8b8"),
		fontFamily: readVariable(computedStyles, "--ds-font-family", "system-ui, sans-serif")
	};
}

function getAppearanceKey(appearance: MermaidRenderAppearance): string {
	return JSON.stringify(appearance);
}

function useMermaidAppearance(): MermaidRenderAppearance {
	const [appearance, setAppearance] = useState<MermaidRenderAppearance>(readMermaidAppearance);

	useEffect((): (() => void) => {
		const root: HTMLElement = document.documentElement;
		const observer = new MutationObserver((): void => {
			const nextAppearance: MermaidRenderAppearance = readMermaidAppearance();
			setAppearance((currentAppearance: MermaidRenderAppearance): MermaidRenderAppearance => (
				getAppearanceKey(currentAppearance) === getAppearanceKey(nextAppearance)
					? currentAppearance
					: nextAppearance
			));
		});
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["data-theme", "style"]
		});
		return (): void => observer.disconnect();
	}, []);

	return appearance;
}

function MermaidBlock({ source }: MermaidBlockProps): React.JSX.Element {
	const { message } = App.useApp();
	const { t } = useTranslation();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const appearance: MermaidRenderAppearance = useMermaidAppearance();
	const appearanceKey: string = useMemo((): string => getAppearanceKey(appearance), [appearance]);
	const scrollFrameCoordinator = useTimelineScrollFrameCoordinator();
	const [renderState, setRenderState] = useState<MermaidRenderState>({
		status: "rendering",
		svg: "",
		error: null
	});

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		setRenderState((currentState: MermaidRenderState): MermaidRenderState => ({
			status: "rendering",
			svg: currentState.svg,
			error: null
		}));
		void renderMermaidDiagram(source, appearance)
			.then((svg: string): void => {
				if (!cancelled) {
					setRenderState({ status: "ready", svg, error: null });
				}
			})
			.catch((error: unknown): void => {
				if (!cancelled) {
					setRenderState({ status: "failed", svg: "", error: getMermaidRenderErrorMessage(error) });
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [appearance, appearanceKey, source]);

	useLayoutEffect((): void => {
		scrollFrameCoordinator?.schedule();
	}, [renderState, scrollFrameCoordinator]);

	useEffect((): (() => void) | void => {
		const container: HTMLDivElement | null = containerRef.current;
		if (container === null || typeof ResizeObserver === "undefined") {
			return;
		}
		const observer = new ResizeObserver((): void => scrollFrameCoordinator?.schedule());
		observer.observe(container);
		return (): void => observer.disconnect();
	}, [scrollFrameCoordinator]);

	const copySource = (): void => {
		void copyTextToClipboard(source)
			.then((): void => void message.success(t("chat.common.copied")))
			.catch((): void => void message.error(t("chat.common.copyFailed")));
	};

	return (
		<div ref={containerRef} className={styles.block}>
			<div className={styles.header} data-chat-search-ignore="true" data-message-selection-ignore="true">
				<div className={styles.title}>
					<Icon name="workflow" />
					<span>{t("chat.mermaid.title")}</span>
				</div>
				<Tooltip title={t("chat.mermaid.copySource")}>
					<Button
						type="text"
						shape="circle"
						className={styles.action}
						aria-label={t("chat.mermaid.copySource")}
						icon={<Icon name="copy" />}
						onClick={copySource}
					/>
				</Tooltip>
			</div>
			<div className={styles.viewport} data-chat-search-ignore="true" data-message-selection-ignore="true">
				{renderState.svg.length > 0 ? (
					<div className={styles.diagram} dangerouslySetInnerHTML={{ __html: renderState.svg }} />
				) : renderState.status === "failed" ? (
					<div className={styles.error} role="alert">
						<Icon name="warning" />
						<div>
							<strong>{t("chat.mermaid.renderFailed")}</strong>
							<span>{renderState.error}</span>
						</div>
					</div>
				) : (
					<div className={styles.loading}>{t("chat.mermaid.rendering")}</div>
				)}
			</div>
			<details className={styles.sourceDisclosure}>
				<summary>{t("chat.mermaid.showSource")}</summary>
				<pre><code>{source}</code></pre>
			</details>
		</div>
	);
}

export default memo(MermaidBlock);
