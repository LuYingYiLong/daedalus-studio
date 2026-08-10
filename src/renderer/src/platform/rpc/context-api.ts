import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { AdditionalContextItem } from "./types";
import type { ChatMode } from "./chat-api";

export type ContextUsageEstimate = {
	usedTokens: number;
	inputTokens: number;
	inputPercent: number;
	committedTokens: number;
	committedPercent: number;
	outputReservePercent: number;
	safetyMarginPercent: number;
	availablePercent: number;
	contextWindowTokens: number;
	percent: number;
	availableTokens: number;
	historyTokens: number;
	currentMessageTokens: number;
	systemAndContextTokens: number;
	outputReserveTokens: number;
	safetyMarginTokens: number;
	modelLabel: string;
	estimationSource: "provider" | "local";
	canCompress: boolean;
	compressReason?: string | null;
	summaryActive: boolean;
	contextGeneration?: number | undefined;
	contextCompressionLevel?: "capture" | "distill" | "condense" | null | undefined;
	restorableBlockCount?: number | undefined;
	breakdown: Array<{
		kind: "base_system" | "custom_instructions" | "skills" | "mcp_context" | "tool_definitions" | "history" | "summary" | "current_message" | "additional_context" | "output_reserve" | "safety_margin";
		tokens: number;
		percent: number;
	}>;
	pressure: "low" | "moderate" | "high" | "critical";
	largestContributor: { kind: ContextUsageEstimate["breakdown"][number]["kind"]; tokens: number; percent: number } | null;
};

export type EstimateContextUsageParams = {
	message?: string | undefined;
	mode?: ChatMode | undefined;
	provider?: string | undefined;
	model?: string | undefined;
	additionalContext?: AdditionalContextItem[] | undefined;
};

export type CompressSessionResult = {
	compressed: boolean;
	reason?: string | undefined;
	messageCount?: number | undefined;
	oldMessageCount?: number | undefined;
	keptMessageCount?: number | undefined;
	summaryLength?: number | undefined;
	compressionId?: string | undefined;
	generation?: number | undefined;
	level?: "capture" | "distill" | "condense" | undefined;
	beforeTokens?: number | undefined;
	afterTokens?: number | undefined;
	savedTokens?: number | undefined;
	restorableBlockCount?: number | undefined;
	warning?: string | undefined;
};

export async function estimateContextUsage(params: EstimateContextUsageParams): Promise<ContextUsageEstimate> {
	const client = await createBackendClient();
	return client.request<ContextUsageEstimate>("session.context.estimate", params);
}

export async function compressSession(keepRecent: number = 8): Promise<CompressSessionResult> {
	const client = await createBackendClient();
	return client.request<CompressSessionResult>("session.compress", { keepRecent });
}
