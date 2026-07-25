import type { TFunction } from "i18next";
import type { SessionOverviewSourceItem } from "@/api/session-overview-api";

export function formatSourceSubtitle(source: SessionOverviewSourceItem, t: TFunction<"common">): string {
	const dimensions: string = source.width !== undefined && source.height !== undefined
		? `${source.width}x${source.height}`
		: t("agentPage.summary.unknownSize");
	return t("agentPage.summary.sourceSubtitle", { mimeType: source.mimeType, dimensions });
}
