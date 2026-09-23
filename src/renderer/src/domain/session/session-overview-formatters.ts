import type { TFunction } from "i18next";
import type { SessionOverviewSourceItem } from "@/platform/rpc/session-overview-api";

export function formatSourceSubtitle(source: SessionOverviewSourceItem, t: TFunction<"common">): string {
	if (source.kind === "text_attachment") {
		return `${source.mimeType} · ${Math.max(1, Math.ceil(source.byteSize / 1024))} KiB`;
	}
	const dimensions: string = source.width !== undefined && source.height !== undefined
		? `${source.width}x${source.height}`
		: t("agentPage.summary.unknownSize");
	if (source.kind === "flow_media_artifact") {
		return [
			source.provider,
			source.model,
			dimensions,
			source.durationMs === undefined ? undefined : `${(source.durationMs / 1000).toFixed(1)} s`,
			source.fps === undefined ? undefined : `${source.fps} fps`,
		].filter((value): value is string => value !== undefined && value.length > 0).join(" · ");
	}
	return t("agentPage.summary.sourceSubtitle", { mimeType: source.mimeType, dimensions });
}
