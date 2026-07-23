import { TimelineAssistantBlock, TimelineBlock } from "@/api/types";
import AssistantBubble from "../bubble/AssistantBubble";
import UserBubble from "../bubble/UserBubble";
import type { RetryUserMessagePayload } from "../bubble/UserBubble";
import styles from "./MessageList.module.css";
import { formatElapsedTime, formatShortDateTime } from "@/utils/time-format";
import { Spin, Alert } from "antd";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	getDistanceFromBottomByMetrics,
	isNearBottomByMetrics,
	shouldAutoFollowAppend,
	shouldAutoFollowViewport
} from "./message-list-virtual";

export type MessageListProps = {
	blocks: TimelineBlock[];
	isLoading?: boolean;
	errorMessage?: string | null;
	hasMoreBefore?: boolean;
	hasMoreAfter?: boolean;
	isLoadingMoreBefore?: boolean;
	isLoadingMoreAfter?: boolean;
	initialScrollToBottomKey?: string;
	onLoadMoreBefore?: () => void;
	onLoadMoreAfter?: () => void;
	retryDisabled?: boolean;
	activeRetryRequestId?: string | null;
	onRetryEditStart?: (requestId: string) => void;
	onRetryEditCancel?: (requestId: string) => void;
	onRetryFromUserMessage?: (payload: RetryUserMessagePayload) => boolean | void | Promise<boolean | void>;
	onInlineDiffReview?: () => void;
	scrollToBottomRequest?: number;
	onAwayFromBottomChange?: (awayFromBottom: boolean) => void;
};

export type MessageListHandle = {
	scrollToBottom: (behavior?: ScrollBehavior) => void;
};

type ScrollAnchor = {
	entryId: string;
	top: number;
};

const AUTO_FOLLOW_PAUSE_THRESHOLD: number = 72;
const AUTO_FOLLOW_RESUME_THRESHOLD: number = 16;
const WHEEL_DETACH_DELTA: number = 4;
const LOAD_MORE_THRESHOLD: number = 320;

function getAssistantMarkdown(block: TimelineAssistantBlock): string {
	if (block.content.length > 0) {
		return block.content;
	}

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

type ViewportMetricsOptions = {
	preserveAutoFollow?: boolean;
};

function getDistanceFromBottom(element: HTMLElement): number {
	return getDistanceFromBottomByMetrics(element.scrollHeight, element.scrollTop, element.clientHeight);
}

function isNearBottom(element: HTMLElement, threshold: number = AUTO_FOLLOW_RESUME_THRESHOLD): boolean {
	return isNearBottomByMetrics(element.scrollHeight, element.scrollTop, element.clientHeight, threshold);
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

function createElementAnchor(element: HTMLElement, anchorElement: HTMLElement | null): ScrollAnchor | null {
	if (anchorElement === null) {
		return null;
	}

	const entryId: string | null = anchorElement.getAttribute("data-entry-id");
	if (entryId === null) {
		return null;
	}

	return {
		entryId,
		top: anchorElement.getBoundingClientRect().top
	};
}

function queryFirstEntryElement(element: HTMLElement): HTMLElement | null {
	return element.querySelector("[data-entry-id]") as HTMLElement | null;
}

function queryLastEntryElement(element: HTMLElement): HTMLElement | null {
	const entryElements: NodeListOf<HTMLElement> = element.querySelectorAll("[data-entry-id]");
	return entryElements[entryElements.length - 1] ?? null;
}

const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList({
	blocks,
	isLoading,
	errorMessage,
	hasMoreBefore = false,
	hasMoreAfter = false,
	isLoadingMoreBefore = false,
	isLoadingMoreAfter = false,
	initialScrollToBottomKey = "",
	onLoadMoreBefore,
	onLoadMoreAfter,
	retryDisabled = false,
	activeRetryRequestId = null,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage,
	onInlineDiffReview,
	scrollToBottomRequest = 0,
	onAwayFromBottomChange
}: MessageListProps, ref): React.JSX.Element {
	const listRef = useRef<HTMLElement | null>(null);
	const pendingAnchorRef = useRef<ScrollAnchor | null>(null);
	const lastInitialScrollKeyRef = useRef<string>("");
	const lastBlockCountRef = useRef<number>(0);
	const lastViewportBlockCountRef = useRef<number>(0);
	const autoFollowRef = useRef<boolean>(true);
	const awayFromBottomRef = useRef<boolean>(false);
	const lastScrollToBottomRequestRef = useRef<number>(0);
	const viewportUpdateFrameRef = useRef<number | null>(null);
	const [nowMs, setNowMs] = useState<number>(() => Date.now());
	const renderableBlocks: TimelineBlock[] = useMemo((): TimelineBlock[] => {
		return blocks.filter(shouldRenderTimelineBlock);
	}, [blocks]);
	const hasRunningAssistantBlock: boolean = renderableBlocks.some((block: TimelineBlock): boolean => {
		return block.type === "assistant" && block.status === "running";
	});
	const isInitialLoading: boolean = isLoading === true && renderableBlocks.length === 0;
	const canEditUserMessages: boolean = onRetryFromUserMessage !== undefined && !retryDisabled && !hasRunningAssistantBlock && activeRetryRequestId === null;

	const setAwayFromBottom = useCallback((awayFromBottom: boolean): void => {
		if (awayFromBottomRef.current !== awayFromBottom) {
			awayFromBottomRef.current = awayFromBottom;
			onAwayFromBottomChange?.(awayFromBottom);
		}
	}, [onAwayFromBottomChange]);

	const detachAutoFollow = useCallback((): void => {
		if (!autoFollowRef.current && awayFromBottomRef.current) {
			return;
		}
		autoFollowRef.current = false;
		setAwayFromBottom(true);
	}, [setAwayFromBottom]);

	const syncViewportMetrics = useCallback((element: HTMLElement, options: ViewportMetricsOptions = {}): void => {
		const distanceFromBottom: number = getDistanceFromBottom(element);
		const initialScrollPending: boolean = initialScrollToBottomKey.length > 0 && lastInitialScrollKeyRef.current !== initialScrollToBottomKey && isLoading !== true;
		if (initialScrollPending && distanceFromBottom > AUTO_FOLLOW_RESUME_THRESHOLD) {
			autoFollowRef.current = true;
			setAwayFromBottom(false);
			return;
		}
		if (options.preserveAutoFollow === true && autoFollowRef.current) {
			setAwayFromBottom(false);
			return;
		}
		autoFollowRef.current = shouldAutoFollowViewport(
			autoFollowRef.current,
			distanceFromBottom,
			AUTO_FOLLOW_PAUSE_THRESHOLD,
			AUTO_FOLLOW_RESUME_THRESHOLD
		);
		setAwayFromBottom(!autoFollowRef.current);
	}, [initialScrollToBottomKey, isLoading, setAwayFromBottom]);

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

	const scrollToBottomNow = useCallback((behavior: ScrollBehavior = "auto"): void => {
		const element: HTMLElement | null = listRef.current;
		if (element === null) {
			return;
		}

		autoFollowRef.current = true;
		scrollToBottom(element, behavior);
		syncViewportMetrics(element);
	}, [syncViewportMetrics]);

	useImperativeHandle(ref, (): MessageListHandle => {
		return {
			scrollToBottom: scrollToBottomNow
		};
	}, [scrollToBottomNow]);

	const updateViewport = useCallback((options: ViewportMetricsOptions = {}): void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null) {
			return;
		}

		const nearLoadMoreAfter: boolean = isNearBottom(element, LOAD_MORE_THRESHOLD);
		syncViewportMetrics(element, options);

		const contentFitsViewport: boolean = element.scrollHeight <= element.clientHeight + LOAD_MORE_THRESHOLD;

		if ((element.scrollTop < LOAD_MORE_THRESHOLD || contentFitsViewport) && hasMoreBefore && !isLoadingMoreBefore) {
			pendingAnchorRef.current = createElementAnchor(element, queryFirstEntryElement(element));
			onLoadMoreBefore?.();
		}

		const distanceFromBottom: number = getDistanceFromBottom(element);
		if ((distanceFromBottom < LOAD_MORE_THRESHOLD || contentFitsViewport) && hasMoreAfter && nearLoadMoreAfter && !isLoadingMoreAfter) {
			pendingAnchorRef.current = createElementAnchor(element, queryLastEntryElement(element));
			onLoadMoreAfter?.();
		}
	}, [hasMoreAfter, hasMoreBefore, isLoadingMoreAfter, isLoadingMoreBefore, onLoadMoreAfter, onLoadMoreBefore, syncViewportMetrics]);

	const handleWheel = useCallback((event: WheelEvent): void => {
		if (event.deltaY >= -WHEEL_DETACH_DELTA) {
			return;
		}

		const element: HTMLElement | null = listRef.current;
		if (element === null || element.scrollHeight <= element.clientHeight) {
			return;
		}

		detachAutoFollow();
	}, [detachAutoFollow]);

	const scheduleViewportUpdate = useCallback((): void => {
		if (viewportUpdateFrameRef.current !== null) {
			return;
		}

		viewportUpdateFrameRef.current = window.requestAnimationFrame((): void => {
			viewportUpdateFrameRef.current = null;
			updateViewport();
		});
	}, [updateViewport]);

	useEffect((): (() => void) | void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null) {
			return;
		}

		updateViewport();
		element.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
		element.addEventListener("wheel", handleWheel, { passive: true });
		window.addEventListener("resize", scheduleViewportUpdate);

		return (): void => {
			element.removeEventListener("scroll", scheduleViewportUpdate);
			element.removeEventListener("wheel", handleWheel);
			window.removeEventListener("resize", scheduleViewportUpdate);
			if (viewportUpdateFrameRef.current !== null) {
				window.cancelAnimationFrame(viewportUpdateFrameRef.current);
				viewportUpdateFrameRef.current = null;
			}
		};
	}, [handleWheel, scheduleViewportUpdate, updateViewport]);

	useLayoutEffect((): void => {
		const element: HTMLElement | null = listRef.current;
		const anchor: ScrollAnchor | null = pendingAnchorRef.current;

		if (element === null) {
			return;
		}

		const blockCountChanged: boolean = lastViewportBlockCountRef.current !== renderableBlocks.length;
		lastViewportBlockCountRef.current = renderableBlocks.length;

		if (anchor !== null) {
			const anchorElement: HTMLElement | null = queryEntryElement(element, anchor.entryId);
			if (anchorElement !== null) {
				const nextTop: number = anchorElement.getBoundingClientRect().top;
				element.scrollTop += nextTop - anchor.top;
			}

			pendingAnchorRef.current = null;
			updateViewport({ preserveAutoFollow: true });
			return;
		}

		if (blockCountChanged) {
			updateViewport();
		}
	}, [renderableBlocks, updateViewport]);

	useLayoutEffect((): void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null || initialScrollToBottomKey.length === 0 || lastInitialScrollKeyRef.current === initialScrollToBottomKey || isLoading) {
			return;
		}

		lastInitialScrollKeyRef.current = initialScrollToBottomKey;
		autoFollowRef.current = true;

		scrollToBottom(element);
		syncViewportMetrics(element);

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
		if (scrollToBottomRequest <= 0 || lastScrollToBottomRequestRef.current === scrollToBottomRequest) {
			return;
		}

		lastScrollToBottomRequestRef.current = scrollToBottomRequest;
		autoFollowRef.current = true;

		scrollToBottomNow("smooth");
	}, [scrollToBottomNow, scrollToBottomRequest]);

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

	const nowIsoTime: string = new Date(nowMs).toISOString();

	return (
		<section ref={listRef} className={styles.messageList}>
			<div className={`${styles.messageListContent} ${isInitialLoading ? styles.messageListContentLoading : ""}`}>
				{errorMessage ? (
					<Alert description={errorMessage} type="error" showIcon={true} />
				) : null}
				{isInitialLoading ? (
					<Spin className={styles.loadingIcon} />
				) : (
					<>
						{isLoadingMoreBefore ? (
							<div className={styles.pageLoadingIndicator}>
								<Spin size="small" />
							</div>
						) : null}
						{renderableBlocks.map((block: TimelineBlock): React.ReactNode => {
							if (block.type === "user") {
								return (
									<UserBubble
										key={block.id}
										entryId={block.id}
										requestId={block.requestId}
										message={block.content}
										additionalContext={block.additionalContext ?? []}
										sentTime={formatShortDateTime(block.sentAtUtc)}
										showEditButton={canEditUserMessages}
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
									streaming={block.status === "running"}
									onInlineDiffReview={onInlineDiffReview}
								/>
							);
						})}
						{isLoadingMoreAfter ? (
							<div className={styles.pageLoadingIndicator}>
								<Spin size="small" />
							</div>
						) : null}
					</>
				)}
			</div>
		</section>
	);
});

export default memo(MessageList);
