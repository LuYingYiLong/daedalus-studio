import type { MermaidConfig } from "mermaid";

export type MermaidRenderAppearance = {
	theme: "dark" | "light";
	background: string;
	surface: string;
	surfaceMuted: string;
	border: string;
	accent: string;
	textPrimary: string;
	textSecondary: string;
	fontFamily: string;
};

export const MAX_MERMAID_SOURCE_CHARS: number = 50_000;
const MAX_MERMAID_EDGES: number = 500;
let renderSequence: number = 0;
let renderQueue: Promise<void> = Promise.resolve();

function createMermaidConfig(appearance: MermaidRenderAppearance, renderId: string): MermaidConfig {
	return {
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
		theme: "base",
		darkMode: appearance.theme === "dark",
		fontFamily: appearance.fontFamily,
		maxTextSize: MAX_MERMAID_SOURCE_CHARS,
		maxEdges: MAX_MERMAID_EDGES,
		deterministicIds: true,
		deterministicIDSeed: renderId,
		htmlLabels: false,
		flowchart: {
			htmlLabels: false,
			useMaxWidth: false
		},
		themeVariables: {
			background: appearance.background,
			mainBkg: appearance.surface,
			primaryColor: appearance.surface,
			primaryBorderColor: appearance.border,
			primaryTextColor: appearance.textPrimary,
			secondaryColor: appearance.surfaceMuted,
			secondaryBorderColor: appearance.border,
			secondaryTextColor: appearance.textPrimary,
			tertiaryColor: appearance.background,
			tertiaryBorderColor: appearance.border,
			tertiaryTextColor: appearance.textPrimary,
			lineColor: appearance.textSecondary,
			textColor: appearance.textPrimary,
			noteBkgColor: appearance.surfaceMuted,
			noteBorderColor: appearance.border,
			noteTextColor: appearance.textPrimary,
			actorBkg: appearance.surface,
			actorBorder: appearance.border,
			actorTextColor: appearance.textPrimary,
			actorLineColor: appearance.textSecondary,
			signalColor: appearance.textPrimary,
			signalTextColor: appearance.textPrimary,
			labelBoxBkgColor: appearance.surface,
			labelBoxBorderColor: appearance.border,
			labelTextColor: appearance.textPrimary,
			loopTextColor: appearance.textPrimary,
			activationBkgColor: appearance.surfaceMuted,
			activationBorderColor: appearance.accent,
			sequenceNumberColor: appearance.background
		}
	};
}

function createRenderId(): string {
	renderSequence += 1;
	return `daedalus-mermaid-${renderSequence.toString(36)}`;
}

export function getMermaidRenderErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message.trim();
	}
	if (typeof error === "string" && error.trim().length > 0) {
		return error.trim();
	}
	return "Mermaid diagram rendering failed.";
}

export async function renderMermaidDiagram(
	source: string,
	appearance: MermaidRenderAppearance
): Promise<string> {
	const normalizedSource: string = source.trim();
	if (normalizedSource.length === 0) {
		throw new Error("Mermaid diagram source is empty.");
	}
	if (normalizedSource.length > MAX_MERMAID_SOURCE_CHARS) {
		throw new Error(`Mermaid diagram exceeds the ${MAX_MERMAID_SOURCE_CHARS.toLocaleString("en-US")} character limit.`);
	}

	const renderTask: Promise<string> = renderQueue.then(async (): Promise<string> => {
		const { default: mermaid } = await import("mermaid");
		const renderId: string = createRenderId();
		mermaid.initialize(createMermaidConfig(appearance, renderId));
		const { svg } = await mermaid.render(renderId, normalizedSource);
		return svg;
	});
	renderQueue = renderTask.then(
		(): void => undefined,
		(): void => undefined
	);
	return await renderTask;
}
