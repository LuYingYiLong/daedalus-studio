import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	cancelSessionTimelineSearch,
	fetchSessionTimelineSearchPage,
	startSessionTimelineSearch
} from "@/api/session-api";
import type { SessionTimelineSearchDocument, TimelineBlock } from "@/api/types";
import type {
	ConversationSearchMatch,
	ConversationSearchWorkerRequest,
	ConversationSearchWorkerResponse
} from "./conversation-search-engine";

type UseConversationSearchOptions = {
	sessionId: string | null;
	timelineBlocks: TimelineBlock[];
	timelineBlockOffset: number;
	activeRetryRequestId: string | null;
	onLoadBlockOffset: (blockOffset: number) => Promise<void>;
	onLoadError: (error: unknown) => void;
};

export type ConversationSearchController = {
	open: boolean;
	query: string;
	total: number;
	current: number;
	loading: boolean;
	activeMatch: ConversationSearchMatch | null;
	openSearch: (selectedQuery?: string) => void;
	closeSearch: () => void;
	setQuery: (query: string) => void;
	goPrevious: () => void;
	goNext: () => void;
};

export function timelineBlocksToSearchDocuments(
	blocks: TimelineBlock[],
	blockOffset: number
): SessionTimelineSearchDocument[] {
	return blocks.flatMap((block: TimelineBlock, index: number): SessionTimelineSearchDocument[] => {
		const absoluteBlockOffset: number = blockOffset + index;
		if (block.type === "user") {
			return block.content.length === 0 ? [] : [{
				blockOffset: absoluteBlockOffset,
				requestId: block.requestId,
				role: "user",
				markdownSegments: [block.content]
			}];
		}
		const summaryStartIndex: number = block.bodyParts.findIndex((part): boolean => part.type === "summary_start");
		const visibleBodyParts = summaryStartIndex < 0
			? block.bodyParts
			: block.bodyParts.slice(summaryStartIndex + 1);
		const markdownSegments: string[] = visibleBodyParts
			.filter((part) => part.type === "markdown")
			.map((part) => part.text)
			.filter((text: string): boolean => text.length > 0);
		return markdownSegments.length === 0 ? [] : [{
			blockOffset: absoluteBlockOffset,
			requestId: block.requestId,
			role: "assistant",
			markdownSegments
		}];
	});
}

export function useConversationSearch({
	sessionId,
	timelineBlocks,
	timelineBlockOffset,
	activeRetryRequestId,
	onLoadBlockOffset,
	onLoadError
}: UseConversationSearchOptions): ConversationSearchController {
	const [open, setOpen] = useState<boolean>(false);
	const [query, setQueryState] = useState<string>("");
	const [total, setTotal] = useState<number>(0);
	const [currentOrdinal, setCurrentOrdinal] = useState<number>(-1);
	const [loading, setLoading] = useState<boolean>(false);
	const [activeMatch, setActiveMatch] = useState<ConversationSearchMatch | null>(null);
	const workerRef = useRef<Worker | null>(null);
	const generationRef = useRef<number>(0);
	const requestIdRef = useRef<number>(0);
	const latestRequestIdRef = useRef<number>(0);
	const indexedSessionIdRef = useRef<string | null>(null);
	const followLatestMatchRef = useRef<boolean>(true);
	const queryRef = useRef<string>("");
	const currentOrdinalRef = useRef<number>(-1);
	const loadingRef = useRef<boolean>(false);
	const openRef = useRef<boolean>(false);
	const loadedDocumentsRef = useRef<SessionTimelineSearchDocument[]>([]);
	const searchDebounceRef = useRef<number | null>(null);
	const loadedUpdateRef = useRef<number | null>(null);
	const pendingLoadOffsetRef = useRef<number | null>(null);
	const searchIdRef = useRef<string | null>(null);
	const historyRefreshRef = useRef<number | null>(null);

	const loadedDocuments: SessionTimelineSearchDocument[] = useMemo(
		(): SessionTimelineSearchDocument[] => timelineBlocksToSearchDocuments(timelineBlocks, timelineBlockOffset),
		[timelineBlockOffset, timelineBlocks]
	);
	loadedDocumentsRef.current = loadedDocuments;
	queryRef.current = query;
	currentOrdinalRef.current = currentOrdinal;
	loadingRef.current = loading;
	openRef.current = open;

	const sendToWorker = useCallback((message: ConversationSearchWorkerRequest): void => {
		workerRef.current?.postMessage(message);
	}, []);

	const sendSearch = useCallback((requestedOrdinal?: number): void => {
		if (workerRef.current === null) {
			return;
		}
		const trimmedQuery: string = queryRef.current.trim();
		if (trimmedQuery.length === 0) {
			setTotal(0);
			setCurrentOrdinal(-1);
			setActiveMatch(null);
			return;
		}
		const requestId: number = ++requestIdRef.current;
		latestRequestIdRef.current = requestId;
		const request: ConversationSearchWorkerRequest = {
			type: "search",
			requestId,
			query: queryRef.current
		};
		if (requestedOrdinal !== undefined) {
			request.ordinal = Math.max(0, requestedOrdinal);
		}
		sendToWorker(request);
	}, [sendToWorker]);

	const refreshSearch = useCallback((): void => {
		sendSearch(followLatestMatchRef.current
			? undefined
			: Math.max(0, currentOrdinalRef.current));
	}, [sendSearch]);

	const scheduleHistoryRefresh = useCallback((): void => {
		if (historyRefreshRef.current !== null) return;
		historyRefreshRef.current = window.setTimeout((): void => {
			historyRefreshRef.current = null;
			if (queryRef.current.trim().length > 0) refreshSearch();
		}, 120);
	}, [refreshSearch]);

	const releaseRemoteSearch = useCallback((): void => {
		const searchId: string | null = searchIdRef.current;
		searchIdRef.current = null;
		if (searchId !== null) {
			void cancelSessionTimelineSearch(searchId).catch((): void => {});
		}
	}, []);

	const ensureWorker = useCallback((): Worker => {
		if (workerRef.current !== null) {
			return workerRef.current;
		}
		const worker = new Worker(new URL("./conversation-search-worker.ts", import.meta.url), { type: "module" });
		worker.addEventListener("message", (event: MessageEvent<ConversationSearchWorkerResponse>): void => {
			const response: ConversationSearchWorkerResponse = event.data;
			if (response.type !== "result" || response.requestId !== latestRequestIdRef.current) {
				return;
			}
			setTotal(response.total);
			setCurrentOrdinal(response.ordinal);
			setActiveMatch(response.match);
		});
		const handleWorkerFailure = (event: ErrorEvent | MessageEvent): void => {
			event.preventDefault();
			if (workerRef.current !== worker) {
				return;
			}
			generationRef.current += 1;
			indexedSessionIdRef.current = null;
			worker.terminate();
			workerRef.current = null;
			setLoading(false);
			loadingRef.current = false;
			setTotal(0);
			setCurrentOrdinal(-1);
			setActiveMatch(null);
			const message: string = event instanceof ErrorEvent && event.message.trim().length > 0
				? event.message
				: "Conversation search worker failed.";
			onLoadError(new Error(message));
		};
		worker.addEventListener("error", handleWorkerFailure);
		worker.addEventListener("messageerror", handleWorkerFailure);
		workerRef.current = worker;
		return worker;
	}, [onLoadError]);

	const startIndexing = useCallback((): void => {
		if (sessionId === null || indexedSessionIdRef.current === sessionId) {
			refreshSearch();
			return;
		}
		releaseRemoteSearch();
		const worker: Worker = ensureWorker();
		const generation: number = ++generationRef.current;
		indexedSessionIdRef.current = null;
		const shouldLoadHistory: boolean = queryRef.current.trim().length > 0;
		loadingRef.current = shouldLoadHistory;
		setLoading(shouldLoadHistory);
		setTotal(0);
		setCurrentOrdinal(-1);
		setActiveMatch(null);
		worker.postMessage({ type: "reset" } satisfies ConversationSearchWorkerRequest);
		worker.postMessage({
			type: "upsert",
			documents: loadedDocumentsRef.current
		} satisfies ConversationSearchWorkerRequest);
		refreshSearch();
		if (!shouldLoadHistory) return;

		void (async (): Promise<void> => {
			let nextOffset: number = 0;
			let restartForGenerationChange: boolean = false;
			try {
				let page = await startSessionTimelineSearch(sessionId);
				searchIdRef.current = page.searchId;
				while (true) {
					if (generationRef.current !== generation || page.sessionId !== sessionId) {
						void cancelSessionTimelineSearch(page.searchId).catch((): void => {});
						return;
					}
					worker.postMessage({
						type: "upsert",
						documents: page.documents
					} satisfies ConversationSearchWorkerRequest);
					worker.postMessage({
						type: "upsert",
						documents: loadedDocumentsRef.current
					} satisfies ConversationSearchWorkerRequest);
					scheduleHistoryRefresh();
					if (page.status === "ready" && page.nextOffset === null) break;
					if (page.pending) {
						await new Promise<void>((resolve): void => {
							window.setTimeout(resolve, page.retryAfterMs ?? 150);
						});
					} else {
						nextOffset = page.nextOffset ?? page.indexedThroughOffset;
					}
					if (generationRef.current !== generation) return;
					page = await fetchSessionTimelineSearchPage(page.searchId, nextOffset, 400);
				}
			} catch (error: unknown) {
				if (generationRef.current !== generation) {
					return;
				}
				const message: string = error instanceof Error ? error.message : String(error);
				if (message.includes("session_search_generation_changed")) {
					restartForGenerationChange = true;
				} else if (!message.includes("session_search_not_found")) {
					onLoadError(error);
				}
			}
			if (generationRef.current !== generation) {
				return;
			}
			if (restartForGenerationChange && openRef.current && queryRef.current.trim().length > 0) {
				indexedSessionIdRef.current = null;
				window.setTimeout(startIndexing, 0);
				return;
			}
			indexedSessionIdRef.current = sessionId;
			setLoading(false);
			loadingRef.current = false;
			refreshSearch();
		})();
	}, [ensureWorker, onLoadError, refreshSearch, releaseRemoteSearch, scheduleHistoryRefresh, sessionId]);

	const openSearch = useCallback((selectedQuery?: string): void => {
		if (sessionId === null) {
			return;
		}
		if (selectedQuery !== undefined && selectedQuery !== queryRef.current) {
			if (searchDebounceRef.current !== null) {
				window.clearTimeout(searchDebounceRef.current);
				searchDebounceRef.current = null;
			}
			queryRef.current = selectedQuery;
			setQueryState(selectedQuery);
			setTotal(0);
			setCurrentOrdinal(-1);
			setActiveMatch(null);
		}
		followLatestMatchRef.current = true;
		openRef.current = true;
		setOpen(true);
		startIndexing();
	}, [sessionId, startIndexing]);

	const closeSearch = useCallback((): void => {
		openRef.current = false;
		generationRef.current += 1;
		indexedSessionIdRef.current = null;
		releaseRemoteSearch();
		setLoading(false);
		loadingRef.current = false;
		setOpen(false);
	}, [releaseRemoteSearch]);

	const setQuery = useCallback((nextQuery: string): void => {
		queryRef.current = nextQuery;
		followLatestMatchRef.current = true;
		setQueryState(nextQuery);
		setTotal(0);
		setCurrentOrdinal(-1);
		setActiveMatch(null);
		if (searchDebounceRef.current !== null) {
			window.clearTimeout(searchDebounceRef.current);
		}
		if (nextQuery.trim().length === 0) {
			generationRef.current += 1;
			indexedSessionIdRef.current = null;
			releaseRemoteSearch();
			setLoading(false);
			loadingRef.current = false;
			return;
		}
		searchDebounceRef.current = window.setTimeout((): void => {
			searchDebounceRef.current = null;
			if (openRef.current && searchIdRef.current === null && indexedSessionIdRef.current === null) {
				startIndexing();
			} else {
				sendSearch();
			}
		}, 80);
	}, [releaseRemoteSearch, sendSearch, startIndexing]);

	const resolveOrdinal = useCallback((ordinal: number): void => {
		if (workerRef.current === null || total <= 0) {
			return;
		}
		followLatestMatchRef.current = false;
		const normalizedOrdinal: number = ((ordinal % total) + total) % total;
		const requestId: number = ++requestIdRef.current;
		latestRequestIdRef.current = requestId;
		sendToWorker({ type: "resolve", requestId, ordinal: normalizedOrdinal });
	}, [sendToWorker, total]);

	const goPrevious = useCallback((): void => {
		resolveOrdinal(currentOrdinalRef.current - 1);
	}, [resolveOrdinal]);

	const goNext = useCallback((): void => {
		resolveOrdinal(currentOrdinalRef.current + 1);
	}, [resolveOrdinal]);

	useEffect((): (() => void) => {
		return (): void => {
			if (searchDebounceRef.current !== null) {
				window.clearTimeout(searchDebounceRef.current);
			}
			if (loadedUpdateRef.current !== null) {
				window.clearTimeout(loadedUpdateRef.current);
			}
			if (historyRefreshRef.current !== null) {
				window.clearTimeout(historyRefreshRef.current);
			}
			releaseRemoteSearch();
			workerRef.current?.terminate();
			workerRef.current = null;
		};
	}, [releaseRemoteSearch]);

	useEffect((): void => {
		generationRef.current += 1;
		releaseRemoteSearch();
		indexedSessionIdRef.current = null;
		if (searchDebounceRef.current !== null) {
			window.clearTimeout(searchDebounceRef.current);
			searchDebounceRef.current = null;
		}
		if (loadedUpdateRef.current !== null) {
			window.clearTimeout(loadedUpdateRef.current);
			loadedUpdateRef.current = null;
		}
		workerRef.current?.terminate();
		workerRef.current = null;
		pendingLoadOffsetRef.current = null;
		setOpen(false);
		openRef.current = false;
		setQueryState("");
		queryRef.current = "";
		setTotal(0);
		setCurrentOrdinal(-1);
		setActiveMatch(null);
		setLoading(false);
		loadingRef.current = false;
		followLatestMatchRef.current = true;
	}, [releaseRemoteSearch, sessionId]);

	useEffect((): void => {
		if (activeRetryRequestId === null) {
			return;
		}
		generationRef.current += 1;
		releaseRemoteSearch();
		indexedSessionIdRef.current = null;
		if (searchDebounceRef.current !== null) {
			window.clearTimeout(searchDebounceRef.current);
			searchDebounceRef.current = null;
		}
		if (loadedUpdateRef.current !== null) {
			window.clearTimeout(loadedUpdateRef.current);
			loadedUpdateRef.current = null;
		}
		workerRef.current?.terminate();
		workerRef.current = null;
		setOpen(false);
		openRef.current = false;
		setQueryState("");
		queryRef.current = "";
		setTotal(0);
		setCurrentOrdinal(-1);
		setActiveMatch(null);
		setLoading(false);
		loadingRef.current = false;
		followLatestMatchRef.current = true;
	}, [activeRetryRequestId, releaseRemoteSearch]);

	useEffect((): (() => void) | void => {
		if (workerRef.current === null) {
			return;
		}
		if (loadedUpdateRef.current !== null) {
			window.clearTimeout(loadedUpdateRef.current);
		}
		loadedUpdateRef.current = window.setTimeout((): void => {
			loadedUpdateRef.current = null;
			sendToWorker({ type: "upsert", documents: loadedDocumentsRef.current });
			if (queryRef.current.trim().length > 0) {
				refreshSearch();
			}
		}, 120);
		return (): void => {
			if (loadedUpdateRef.current !== null) {
				window.clearTimeout(loadedUpdateRef.current);
				loadedUpdateRef.current = null;
			}
		};
	}, [loadedDocuments, refreshSearch, sendToWorker]);

	useEffect((): void => {
		if (activeMatch === null) {
			pendingLoadOffsetRef.current = null;
			return;
		}
		const loadedEndOffset: number = timelineBlockOffset + timelineBlocks.length;
		if (
			activeMatch.blockOffset >= timelineBlockOffset
			&& activeMatch.blockOffset < loadedEndOffset
		) {
			pendingLoadOffsetRef.current = null;
			return;
		}
		if (pendingLoadOffsetRef.current === activeMatch.blockOffset) {
			return;
		}
		pendingLoadOffsetRef.current = activeMatch.blockOffset;
		void onLoadBlockOffset(activeMatch.blockOffset)
			.catch(onLoadError)
			.finally((): void => {
				if (pendingLoadOffsetRef.current === activeMatch.blockOffset) {
					pendingLoadOffsetRef.current = null;
				}
			});
	}, [activeMatch, onLoadBlockOffset, onLoadError, timelineBlockOffset, timelineBlocks.length]);

	return {
		open,
		query,
		total,
		current: currentOrdinal < 0 ? 0 : currentOrdinal + 1,
		loading,
		activeMatch,
		openSearch,
		closeSearch,
		setQuery,
		goPrevious,
		goNext
	};
}
