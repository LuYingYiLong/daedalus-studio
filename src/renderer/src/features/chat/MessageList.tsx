import { TimelineAssistantBlock, TimelineBlock } from "@/api/types";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import AssistantBubble from "./AssistantBubble";
import UserBubble from "./UserBubble";
import type { RetryUserMessagePayload } from "./UserBubble";
import styles from "./MessageList.module.css";
import { formatElapsedTime, formatShortDateTime } from "@/shared/lib/time-format";
import { Spin, Alert, Dropdown, message } from "antd";
import type { MenuProps } from "antd";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useThrottleFn } from "ahooks";
import { useTranslation } from "react-i18next";
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
	onActiveUserEntryChange?: (entryId: string | null) => void;
	onScrollContainerReady?: (element: HTMLElement | null) => void;
};

export type MessageListHandle = {
	scrollToBottom: (behavior?: ScrollBehavior) => void;
	scrollToEntry: (entryId: string, behavior?: ScrollBehavior) => boolean;
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

function getActiveUserEntryId(element: HTMLElement): string | null {
	const targetTop: number = element.getBoundingClientRect().top + Math.min(56, element.clientHeight * 0.2);
	const entries: NodeListOf<HTMLElement> = element.querySelectorAll('[data-entry-kind="user"][data-entry-id]');
	let activeEntryId: string | null = null;
	for (const entry of entries) {
		const bounds: DOMRect = entry.getBoundingClientRect();
		const entryId: string | null = entry.getAttribute("data-entry-id");
		if (entryId === null) {
			continue;
		}
		if (bounds.top <= targetTop) {
			activeEntryId = entryId;
			continue;
		}
		if (activeEntryId === null && bounds.bottom >= targetTop) {
			return entryId;
		}
		break;
	}
	return activeEntryId;
}

function isNodeInside(element: HTMLElement, node: Node | null): boolean {
	if (node === null) {
		return false;
	}

	const target: Element | null = node.nodeType === Node.ELEMENT_NODE
		? node as Element
		: node.parentElement;
	return target !== null && element.contains(target);
}

function getSelectedTextInside(element: HTMLElement): string {
	const selection: Selection | null = window.getSelection();
	if (
		selection === null
		|| selection.isCollapsed
		|| !isNodeInside(element, selection.anchorNode)
		|| !isNodeInside(element, selection.focusNode)
	) {
		return "";
	}

	const selectedText: string = selection.toString();
	return selectedText.trim().length > 0 ? selectedText : "";
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
	onAwayFromBottomChange,
	onActiveUserEntryChange,
	onScrollContainerReady
}: MessageListProps, ref): React.JSX.Element {
	const { t } = useTranslation();
	const [messageApi, messageContextHolder] = message.useMessage();
	const listRef = useRef<HTMLElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const pendingAnchorRef = useRef<ScrollAnchor | null>(null);
	const lastInitialScrollKeyRef = useRef<string>("");
	const lastBlockCountRef = useRef<number>(0);
	const lastViewportBlockCountRef = useRef<number>(0);
	const autoFollowRef = useRef<boolean>(true);
	const awayFromBottomRef = useRef<boolean>(false);
	const activeUserEntryIdRef = useRef<string | null>(null);
	const lastScrollToBottomRequestRef = useRef<number>(0);
	const viewportUpdateFrameRef = useRef<number | null>(null);
	const [nowMs, setNowMs] = useState<number>(() => Date.now());
	const [contextMenuSelection, setContextMenuSelection] = useState<string>("");
	const renderableBlocks: TimelineBlock[] = useMemo((): TimelineBlock[] => {
		return blocks.filter(shouldRenderTimelineBlock);
	}, [blocks]);
	const hasRunningAssistantBlock: boolean = renderableBlocks.some((block: TimelineBlock): boolean => {
		return block.type === "assistant" && block.status === "running";
	});
	const isInitialLoading: boolean = isLoading === true && renderableBlocks.length === 0;
	const canEditUserMessages: boolean = onRetryFromUserMessage !== undefined && !retryDisabled && !hasRunningAssistantBlock && activeRetryRequestId === null;

	const selectAllMessageText = useCallback((): void => {
		const content: HTMLDivElement | null = contentRef.current;
		const selection: Selection | null = window.getSelection();
		if (content === null || selection === null) {
			return;
		}

		const range: Range = document.createRange();
		range.selectNodeContents(content);
		selection.removeAllRanges();
		selection.addRange(range);
		setContextMenuSelection(selection.toString());
	}, []);

	const copyContextMenuSelection = useCallback((): void => {
		if (contextMenuSelection.length === 0) {
			return;
		}

		void copyTextToClipboard(contextMenuSelection)
			.then((): void => {
				void messageApi.success(t("chat.common.copied"));
			})
			.catch((error: unknown): void => {
				console.error("[MessageList] copy selected text failed", error);
				void messageApi.error(t("chat.common.copyFailed"));
			});
	}, [contextMenuSelection, messageApi, t]);

	const messageContextMenu: MenuProps = useMemo((): MenuProps => {
		const hasSelection: boolean = contextMenuSelection.length > 0;
		return {
			items: [
				{
					key: "select-all",
					label: t("chat.common.selectAll"),
				},
				...(hasSelection ? [
					{
						type: "divider" as const
					},
					{
						key: "copy",
						label: t("chat.common.copy"),
					}
				] : [])
			],
			onClick: ({ key, domEvent }): void => {
				domEvent.preventDefault();
				domEvent.stopPropagation();
				if (key === "select-all") {
					selectAllMessageText();
					return;
				}
				if (key === "copy") {
					copyContextMenuSelection();
				}
			}
		};
	}, [contextMenuSelection.length, copyContextMenuSelection, selectAllMessageText, t]);

	const handleContextMenuCapture = useCallback((): void => {
		const content: HTMLDivElement | null = contentRef.current;
		if (content === null) {
			return;
		}

		flushSync((): void => {
			setContextMenuSelection(getSelectedTextInside(content));
		});
	}, []);

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

	const scrollToEntry = useCallback((entryId: string, behavior: ScrollBehavior = "smooth"): boolean => {
		const element: HTMLElement | null = listRef.current;
		const target: HTMLElement | null = element === null ? null : queryEntryElement(element, entryId);
		if (element === null || target === null) {
			return false;
		}
		autoFollowRef.current = false;
		setAwayFromBottom(true);
		const targetTop: number = target.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
		element.scrollTo({ top: Math.max(0, targetTop - Math.min(48, element.clientHeight * 0.18)), behavior });
		return true;
	}, [setAwayFromBottom]);

	useImperativeHandle(ref, (): MessageListHandle => {
		return {
			scrollToBottom: scrollToBottomNow,
			scrollToEntry
		};
	}, [scrollToBottomNow, scrollToEntry]);

	const updateViewport = useCallback((options: ViewportMetricsOptions = {}): void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null) {
			return;
		}

		const nearLoadMoreAfter: boolean = isNearBottom(element, LOAD_MORE_THRESHOLD);
		syncViewportMetrics(element, options);
		const activeUserEntryId: string | null = getActiveUserEntryId(element);
		if (activeUserEntryIdRef.current !== activeUserEntryId) {
			activeUserEntryIdRef.current = activeUserEntryId;
			onActiveUserEntryChange?.(activeUserEntryId);
		}

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
	}, [hasMoreAfter, hasMoreBefore, isLoadingMoreAfter, isLoadingMoreBefore, onActiveUserEntryChange, onLoadMoreAfter, onLoadMoreBefore, syncViewportMetrics]);

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

	const {
		run: scheduleViewportUpdate,
		cancel: cancelScheduledViewportUpdate
	} = useThrottleFn((): void => {
		if (viewportUpdateFrameRef.current !== null) {
			return;
		}

		viewportUpdateFrameRef.current = window.requestAnimationFrame((): void => {
			viewportUpdateFrameRef.current = null;
			updateViewport();
		});
	}, {
		wait: 50,
		leading: true,
		trailing: true
	});

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
			cancelScheduledViewportUpdate();
			if (viewportUpdateFrameRef.current !== null) {
				window.cancelAnimationFrame(viewportUpdateFrameRef.current);
				viewportUpdateFrameRef.current = null;
			}
		};
	}, [cancelScheduledViewportUpdate, handleWheel, scheduleViewportUpdate, updateViewport]);

	useEffect((): (() => void) => {
		onScrollContainerReady?.(listRef.current);
		return (): void => {
			onScrollContainerReady?.(null);
		};
	}, [onScrollContainerReady]);

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
		<>
			{messageContextHolder}
			<Dropdown menu={messageContextMenu} trigger={["contextMenu"]}>
				<section ref={listRef} className={styles.messageList} onContextMenuCapture={handleContextMenuCapture}>
					<div ref={contentRef} className={`${styles.messageListContent} ${isInitialLoading ? styles.messageListContentLoading : ""}`}>
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
			</Dropdown>
		</>
	);
});

export default memo(MessageList);
