import type {
	AdditionalContextItem,
	MessageQueueItem,
	PendingGuide,
	WorkbenchSnapshot,
} from "@/platform/rpc/types";

export function clearUnpinnedComposerContext(
	workbench: WorkbenchSnapshot,
): WorkbenchSnapshot {
	return {
		...workbench,
		composer: {
			...workbench.composer,
			additionalContext: workbench.composer.additionalContext.filter(
				(item: AdditionalContextItem): boolean => item.pinned === true,
			),
		},
	};
}

export function removeQueuedMessageFromWorkbench(
	workbench: WorkbenchSnapshot,
	queueId: number,
): WorkbenchSnapshot {
	return {
		...workbench,
		messageQueue: workbench.messageQueue.filter(
			(item: MessageQueueItem): boolean => item.id !== queueId,
		),
	};
}

export function editQueuedMessageInWorkbench(
	workbench: WorkbenchSnapshot,
	item: MessageQueueItem,
): WorkbenchSnapshot {
	const additionalContext: AdditionalContextItem[] =
		item.additionalContext ?? [];
	return {
		...workbench,
		composer: {
			...workbench.composer,
			additionalContext,
		},
		messageQueue: workbench.messageQueue.filter(
			(queueItem: MessageQueueItem): boolean => queueItem.id !== item.id,
		),
	};
}

export function reorderPendingQueueInWorkbench(
	workbench: WorkbenchSnapshot,
	queueIds: number[],
): WorkbenchSnapshot {
	const pendingItemsById: Map<number, MessageQueueItem> = new Map(
		workbench.messageQueue
			.filter(
				(item: MessageQueueItem): boolean => item.status === "pending",
			)
			.map((item: MessageQueueItem): [number, MessageQueueItem] => [
				item.id,
				item,
			]),
	);
	let pendingIndex: number = 0;
	const nextPendingItems: MessageQueueItem[] = queueIds
		.map((queueId: number): MessageQueueItem | undefined =>
			pendingItemsById.get(queueId),
		)
		.filter(
			(item: MessageQueueItem | undefined): item is MessageQueueItem =>
				item !== undefined,
		);
	return {
		...workbench,
		messageQueue: workbench.messageQueue.map(
			(item: MessageQueueItem): MessageQueueItem => {
				if (item.status !== "pending") {
					return item;
				}
				const nextItem: MessageQueueItem =
					nextPendingItems[pendingIndex] ?? item;
				pendingIndex += 1;
				return nextItem;
			},
		),
	};
}

export function removeGuideFromWorkbench(
	workbench: WorkbenchSnapshot,
	guideId: string,
): WorkbenchSnapshot {
	return {
		...workbench,
		pendingGuides: workbench.pendingGuides.filter(
			(guide: PendingGuide): boolean => guide.guideId !== guideId,
		),
	};
}

export function reorderGuidesInWorkbench(
	workbench: WorkbenchSnapshot,
	guideIds: string[],
): WorkbenchSnapshot {
	const guidesById: Map<string, PendingGuide> = new Map(
		workbench.pendingGuides.map(
			(guide: PendingGuide): [string, PendingGuide] => [
				guide.guideId,
				guide,
			],
		),
	);
	return {
		...workbench,
		pendingGuides: guideIds
			.map((guideId: string): PendingGuide | undefined =>
				guidesById.get(guideId),
			)
			.filter(
				(guide: PendingGuide | undefined): guide is PendingGuide =>
					guide !== undefined,
			),
	};
}
