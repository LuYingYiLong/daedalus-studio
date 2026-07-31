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

export function createTimelinePageStore(initialPage: TimelinePageState = cloneEmptyTimelinePage()): TimelinePageStore {
	let snapshot: TimelinePageState = initialPage;
	const listeners: Set<() => void> = new Set();

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
		reset: (): void => publish(cloneEmptyTimelinePage()),
		replace: publish,
		update,
		mergeBefore: (page: TimelinePageState): void => update((current: TimelinePageState): TimelinePageState => mergeTimelineBefore(current, page)),
		mergeAfter: (page: TimelinePageState): void => update((current: TimelinePageState): TimelinePageState => mergeTimelineAfter(current, page)),
		applyEvents: (events: readonly BackendEvent[]): void => {
			if (events.length === 0) {
				return;
			}
			update((current: TimelinePageState): TimelinePageState => {
				const blocks = applyBackendEventsToTimeline(current.blocks, events);
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
