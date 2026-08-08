import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SessionTimelineNavigationEntry, SessionTimelineResult } from "@/platform/rpc/types";
import { fetchSessionTimelineAfter, fetchSessionTimelineBefore, fetchSessionTimelineIndex } from "@/platform/rpc/session-api";
import { createTimelinePageFromTimelineResult, type TimelinePageState } from "@/domain/workbench/workbench-state";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";

type RefValue<T> = { current: T };

export type TimelineControllerParams = {
	activeSessionId: string | null;
	activeSessionIdRef: RefValue<string | null>;
	timelineStore: TimelinePageStore;
	timelineBlockCount: number;
	setSessionError: (message: string | null) => void;
};

export type TimelineController = {
	timelineNavigationEntries: SessionTimelineNavigationEntry[];
	isTimelineLoadingBefore: boolean;
	isTimelineLoadingAfter: boolean;
	handleLoadMoreBefore: () => void;
	handleLoadMoreAfter: () => void;
	handleTimelineSearchLoadOffset: (blockOffset: number) => Promise<void>;
	handleTimelineNavigationLoadEntry: (entry: SessionTimelineNavigationEntry) => Promise<void>;
	resetTimelineUiState: () => void;
};

export default function useTimelineController(params: TimelineControllerParams): TimelineController {
	const [timelineNavigationEntries, setTimelineNavigationEntries] = useState<SessionTimelineNavigationEntry[]>([]);
	const [isTimelineLoadingBefore, setIsTimelineLoadingBefore] = useState<boolean>(false);
	const [isTimelineLoadingAfter, setIsTimelineLoadingAfter] = useState<boolean>(false);
	const isTimelinePageLoadingRef = useRef<boolean>(false);

	const resetTimelineUiState = useCallback((): void => {
		isTimelinePageLoadingRef.current = false;
		setTimelineNavigationEntries([]);
		setIsTimelineLoadingBefore(false);
		setIsTimelineLoadingAfter(false);
	}, []);

	useEffect((): (() => void) | void => {
		if (params.activeSessionId === null) {
			setTimelineNavigationEntries([]);
			return;
		}
		let cancelled: boolean = false;
		const sessionId: string = params.activeSessionId;
		void fetchSessionTimelineIndex(sessionId)
			.then((result): void => {
				if (!cancelled && params.activeSessionIdRef.current === sessionId && result.sessionId === sessionId) {
					setTimelineNavigationEntries(result.entries);
				}
			})
			.catch((error: unknown): void => {
				if (!cancelled) console.warn("[App] load timeline navigation index failed", error);
			});
		return (): void => {
			cancelled = true;
		};
	}, [params.activeSessionId, params.activeSessionIdRef, params.timelineBlockCount]);

	const handleLoadMoreBefore = useCallback((): void => {
		const timelinePage: TimelinePageState = params.timelineStore.getSnapshot();
		if (params.activeSessionId === null || !timelinePage.hasMoreBefore || isTimelinePageLoadingRef.current) return;
		isTimelinePageLoadingRef.current = true;
		setIsTimelineLoadingBefore(true);
		const requestedSessionId: string = params.activeSessionId;
		void fetchSessionTimelineBefore(requestedSessionId, timelinePage.blockOffset)
			.then((result: SessionTimelineResult): void => {
				if (params.activeSessionIdRef.current !== requestedSessionId || result.sessionId !== requestedSessionId) {
					console.warn("[App] ignored previous timeline page for inactive session", { requestedSessionId, activeSessionId: params.activeSessionIdRef.current, resultSessionId: result.sessionId });
					return;
				}
				params.timelineStore.mergeBefore(createTimelinePageFromTimelineResult(result));
			})
			.catch((error: unknown): void => console.error("[App] load previous timeline page failed", error))
			.finally((): void => {
				isTimelinePageLoadingRef.current = false;
				setIsTimelineLoadingBefore(false);
			});
	}, [params]);

	const handleLoadMoreAfter = useCallback((): void => {
		const timelinePage: TimelinePageState = params.timelineStore.getSnapshot();
		if (params.activeSessionId === null || !timelinePage.hasMoreAfter || isTimelinePageLoadingRef.current) return;
		isTimelinePageLoadingRef.current = true;
		setIsTimelineLoadingAfter(true);
		const requestedSessionId: string = params.activeSessionId;
		void fetchSessionTimelineAfter(requestedSessionId, timelinePage.blockOffset + timelinePage.blocks.length)
			.then((result: SessionTimelineResult): void => {
				if (params.activeSessionIdRef.current !== requestedSessionId || result.sessionId !== requestedSessionId) {
					console.warn("[App] ignored next timeline page for inactive session", { requestedSessionId, activeSessionId: params.activeSessionIdRef.current, resultSessionId: result.sessionId });
					return;
				}
				params.timelineStore.mergeAfter(createTimelinePageFromTimelineResult(result));
			})
			.catch((error: unknown): void => console.error("[App] load next timeline page failed", error))
			.finally((): void => {
				isTimelinePageLoadingRef.current = false;
				setIsTimelineLoadingAfter(false);
			});
	}, [params]);

	const handleTimelineSearchLoadOffset = useCallback(async (blockOffset: number): Promise<void> => {
		if (params.activeSessionId === null || blockOffset < 0) return;
		const sessionId: string = params.activeSessionId;
		const result: SessionTimelineResult = await fetchSessionTimelineAfter(sessionId, Math.max(0, blockOffset - 40), 100);
		if (params.activeSessionIdRef.current !== sessionId || result.sessionId !== sessionId) return;
		params.timelineStore.replace(createTimelinePageFromTimelineResult(result));
	}, [params]);

	const handleTimelineNavigationLoadEntry = useCallback(async (entry: SessionTimelineNavigationEntry): Promise<void> => {
		try {
			await handleTimelineSearchLoadOffset(entry.blockOffset);
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to load conversation turn";
			params.setSessionError(errorMessage);
			console.error("[App] load timeline navigation entry failed", error);
		}
	}, [handleTimelineSearchLoadOffset, params.setSessionError]);

	return {
		timelineNavigationEntries,
		isTimelineLoadingBefore,
		isTimelineLoadingAfter,
		handleLoadMoreBefore,
		handleLoadMoreAfter,
		handleTimelineSearchLoadOffset,
		handleTimelineNavigationLoadEntry,
		resetTimelineUiState
	};
}

