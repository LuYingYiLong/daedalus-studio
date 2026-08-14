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
	refreshTimelineNavigationEntries: (sessionIdOverride?: string) => Promise<void>;
	resetTimelineUiState: () => void;
};

export default function useTimelineController(params: TimelineControllerParams): TimelineController {
	const [timelineNavigationEntries, setTimelineNavigationEntries] = useState<SessionTimelineNavigationEntry[]>([]);
	const [isTimelineLoadingBefore, setIsTimelineLoadingBefore] = useState<boolean>(false);
	const [isTimelineLoadingAfter, setIsTimelineLoadingAfter] = useState<boolean>(false);
	const isTimelinePageLoadingRef = useRef<boolean>(false);
	const timelineNavigationRequestVersionRef = useRef<number>(0);

	const resetTimelineUiState = useCallback((): void => {
		isTimelinePageLoadingRef.current = false;
		timelineNavigationRequestVersionRef.current += 1;
		setTimelineNavigationEntries([]);
		setIsTimelineLoadingBefore(false);
		setIsTimelineLoadingAfter(false);
	}, []);

	const refreshTimelineNavigationEntries = useCallback(async (sessionIdOverride?: string): Promise<void> => {
		const sessionId: string | null = sessionIdOverride ?? params.activeSessionId;
		const requestVersion: number = timelineNavigationRequestVersionRef.current + 1;
		timelineNavigationRequestVersionRef.current = requestVersion;
		if (sessionId === null) {
			setTimelineNavigationEntries([]);
			return;
		}
		try {
			const result = await fetchSessionTimelineIndex(sessionId);
			if (
				timelineNavigationRequestVersionRef.current === requestVersion
				&& params.activeSessionIdRef.current === sessionId
				&& result.sessionId === sessionId
			) {
				setTimelineNavigationEntries(result.entries);
			}
		} catch (error: unknown) {
			if (timelineNavigationRequestVersionRef.current === requestVersion) {
				console.warn("[App] load timeline navigation index failed", error);
			}
		}
	}, [params.activeSessionId, params.activeSessionIdRef]);

	useEffect((): void => {
		void refreshTimelineNavigationEntries();
	}, [params.timelineBlockCount, refreshTimelineNavigationEntries]);

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
		refreshTimelineNavigationEntries,
		resetTimelineUiState
	};
}
