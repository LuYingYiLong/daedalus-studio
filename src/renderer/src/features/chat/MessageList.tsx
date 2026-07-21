import { TimelineAssistantBlock, TimelineBlock } from "@/api/types";
import AssistantBubble from "../bubble/AssistantBubble";
import UserBubble from "../bubble/UserBubble";
import type { RetryUserMessagePayload } from "../bubble/UserBubble";
import styles from "./MessageList.module.css";
import { formatElapsedTime, formatShortDateTime } from "@/utils/time-format";
import { Spin, Alert } from "antd";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	isNearBottomByMetrics,
	shouldAutoFollowAppend
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
	onInlineDiffReview?: () => void;
};

type ScrollAnchor = {
	entryId: string;
	top: number;
};

const NEAR_BOTTOM_THRESHOLD: number = 320;
const LOAD_MORE_THRESHOLD: number = 320;

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
	onRetryFromUserMessage,
	onInlineDiffReview
}: MessageListProps): React.JSX.Element {
	const listRef = useRef<HTMLElement | null>(null);
	const pendingAnchorRef = useRef<ScrollAnchor | null>(null);
	const lastInitialScrollKeyRef = useRef<string>("");
	const lastBlockCountRef = useRef<number>(0);
	const autoFollowRef = useRef<boolean>(true);
	const [nowMs, setNowMs] = useState<number>(() => Date.now());
	const renderableBlocks: TimelineBlock[] = useMemo((): TimelineBlock[] => {
		return blocks.filter(shouldRenderTimelineBlock);
	}, [blocks]);
	const hasRunningAssistantBlock: boolean = renderableBlocks.some((block: TimelineBlock): boolean => {
		return block.type === "assistant" && block.status === "running";
	});
	const canEditUserMessages: boolean = onRetryFromUserMessage !== undefined && !retryDisabled && !hasRunningAssistantBlock && activeRetryRequestId === null;

	const syncViewportMetrics = useCallback((element: HTMLElement): void => {
		autoFollowRef.current = isNearBottom(element);
	}, []);

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

		const contentFitsViewport: boolean = element.scrollHeight <= element.clientHeight + LOAD_MORE_THRESHOLD;

		if ((element.scrollTop < LOAD_MORE_THRESHOLD || contentFitsViewport) && hasMoreBefore) {
			pendingAnchorRef.current = createElementAnchor(element, queryFirstEntryElement(element));
			onLoadMoreBefore?.();
		}

		const distanceFromBottom: number = element.scrollHeight - element.scrollTop - element.clientHeight;
		if ((distanceFromBottom < LOAD_MORE_THRESHOLD || contentFitsViewport) && hasMoreAfter && nearBottom) {
			pendingAnchorRef.current = createElementAnchor(element, queryLastEntryElement(element));
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

	useLayoutEffect((): void => {
		const element: HTMLElement | null = listRef.current;
		const anchor: ScrollAnchor | null = pendingAnchorRef.current;

		if (element === null) {
			return;
		}

		if (anchor !== null) {
			const anchorElement: HTMLElement | null = queryEntryElement(element, anchor.entryId);
			if (anchorElement !== null) {
				const nextTop: number = anchorElement.getBoundingClientRect().top;
				element.scrollTop += nextTop - anchor.top;
			}

			pendingAnchorRef.current = null;
		}

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
									onInlineDiffReview={onInlineDiffReview}
								/>
							);
						})}
					</>
				)}
			</div>
		</section>
	);
}

export default memo(MessageList);
