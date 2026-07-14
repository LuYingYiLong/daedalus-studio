import { createBackendClient } from "./backend-client";
import type { AdditionalContextItem } from "./types";

export type ChatMode = "ask" | "agent" | "plan";

export type SendChatMessageParams = {
	requestId: string;
	message: string;
	mode: ChatMode;
	additionalContext?: AdditionalContextItem[];
};

export type CancelChatMessageResult = {
	cancelled: boolean;
	requestId: string;
};

export async function sendChatMessage(params: SendChatMessageParams): Promise<unknown> {
	const client = await createBackendClient();

	return client.requestWithId(params.requestId, "ai.chat", {
		message: params.message,
		mode: params.mode,
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
