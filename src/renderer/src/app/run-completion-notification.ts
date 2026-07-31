import type { MessageQueueItem, WorkbenchActiveRun } from "@/api/types";

type RunCompletionQueueState = {
	messageQueue: ReadonlyArray<Pick<MessageQueueItem, "id" | "status">>;
	activeRun: Pick<WorkbenchActiveRun, "requestId" | "queueItemId">;
};

export function hasQueuedFollowUpResponse(
	workbench: RunCompletionQueueState | null,
	completedRequestId: string
): boolean {
	if (workbench === null) {
		return false;
	}
	if (workbench.messageQueue.some((item): boolean => item.status === "pending")) {
		return true;
	}

	const activeQueueItemId: number | undefined = workbench.activeRun.queueItemId;
	return activeQueueItemId !== undefined
		&& workbench.activeRun.requestId !== undefined
		&& workbench.activeRun.requestId !== completedRequestId
		&& workbench.messageQueue.some((item): boolean => {
			return item.id === activeQueueItemId
				&& (item.status === "sending" || item.status === "approval");
		});
}
