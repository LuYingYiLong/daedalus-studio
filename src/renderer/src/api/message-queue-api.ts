import { createBackendClient } from "./backend-client";
import type { AdditionalContextItem, MessageQueueItem, WorkbenchSnapshot } from "./types";
import type { ChatMode } from "./chat-api";

export type QueueMessageInput = {
	text: string;
	mode?: ChatMode;
	provider?: string;
	model?: string;
	skillRefs?: string[];
	additionalContext?: AdditionalContextItem[];
};

export type MessageQueueResult = {
	messageQueue: MessageQueueItem[];
	workbench: WorkbenchSnapshot;
	item?: MessageQueueItem;
	queueAdded?: boolean;
	queueUpdated?: boolean;
	queueRemoved?: boolean;
	queueStatusUpdated?: boolean;
	queueReordered?: boolean;
	removed?: boolean;
};

export async function addQueuedMessage(input: QueueMessageInput): Promise<MessageQueueResult> {
	const client = await createBackendClient();

	return client.request<MessageQueueResult>("message.queue.add", input);
}

export async function updateQueuedMessage(queueId: number, input: QueueMessageInput): Promise<MessageQueueResult> {
	const client = await createBackendClient();

	return client.request<MessageQueueResult>("message.queue.update", {
		queueId,
		...input
	});
}

export async function removeQueuedMessage(queueId: number): Promise<MessageQueueResult> {
	const client = await createBackendClient();

	return client.request<MessageQueueResult>("message.queue.remove", {
		queueId
	});
}

export async function reorderQueuedMessages(queueIds: number[]): Promise<MessageQueueResult> {
	const client = await createBackendClient();

	return client.request<MessageQueueResult>("message.queue.reorder", {
		queueIds
	});
}
