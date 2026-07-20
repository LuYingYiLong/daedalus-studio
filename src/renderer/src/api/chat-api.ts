import { createBackendClient } from "./backend-client";
import type { AdditionalContextItem } from "./types";

export type ChatMode = "ask" | "agent" | "plan";

export type SendChatMessageParams = {
	requestId: string;
	message: string;
	mode: ChatMode;
	provider?: string | undefined;
	model?: string | undefined;
	retryFromRequestId?: string;
	additionalContext?: AdditionalContextItem[];
	skillRefs?: string[];
	webSearchEnabled?: boolean;
};

export type CancelChatMessageResult = {
	cancelled: boolean;
	requestId: string;
};

export type ToolBudgetDecisionResult = {
	budgetId: string;
	continued?: boolean;
	stopped?: boolean;
	cancelled?: boolean;
	requestId?: string;
	workbench?: unknown;
};

export async function sendChatMessage(params: SendChatMessageParams): Promise<unknown> {
	const client = await createBackendClient();

	return client.requestWithId(params.requestId, "ai.chat", {
		message: params.message,
		mode: params.mode,
		provider: params.provider,
		model: params.model,
		retryFromRequestId: params.retryFromRequestId,
		skillRefs: params.skillRefs,
		webSearchEnabled: params.webSearchEnabled,
		options: {
			stream: true
		},
		additionalContext: params.additionalContext
	});
}

export async function cancelChatMessage(requestId: string): Promise<CancelChatMessageResult> {
	const client = await createBackendClient();

	return client.request<CancelChatMessageResult>("ai.cancel", {
		requestId
	});
}

export async function continueToolBudget(budgetId: string): Promise<ToolBudgetDecisionResult> {
	const client = await createBackendClient();

	return client.request<ToolBudgetDecisionResult>("ai.toolBudget.continue", {
		budgetId
	});
}

export async function stopToolBudget(budgetId: string): Promise<ToolBudgetDecisionResult> {
	const client = await createBackendClient();

	return client.request<ToolBudgetDecisionResult>("ai.toolBudget.stop", {
		budgetId
	});
}
