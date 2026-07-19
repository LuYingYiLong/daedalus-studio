import { TimelineAssistantBlock, TimelineBlock } from "@/api/types";
import AssistantBubble from "../bubble/AssistantBubble";
import UserBubble from "../bubble/UserBubble";
import type { RetryUserMessagePayload } from "../bubble/UserBubble";
import styles from "./MessageList.module.css";
import { formatElapsedTime, formatShortDateTime } from "@/utils/time-format";
import { Spin, Alert } from "antd";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	areVisibleRangesEqual,
	calculateVisibleRange,
	createPrefixHeights,
	isNearBottomByMetrics,
	shouldAutoFollowAppend,
	type VisibleRange
} from "./message-list-virtual";

export type MessageListProps = {
	blocks: TimelineBlock[];
	isLoading?: boolean;
	errorMessage?: string | null;
	hasMoreBefore?: boolean;
	hasMoreAfter?: boolean;
	initialScrollToBottomKey?: string;
	onLoadMoreBefore?: () => void;
	onLoadMoreAfter?: () => void;
	retryDisabled?: boolean;
	activeRetryRequestId?: string | null;
	onRetryEditStart?: (requestId: string) => void;
	onRetryEditCancel?: (requestId: string) => void;
	onRetryFromUserMessage?: (payload: RetryUserMessagePayload) => boolean | void | Promise<boolean | void>;
};

type ScrollAnchor = {
	entryId: string;
	top: number;
};

const DEFAULT_USER_HEIGHT: number = 96;
const DEFAULT_ASSISTANT_HEIGHT: number = 180;
const OVERSCAN_BLOCKS: number = 8;
const NEAR_BOTTOM_THRESHOLD: number = 320;
const LOAD_MORE_THRESHOLD: number = 320;
const MEASUREMENT_SETTLE_DELAY_MS: number = 180;

function getAssistantMarkdown(block: TimelineAssistantBlock): string {
	const markdown: string = block.bodyParts
		.filter((part) => part.type === "markdown")
		.map((part) => part.text)
		.join("");

	return markdown.length > 0 ? markdown : block.content;
}

export function shouldRenderTimelineBlock(block: TimelineBlock): boolean {
	if (block.type !== "assistant") {
		return true;
	}

	if (block.status === "running") {
		return true;
	}

	return block.content.trim().length > 0 || block.bodyParts.length > 0;
}

function estimateBlockHeight(block: TimelineBlock): number {
	if (block.renderHints?.estimatedHeight !== undefined) {
		return Math.max(56, block.renderHints.estimatedHeight);
	}

	if (block.type === "user") {
		const contextHeight: number = block.additionalContext !== undefined && block.additionalContext.length > 0 ? 34 : 0;
		return contextHeight + Math.max(DEFAULT_USER_HEIGHT, Math.min(260, block.content.length * 0.42));
	}

	const contentChars: number = block.bodyParts.reduce((total: number, part): number => {
		if (part.type === "markdown" || part.type === "thinking") {
			return total + part.text.length;
		}

		return total + 240;
	}, 0);

	return Math.max(DEFAULT_ASSISTANT_HEIGHT, Math.min(720, contentChars * 0.36));
}

function isNearBottom(element: HTMLElement): boolean {
	return isNearBottomByMetrics(element.scrollHeight, element.scrollTop, element.clientHeight, NEAR_BOTTOM_THRESHOLD);
}

function scrollToBottom(element: HTMLElement, behavior: ScrollBehavior = "auto"): void {
	element.scrollTo({
		top: element.scrollHeight,
		behavior
	});
}

function queryEntryElement(container: HTMLElement, entryId: string): HTMLElement | null {
	return container.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`);
}

function MessageList({
	blocks,
	isLoading,
	errorMessage,
	hasMoreBefore = false,
	hasMoreAfter = false,
	initialScrollToBottomKey = "",
	onLoadMoreBefore,
	onLoadMoreAfter,
	retryDisabled = false,
	activeRetryRequestId = null,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage
}: MessageListProps): React.JSX.Element {
	const listRef = useRef<HTMLElement | null>(null);
	const measuredHeightsRef = useRef<Map<string, number>>(new Map());
	const resizeObserverRef = useRef<ResizeObserver | null>(null);
	const pendingAnchorRef = useRef<ScrollAnchor | null>(null);
	const lastInitialScrollKeyRef = useRef<string>("");
	const lastBlockCountRef = useRef<number>(0);
	const autoFollowRef = useRef<boolean>(true);
	const viewportHeightRef = useRef<number>(720);
	const viewportScrollTopRef = useRef<number>(0);
	const viewportFrameRef = useRef<number | null>(null);
	const measurementFrameRef = useRef<number | null>(null);
	const measurementSettleTimerRef = useRef<number | null>(null);
	const visibleRangeRef = useRef<VisibleRange>({
		startIndex: 0,
		endIndex: 0
	});
	const [nowMs, setNowMs] = useState<number>(() => Date.now());
	const [measurementVersion, setMeasurementVersion] = useState<number>(0);
	const [visibleRange, setVisibleRange] = useState<VisibleRange>({
		startIndex: 0,
		endIndex: 0
	});
	const renderableBlocks: TimelineBlock[] = useMemo((): TimelineBlock[] => {
		return blocks.filter(shouldRenderTimelineBlock);
	}, [blocks]);
	const hasRunningAssistantBlock: boolean = renderableBlocks.some((block: TimelineBlock): boolean => {
		return block.type === "assistant" && block.status === "running";
	});
	const heightById: Map<string, number> = measuredHeightsRef.current;
	const estimatedHeights: number[] = useMemo((): number[] => {
		return renderableBlocks.map((block: TimelineBlock): number => heightById.get(block.id) ?? estimateBlockHeight(block));
	}, [renderableBlocks, heightById, measurementVersion]);
	const prefixHeights: number[] = useMemo((): number[] => createPrefixHeights(estimatedHeights), [estimatedHeights]);
	const totalEstimatedHeight: number = prefixHeights[prefixHeights.length - 1] ?? 0;
	const startIndex: number = visibleRange.startIndex;
	const endIndex: number = visibleRange.endIndex;
	const topSpacerHeight: number = prefixHeights[startIndex] ?? 0;
	const bottomSpacerHeight: number = Math.max(0, totalEstimatedHeight - (prefixHeights[endIndex] ?? 0));
	const visibleBlocks: TimelineBlock[] = renderableBlocks.slice(startIndex, endIndex);
	const visibleBlockIds: string = visibleBlocks.map((block: TimelineBlock): string => block.id).join("\n");

	const updateVisibleRange = useCallback((): void => {
		const nextVisibleRange: VisibleRange = calculateVisibleRange(
			prefixHeights,
			viewportScrollTopRef.current,
			viewportHeightRef.current,
			renderableBlocks.length,
			OVERSCAN_BLOCKS
		);

		if (areVisibleRangesEqual(visibleRangeRef.current, nextVisibleRange)) {
			return;
		}

		visibleRangeRef.current = nextVisibleRange;
		setVisibleRange(nextVisibleRange);
	}, [renderableBlocks.length, prefixHeights]);

	const scheduleVisibleRangeUpdate = useCallback((): void => {
		if (viewportFrameRef.current !== null) {
			return;
		}

		viewportFrameRef.current = window.requestAnimationFrame((): void => {
			viewportFrameRef.current = null;
			updateVisibleRange();
		});
	}, [updateVisibleRange]);

	const syncViewportMetrics = useCallback((element: HTMLElement): void => {
		autoFollowRef.current = isNearBottom(element);
		viewportScrollTopRef.current = element.scrollTop;
		viewportHeightRef.current = element.clientHeight;
		scheduleVisibleRangeUpdate();
	}, [scheduleVisibleRangeUpdate]);

	const scheduleAutoFollowScroll = useCallback((behavior: ScrollBehavior = "auto"): void => {
		if (!autoFollowRef.current) {
			return;
		}

		window.requestAnimationFrame((): void => {
			const element: HTMLElement | null = listRef.current;
			if (element === null || !autoFollowRef.current) {
				return;
			}

			scrollToBottom(element, behavior);
			syncViewportMetrics(element);
		});
	}, [syncViewportMetrics]);

	const updateViewport = useCallback((): void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null) {
			return;
		}

		const nearBottom: boolean = isNearBottom(element);
		syncViewportMetrics(element);

		if (element.scrollTop < LOAD_MORE_THRESHOLD && hasMoreBefore) {
			const anchorElement = element.querySelector("[data-entry-id]") as HTMLElement | null;
			if (anchorElement !== null) {
				const entryId: string | null = anchorElement.getAttribute("data-entry-id");
				if (entryId !== null) {
					pendingAnchorRef.current = {
						entryId,
						top: anchorElement.getBoundingClientRect().top
					};
				}
			}
			onLoadMoreBefore?.();
		}

		const distanceFromBottom: number = element.scrollHeight - element.scrollTop - element.clientHeight;
		if (distanceFromBottom < LOAD_MORE_THRESHOLD && hasMoreAfter && nearBottom) {
			onLoadMoreAfter?.();
		}
	}, [hasMoreAfter, hasMoreBefore, onLoadMoreAfter, onLoadMoreBefore, syncViewportMetrics]);

	useEffect((): (() => void) | void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null) {
			return;
		}

		updateViewport();
		element.addEventListener("scroll", updateViewport, { passive: true });
		window.addEventListener("resize", updateViewport);

		return (): void => {
			element.removeEventListener("scroll", updateViewport);
			window.removeEventListener("resize", updateViewport);
		};
	}, [updateViewport]);

	useLayoutEffect((): (() => void) | void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null || typeof ResizeObserver === "undefined") {
			return;
		}

		resizeObserverRef.current?.disconnect();
		const observer = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
			let hasInitialMeasurement: boolean = false;
			let hasExistingMeasurementChange: boolean = false;
			for (const entry of entries) {
				const target = entry.target as HTMLElement;
				const entryId: string | null = target.getAttribute("data-entry-id");
				if (entryId === null) {
					continue;
				}

				const nextHeight: number = Math.ceil(entry.contentRect.height);
				if (nextHeight <= 0) {
					continue;
				}

				const previousHeight: number | undefined = measuredHeightsRef.current.get(entryId);
				if (previousHeight !== nextHeight) {
					measuredHeightsRef.current.set(entryId, nextHeight);
					if (previousHeight === undefined) {
						hasInitialMeasurement = true;
					} else {
						hasExistingMeasurementChange = true;
					}
				}
			}

			if (hasInitialMeasurement) {
				if (measurementFrameRef.current === null) {
					measurementFrameRef.current = window.requestAnimationFrame((): void => {
						measurementFrameRef.current = null;
						setMeasurementVersion((currentVersion: number): number => currentVersion + 1);
					});
				}
			}

			if (hasExistingMeasurementChange) {
				if (measurementSettleTimerRef.current !== null) {
					window.clearTimeout(measurementSettleTimerRef.current);
				}

				measurementSettleTimerRef.current = window.setTimeout((): void => {
					measurementSettleTimerRef.current = null;
					setMeasurementVersion((currentVersion: number): number => currentVersion + 1);
				}, MEASUREMENT_SETTLE_DELAY_MS);
			}
		});

		for (const node of element.querySelectorAll("[data-entry-id]")) {
			observer.observe(node);
		}

		resizeObserverRef.current = observer;

		return (): void => {
			observer.disconnect();
		};
	}, [visibleBlockIds]);

	useLayoutEffect((): void => {
		updateVisibleRange();
	}, [updateVisibleRange]);

	useLayoutEffect((): void => {
		const element: HTMLElement | null = listRef.current;
		const anchor: ScrollAnchor | null = pendingAnchorRef.current;

		if (element === null || anchor === null) {
			return;
		}

		const anchorElement: HTMLElement | null = queryEntryElement(element, anchor.entryId);
		if (anchorElement === null) {
			return;
		}

		const nextTop: number = anchorElement.getBoundingClientRect().top;
		element.scrollTop += nextTop - anchor.top;
		pendingAnchorRef.current = null;
		updateViewport();
	}, [renderableBlocks, updateViewport]);

	useLayoutEffect((): void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null || initialScrollToBottomKey.length === 0 || lastInitialScrollKeyRef.current === initialScrollToBottomKey || isLoading) {
			return;
		}

		lastInitialScrollKeyRef.current = initialScrollToBottomKey;
		autoFollowRef.current = true;

		window.requestAnimationFrame((): void => {
			const currentElement: HTMLElement | null = listRef.current;
			if (currentElement === null) {
				return;
			}

			scrollToBottom(currentElement);
			window.requestAnimationFrame((): void => {
				if (listRef.current !== null) {
					scrollToBottom(listRef.current);
					updateViewport();
				}
			});
		});
	}, [initialScrollToBottomKey, isLoading, updateViewport]);

	useEffect((): void => {
		const element: HTMLElement | null = listRef.current;
		const blockCountIncreased: boolean = renderableBlocks.length > lastBlockCountRef.current;
		lastBlockCountRef.current = renderableBlocks.length;

		if (element === null || isLoading) {
			return;
		}

		if (shouldAutoFollowAppend(autoFollowRef.current, hasRunningAssistantBlock, blockCountIncreased)) {
			scheduleAutoFollowScroll(hasRunningAssistantBlock ? "auto" : "smooth");
		}
	}, [renderableBlocks, hasRunningAssistantBlock, isLoading, scheduleAutoFollowScroll]);

	useEffect((): (() => void) | void => {
		if (!hasRunningAssistantBlock) {
			return;
		}

		setNowMs(Date.now());

		const timerId: number = window.setInterval((): void => {
			setNowMs(Date.now());
		}, 1000);

		return (): void => {
			window.clearInterval(timerId);
		};
	}, [hasRunningAssistantBlock]);

	useEffect((): (() => void) => {
		return (): void => {
			if (viewportFrameRef.current !== null) {
				window.cancelAnimationFrame(viewportFrameRef.current);
			}
			if (measurementFrameRef.current !== null) {
				window.cancelAnimationFrame(measurementFrameRef.current);
			}
			if (measurementSettleTimerRef.current !== null) {
				window.clearTimeout(measurementSettleTimerRef.current);
			}
		};
	}, []);

	const nowIsoTime: string = new Date(nowMs).toISOString();

	return (
		<section ref={listRef} className={styles.messageList}>
			<div className={styles.messageListContent}>
				{errorMessage ? (
					<Alert description={errorMessage} type="error" showIcon={true} />
				) : null}
				{isLoading ? (
					<Spin className={styles.loadingIcon} />
				) : (
					<>
						<div className={styles.spacer} style={{ height: topSpacerHeight }} />
						{visibleBlocks.map((block: TimelineBlock): React.ReactNode => {
							if (block.type === "user") {
								return (
									<UserBubble
										key={block.id}
										entryId={block.id}
										requestId={block.requestId}
										message={block.content}
										additionalContext={block.additionalContext ?? []}
										sentTime={formatShortDateTime(block.sentAtUtc)}
										disabled={retryDisabled}
										isRetryEditing={activeRetryRequestId === block.requestId}
										onRetryEditStart={onRetryEditStart}
										onRetryEditCancel={onRetryEditCancel}
										onRetryFromUserMessage={onRetryFromUserMessage}
									/>
								);
							}

							return (
								<AssistantBubble
									key={block.id}
									entryId={block.id}
									bodyParts={block.bodyParts}
									message={getAssistantMarkdown(block)}
									elapsedTime={formatElapsedTime(
										block.startedAtUtc,
										block.status === "running" ? nowIsoTime : block.completedAtUtc
									) ?? undefined}
									endTime={block.status === "running" ? undefined : formatShortDateTime(block.completedAtUtc)}
								/>
							);
						})}
						<div className={styles.spacer} style={{ height: bottomSpacerHeight }} />
					</>
				)}
			</div>
		</section>
	);
}

export default memo(MessageList);
