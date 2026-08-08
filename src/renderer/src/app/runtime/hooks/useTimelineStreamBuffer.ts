import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";

const TIMELINE_STREAM_BATCH_MS = 40;
const BACKGROUND_TIMELINE_STREAM_BATCH_MS = 120;

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
	timelineStore: TimelinePageStore;
};

function useTimelineStreamBuffer({ activeSessionIdRef, timelineStore }: TimelineStreamBufferParams): TimelineStreamBufferController {
	const pendingTimelineEventsRef = useRef<BackendEvent[]>([]);
	const pendingTimelineSessionIdRef = useRef<string | null>(null);
	const timelineStreamBatchTimerRef = useRef<number | null>(null);
	const timelineStreamFrameRef = useRef<number | null>(null);

	const clearTimelineStreamBatchTimer = useMemoizedFn((): void => {
		if (timelineStreamBatchTimerRef.current !== null) {
			window.clearTimeout(timelineStreamBatchTimerRef.current);
			timelineStreamBatchTimerRef.current = null;
		}
		if (timelineStreamFrameRef.current !== null) {
			window.cancelAnimationFrame(timelineStreamFrameRef.current);
			timelineStreamFrameRef.current = null;
		}
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

		timelineStore.applyEvents(events);
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
		if (timelineStreamBatchTimerRef.current !== null || timelineStreamFrameRef.current !== null) {
			return;
		}

		timelineStreamBatchTimerRef.current = window.setTimeout((): void => {
			timelineStreamBatchTimerRef.current = null;
			timelineStreamFrameRef.current = window.requestAnimationFrame((): void => {
				timelineStreamFrameRef.current = null;
				flushPendingTimelineEvents();
			});
		}, document.visibilityState === "hidden" ? BACKGROUND_TIMELINE_STREAM_BATCH_MS : TIMELINE_STREAM_BATCH_MS);
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
