import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useMemoizedFn } from "ahooks";
import type { TimelineBlock } from "@/api/types";
import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";
import { applyBackendEventsToTimeline, type TimelinePageState } from "@/features/workbench/workbench-state";

const TIMELINE_STREAM_BATCH_MS = 50;

type RefValue<T> = {
	current: T;
};

export type TimelineStreamBufferController = {
	discardPendingTimelineEvents: () => void;
	flushPendingTimelineEvents: () => void;
	enqueueTimelineStreamingEvent: (event: BackendEvent, sessionId: string | null) => void;
};

export type TimelineStreamBufferParams = {
	activeSessionIdRef: RefValue<string | null>;
	setTimelinePage: Dispatch<SetStateAction<TimelinePageState>>;
};

function useTimelineStreamBuffer({ activeSessionIdRef, setTimelinePage }: TimelineStreamBufferParams): TimelineStreamBufferController {
	const pendingTimelineEventsRef = useRef<BackendEvent[]>([]);
	const pendingTimelineSessionIdRef = useRef<string | null>(null);
	const timelineStreamBatchTimerRef = useRef<number | null>(null);

	const clearTimelineStreamBatchTimer = useMemoizedFn((): void => {
		if (timelineStreamBatchTimerRef.current === null) {
			return;
		}

		window.clearTimeout(timelineStreamBatchTimerRef.current);
		timelineStreamBatchTimerRef.current = null;
	});

	const discardPendingTimelineEvents = useMemoizedFn((): void => {
		clearTimelineStreamBatchTimer();
		pendingTimelineEventsRef.current = [];
		pendingTimelineSessionIdRef.current = null;
	});

	const flushPendingTimelineEvents = useMemoizedFn((): void => {
		clearTimelineStreamBatchTimer();

		const events: BackendEvent[] = pendingTimelineEventsRef.current;
		const sessionId: string | null = pendingTimelineSessionIdRef.current;
		pendingTimelineEventsRef.current = [];
		pendingTimelineSessionIdRef.current = null;

		if (events.length === 0 || sessionId !== activeSessionIdRef.current) {
			return;
		}

		setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
			const blocks: TimelineBlock[] = applyBackendEventsToTimeline(currentPage.blocks, events);
			return {
				...currentPage,
				blocks
			};
		});
	});

	const enqueueTimelineStreamingEvent = useMemoizedFn((event: BackendEvent, sessionId: string | null): void => {
		if (
			pendingTimelineEventsRef.current.length > 0
			&& pendingTimelineSessionIdRef.current !== sessionId
		) {
			discardPendingTimelineEvents();
		}

		pendingTimelineSessionIdRef.current = sessionId;
		pendingTimelineEventsRef.current.push(event);
		if (timelineStreamBatchTimerRef.current !== null) {
			return;
		}

		timelineStreamBatchTimerRef.current = window.setTimeout(
			flushPendingTimelineEvents,
			TIMELINE_STREAM_BATCH_MS
		);
	});

	useEffect((): (() => void) => {
		return (): void => {
			discardPendingTimelineEvents();
		};
	}, [discardPendingTimelineEvents]);

	return {
		discardPendingTimelineEvents,
		flushPendingTimelineEvents,
		enqueueTimelineStreamingEvent
	};
}

export default useTimelineStreamBuffer;
