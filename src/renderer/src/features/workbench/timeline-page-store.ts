import { useRef, useSyncExternalStore } from "react";
import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";
import {
	applyBackendEventsToTimeline,
	emptyTimelinePage,
	mergeTimelineAfter,
	mergeTimelineBefore,
	type TimelinePageState
} from "./workbench-state";

export type TimelinePageStore = {
	getSnapshot: () => TimelinePageState;
	subscribe: (listener: () => void) => () => void;
	reset: () => void;
	replace: (page: TimelinePageState) => void;
	update: (updater: (page: TimelinePageState) => TimelinePageState) => void;
	mergeBefore: (page: TimelinePageState) => void;
	mergeAfter: (page: TimelinePageState) => void;
	applyEvents: (events: readonly BackendEvent[]) => void;
};

function cloneEmptyTimelinePage(): TimelinePageState {
	return {
		...emptyTimelinePage,
		blocks: []
	};
}

const MAX_REMEMBERED_TIMELINE_EVENT_KEYS: number = 8192;

function getTimelineEventKey(event: BackendEvent): string | null {
	const eventId: string = typeof event.eventId === "string" ? event.eventId.trim() : "";
	if (eventId.length > 0) {
		return `event:${eventId}`;
	}

	const sessionId: string = typeof event.sessionId === "string" ? event.sessionId.trim() : "";
	return sessionId.length > 0 && typeof event.sequence === "number" && Number.isSafeInteger(event.sequence)
		? `sequence:${sessionId}:${event.sequence}`
		: null;
}

export function createTimelinePageStore(initialPage: TimelinePageState = cloneEmptyTimelinePage()): TimelinePageStore {
	let snapshot: TimelinePageState = initialPage;
	const listeners: Set<() => void> = new Set();
	const rememberedEventKeys: Set<string> = new Set();

	const publish = (nextSnapshot: TimelinePageState): void => {
		if (Object.is(snapshot, nextSnapshot)) {
			return;
		}
		snapshot = nextSnapshot;
		for (const listener of listeners) {
			listener();
		}
	};

	const update = (updater: (page: TimelinePageState) => TimelinePageState): void => {
		publish(updater(snapshot));
	};

	return {
		getSnapshot: (): TimelinePageState => snapshot,
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return (): void => {
				listeners.delete(listener);
			};
		},
		reset: (): void => {
			rememberedEventKeys.clear();
			publish(cloneEmptyTimelinePage());
		},
		replace: (page: TimelinePageState): void => {
			if (snapshot.sessionId !== page.sessionId) {
				rememberedEventKeys.clear();
			}
			publish(page);
		},
		update,
		mergeBefore: (page: TimelinePageState): void => update((current: TimelinePageState): TimelinePageState => mergeTimelineBefore(current, page)),
		mergeAfter: (page: TimelinePageState): void => update((current: TimelinePageState): TimelinePageState => mergeTimelineAfter(current, page)),
		applyEvents: (events: readonly BackendEvent[]): void => {
			if (events.length === 0) {
				return;
			}
			const unseenEvents: BackendEvent[] = events.filter((event: BackendEvent): boolean => {
				const eventKey: string | null = getTimelineEventKey(event);
				if (eventKey === null) {
					return true;
				}
				if (rememberedEventKeys.has(eventKey)) {
					return false;
				}
				rememberedEventKeys.add(eventKey);
				if (rememberedEventKeys.size > MAX_REMEMBERED_TIMELINE_EVENT_KEYS) {
					const oldestEventKey: string | undefined = rememberedEventKeys.values().next().value;
					if (oldestEventKey !== undefined) {
						rememberedEventKeys.delete(oldestEventKey);
					}
				}
				return true;
			});
			if (unseenEvents.length === 0) {
				return;
			}
			update((current: TimelinePageState): TimelinePageState => {
				const blocks = applyBackendEventsToTimeline(current.blocks, unseenEvents);
				return blocks === current.blocks ? current : { ...current, blocks };
			});
		}
	};
}

export function useTimelinePage(store: TimelinePageStore): TimelinePageState {
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useTimelineSelector<T>(
	store: TimelinePageStore,
	selector: (page: TimelinePageState) => T,
	isEqual: (left: T, right: T) => boolean = Object.is
): T {
	const selectionRef = useRef<{ snapshot: TimelinePageState; selection: T } | null>(null);
	const getSelection = (): T => {
		const snapshot: TimelinePageState = store.getSnapshot();
		const cached = selectionRef.current;
		if (cached !== null && cached.snapshot === snapshot) {
			return cached.selection;
		}
		const selection: T = selector(snapshot);
		if (cached !== null && isEqual(cached.selection, selection)) {
			selectionRef.current = { snapshot, selection: cached.selection };
			return cached.selection;
		}
		selectionRef.current = { snapshot, selection };
		return selection;
	};

	return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
