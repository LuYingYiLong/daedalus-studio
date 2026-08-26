import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_TRACE_SUMMARY, mergeTraceRecords } from "@/domain/trajectory/trajectory-model";
import { onBackendEvent, onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import { fetchTraceDetail, fetchTracePage, fetchTraceSummary, type TraceDetail, type TraceRecord, type TraceSummary } from "@/platform/rpc/trace-api";

type TraceUpdatedData = { revision?: unknown; record?: unknown };

function isTraceRecord(value: unknown): value is TraceRecord {
	return typeof value === "object" && value !== null
		&& typeof (value as { recordId?: unknown }).recordId === "string"
		&& typeof (value as { sequence?: unknown }).sequence === "number";
}

export type TrajectoryController = {
	summary: TraceSummary;
	records: TraceRecord[];
	selectedRecordId: string | null;
	detail: TraceDetail | null;
	nextCursor?: string;
	isLoading: boolean;
	isLoadingMore: boolean;
	isLoadingDetail: boolean;
	unavailable: boolean;
	error: string | null;
	selectRecord: (recordId: string) => void;
	loadMore: () => Promise<void>;
	reload: () => Promise<void>;
};

export function useTrajectoryController(sessionId: string | null, isActive: boolean): TrajectoryController {
	const [summary, setSummary] = useState<TraceSummary>(EMPTY_TRACE_SUMMARY);
	const [records, setRecords] = useState<TraceRecord[]>([]);
	const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
	const [detail, setDetail] = useState<TraceDetail | null>(null);
	const [nextCursor, setNextCursor] = useState<string | undefined>();
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
	const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
	const [unavailable, setUnavailable] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const reload = useCallback(async (): Promise<void> => {
		if (sessionId === null) return;
		setIsLoading(true);
		setError(null);
		try {
			const [nextSummary, page] = await Promise.all([fetchTraceSummary(sessionId), fetchTracePage({ sessionId, limit: 100 })]);
			setSummary(nextSummary);
			setRecords(page.records);
			setNextCursor(page.nextCursor);
			setUnavailable(false);
		} catch (loadError: unknown) {
			const message: string = loadError instanceof Error ? loadError.message : String(loadError);
			setUnavailable(/unknown_method|method_not_found|unsupported/i.test(message));
			setError(message);
		} finally {
			setIsLoading(false);
		}
	}, [sessionId]);

	const selectRecord = useCallback((recordId: string): void => setSelectedRecordId(recordId), []);

	const loadMore = useCallback(async (): Promise<void> => {
		if (sessionId === null || nextCursor === undefined || isLoadingMore) return;
		setIsLoadingMore(true);
		try {
			const page = await fetchTracePage({ sessionId, cursor: nextCursor, limit: 100 });
			setRecords((current): TraceRecord[] => mergeTraceRecords(current, page.records));
			setNextCursor(page.nextCursor);
		} catch (loadError: unknown) {
			setError(loadError instanceof Error ? loadError.message : String(loadError));
		} finally {
			setIsLoadingMore(false);
		}
	}, [isLoadingMore, nextCursor, sessionId]);

	useEffect((): void => {
		setSummary(EMPTY_TRACE_SUMMARY);
		setRecords([]);
		setSelectedRecordId(null);
		setDetail(null);
		setNextCursor(undefined);
		setUnavailable(false);
		setError(null);
		if (isActive) void reload();
	}, [isActive, reload, sessionId]);

	useEffect((): (() => void) | void => {
		if (!isActive || sessionId === null) return;
		let cancelled: boolean = false;
		let removeEventListener: (() => void) | undefined;
		void onBackendEvent((event): void => {
			if (event.event !== "session.trace.updated" || event.sessionId !== sessionId) return;
			const data: TraceUpdatedData = typeof event.data === "object" && event.data !== null ? event.data as TraceUpdatedData : {};
			const updatedRecord: unknown = data.record;
			if (isTraceRecord(updatedRecord)) setRecords((current): TraceRecord[] => mergeTraceRecords(current, [updatedRecord]));
			if (summaryTimerRef.current !== null) clearTimeout(summaryTimerRef.current);
			summaryTimerRef.current = setTimeout((): void => {
				void fetchTraceSummary(sessionId).then(setSummary).catch((): void => undefined);
			}, 150);
		}).then((remove): void => {
			if (cancelled) remove(); else removeEventListener = remove;
		});
		const removeReconnectListener = onBackendReconnected((): void => { void reload(); });
		return (): void => {
			cancelled = true;
			removeEventListener?.();
			removeReconnectListener();
			if (summaryTimerRef.current !== null) clearTimeout(summaryTimerRef.current);
		};
	}, [isActive, reload, sessionId]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		if (sessionId === null || selectedRecordId === null) {
			setDetail(null);
			return (): void => { cancelled = true; };
		}
		setIsLoadingDetail(true);
		void fetchTraceDetail(sessionId, selectedRecordId)
			.then((nextDetail): void => { if (!cancelled) setDetail(nextDetail); })
			.catch((detailError: unknown): void => { if (!cancelled) setError(detailError instanceof Error ? detailError.message : String(detailError)); })
			.finally((): void => { if (!cancelled) setIsLoadingDetail(false); });
		return (): void => { cancelled = true; };
	}, [selectedRecordId, sessionId]);

	return { summary, records, selectedRecordId, detail, nextCursor, isLoading, isLoadingMore, isLoadingDetail, unavailable, error, selectRecord, loadMore, reload };
}
