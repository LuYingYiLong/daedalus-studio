import { describe, expect, it } from "vitest";
import type {
	AdditionalContextItem,
	MessageQueueItem,
	PendingGuide,
	WorkbenchSnapshot,
} from "@/platform/rpc/types";
import {
	clearUnpinnedComposerContext,
	editQueuedMessageInWorkbench,
	removeGuideFromWorkbench,
	removeQueuedMessageFromWorkbench,
	reorderGuidesInWorkbench,
	reorderPendingQueueInWorkbench,
} from "@/domain/composer/composer-queue-state";

function createWorkbench(
	messageQueue: MessageQueueItem[] = [],
	pendingGuides: PendingGuide[] = [],
	additionalContext: AdditionalContextItem[] = [],
): WorkbenchSnapshot {
	return {
		revision: 1,
		sessionId: "session-1",
		composer: {
			text: "",
			chatMode: "agent",
			additionalContext,
		},
		messageQueue,
		pendingGuides,
		activeRun: { status: "idle" },
		pendingApproval: { count: 0, first: null },
		pendingToolBudget: null,
		nextStepHints: { hints: [] },
		activeSelection: { workspaceId: null },
	};
}

function createQueueItem(
	id: number,
	status: MessageQueueItem["status"] = "pending",
	text: string = `message-${id}`,
): MessageQueueItem {
	return {
		id,
		text,
		additionalContext: [],
		mode: "agent",
		provider: null,
		model: null,
		skillRefs: [],
		status,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

function createGuide(guideId: string): PendingGuide {
	return {
		guideId,
		clientGuideId: `client-${guideId}`,
		text: `guide-${guideId}`,
		anchorRequestId: null,
		status: "pending",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("composer queue workbench state", () => {
	it("clears only unpinned composer context", () => {
		const pinned: AdditionalContextItem = {
			id: "pinned",
			kind: "text_attachment",
			title: "keep",
			pinned: true,
			source: "manual",
		};
		const transient: AdditionalContextItem = {
			id: "transient",
			kind: "text_attachment",
			title: "remove",
			pinned: false,
			source: "manual",
		};
		const workbench: WorkbenchSnapshot = createWorkbench(
			[],
			[],
			[pinned, transient],
		);

		const nextWorkbench: WorkbenchSnapshot =
			clearUnpinnedComposerContext(workbench);

		expect(nextWorkbench.composer.additionalContext).toEqual([pinned]);
		expect(workbench.composer.additionalContext).toEqual([pinned, transient]);
	});

	it("removes and edits queued messages without mutating the snapshot", () => {
		const first: MessageQueueItem = createQueueItem(1);
		const second: MessageQueueItem = {
			...createQueueItem(2),
			additionalContext: [
				{
					id: "queue-context",
					kind: "text_attachment",
					title: "from-queue",
					pinned: false,
					source: "manual",
				},
			],
		};
		const workbench: WorkbenchSnapshot = createWorkbench([first, second]);

		const removed: WorkbenchSnapshot = removeQueuedMessageFromWorkbench(
			workbench,
			first.id,
		);
		const edited: WorkbenchSnapshot = editQueuedMessageInWorkbench(
			workbench,
			second,
		);

		expect(removed.messageQueue).toEqual([second]);
		expect(edited.messageQueue).toEqual([first]);
		expect(edited.composer.additionalContext).toEqual(
		second.additionalContext,
	);
		expect(workbench.messageQueue).toEqual([first, second]);
	});

	it("reorders pending queue items while preserving active items", () => {
		const active: MessageQueueItem = createQueueItem(3, "sending");
		const first: MessageQueueItem = createQueueItem(1);
		const second: MessageQueueItem = createQueueItem(2);
		const workbench: WorkbenchSnapshot = createWorkbench([
			active,
			first,
			second,
		]);

		const nextWorkbench: WorkbenchSnapshot = reorderPendingQueueInWorkbench(
			workbench,
			[second.id, first.id],
		);

		expect(nextWorkbench.messageQueue).toEqual([active, second, first]);
		expect(workbench.messageQueue).toEqual([active, first, second]);
	});

	it("removes and reorders pending guides", () => {
		const first: PendingGuide = createGuide("first");
		const second: PendingGuide = createGuide("second");
		const workbench: WorkbenchSnapshot = createWorkbench([], [first, second]);

		expect(removeGuideFromWorkbench(workbench, first.guideId).pendingGuides).toEqual([
			second,
		]);
		expect(
			reorderGuidesInWorkbench(workbench, [second.guideId, first.guideId])
				.pendingGuides,
		).toEqual([second, first]);
		expect(workbench.pendingGuides).toEqual([first, second]);
	});
});
