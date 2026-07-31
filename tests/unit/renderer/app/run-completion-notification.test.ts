import { describe, expect, it } from "vitest";
import { hasQueuedFollowUpResponse } from "@/app/run-completion-notification";
import type { MessageQueueStatus } from "@/api/types";

function createQueueState(
	items: Array<{ id: number; status: MessageQueueStatus }>,
	activeRun: { requestId?: string; queueItemId?: number } = {}
) {
	return {
		messageQueue: items,
		activeRun
	};
}

describe("run completion notifications", () => {
	it("defers notification while a pending queue message still needs a response", () => {
		expect(hasQueuedFollowUpResponse(
			createQueueState([{ id: 2, status: "pending" }], { requestId: "request-1", queueItemId: 1 }),
			"request-1"
		)).toBe(true);
	});

	it("defers notification when the queue has already advanced to its next response", () => {
		expect(hasQueuedFollowUpResponse(
			createQueueState([{ id: 2, status: "sending" }], { requestId: "request-2", queueItemId: 2 }),
			"request-1"
		)).toBe(true);
	});

	it("allows notification after the final queued response completes", () => {
		expect(hasQueuedFollowUpResponse(
			createQueueState([{ id: 2, status: "sending" }], { requestId: "request-2", queueItemId: 2 }),
			"request-2"
		)).toBe(false);
	});

	it("does not treat failed or cancelled queue history as a future response", () => {
		expect(hasQueuedFollowUpResponse(
			createQueueState([
				{ id: 2, status: "failed" },
				{ id: 3, status: "cancelled" },
				{ id: 4, status: "rejected" }
			]),
			"request-1"
		)).toBe(false);
	});
});
