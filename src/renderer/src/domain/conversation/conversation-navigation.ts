import type { SessionTimelineNavigationEntry, TimelineBlock } from "@/platform/rpc/types";

export type ConversationTurnDirection = "previous" | "next";

export type ConversationViewportRow = {
	blockOffset: number;
	top: number;
	bottom: number;
};

export function resolveActiveBlockOffset(
	rows: readonly ConversationViewportRow[],
	activationTop: number,
	atBottom: boolean = false,
	viewportTop: number = Number.NEGATIVE_INFINITY,
	viewportBottom: number = Number.POSITIVE_INFINITY
): number | null {
	const visibleRows: ConversationViewportRow[] = rows
		.filter((row: ConversationViewportRow): boolean => row.bottom > viewportTop && row.top < viewportBottom)
		.sort((left: ConversationViewportRow, right: ConversationViewportRow): number => (
			left.top - right.top || left.blockOffset - right.blockOffset
		));
	if (visibleRows.length === 0) {
		return null;
	}
	if (atBottom) {
		return visibleRows[visibleRows.length - 1]?.blockOffset ?? null;
	}
	let activeBlockOffset: number = visibleRows[0]!.blockOffset;
	for (const row of visibleRows) {
		if (row.top > activationTop) {
			break;
		}
		activeBlockOffset = row.blockOffset;
	}
	return activeBlockOffset;
}

export function resolveActiveTimelineEntryId(
	entries: readonly SessionTimelineNavigationEntry[],
	activeBlockOffset: number | null
): string | null {
	if (activeBlockOffset === null) {
		return null;
	}
	let activeEntryId: string | null = null;
	for (const entry of entries) {
		if (entry.blockOffset > activeBlockOffset) {
			break;
		}
		activeEntryId = entry.entryId;
	}
	return activeEntryId;
}

export function resolveActiveTimelineEntryIdFromLoadedBlocks(
	entries: readonly SessionTimelineNavigationEntry[],
	blocks: readonly TimelineBlock[],
	loadedBlockOffset: number,
	activeBlockOffset: number | null
): string | null {
	if (activeBlockOffset === null) {
		return null;
	}
	const localIndex: number = activeBlockOffset - loadedBlockOffset;
	if (Number.isSafeInteger(localIndex) && localIndex >= 0 && localIndex < blocks.length) {
		const entryIds: ReadonlySet<string> = new Set(
			entries.map((entry: SessionTimelineNavigationEntry): string => entry.entryId)
		);
		for (let index: number = localIndex; index >= 0; index -= 1) {
			const block: TimelineBlock = blocks[index]!;
			if (block.type === "user" && entryIds.has(block.id)) {
				return block.id;
			}
		}
	}
	return resolveActiveTimelineEntryId(entries, activeBlockOffset);
}

export function resolveAdjacentTimelineEntry(
	entries: readonly SessionTimelineNavigationEntry[],
	activeEntryId: string | null,
	direction: ConversationTurnDirection
): SessionTimelineNavigationEntry | null {
	if (activeEntryId === null) {
		return null;
	}
	const activeIndex: number = entries.findIndex(
		(entry: SessionTimelineNavigationEntry): boolean => entry.entryId === activeEntryId
	);
	if (activeIndex < 0) {
		return null;
	}
	const targetIndex: number = direction === "previous" ? activeIndex - 1 : activeIndex + 1;
	return entries[targetIndex] ?? null;
}
