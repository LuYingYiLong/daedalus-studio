import type { TimelineAssistantBlock, TimelineBlock } from "@/api/types";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { formatElapsedTime, formatShortDateTime } from "@/shared/lib/time-format";
import { Alert, Dropdown, message, Spin } from "antd";
import type { MenuProps } from "antd";
import {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Virtuoso, type ListRange, type VirtuosoHandle } from "react-virtuoso";
import AssistantBubble from "./AssistantBubble";
import type { ConversationSearchMatch } from "./conversation-search-engine";
import {
	applyConversationSearchHighlights,
	clearConversationSearchHighlights
} from "./conversation-search-highlight";
import styles from "./MessageList.module.css";
import { isNearBottomByMetrics } from "./message-list-virtual";
import { TimelineDisclosureProvider } from "./timeline-disclosure-state";
import UserBubble, { type RetryUserMessagePayload } from "./UserBubble";

export type MessageListProps = {
	blocks: TimelineBlock[];
	isLoading?: boolean;
	errorMessage?: string | null;
	hasMoreBefore?: boolean;
	hasMoreAfter?: boolean;
	isLoadingMoreBefore?: boolean;
	isLoadingMoreAfter?: boolean;
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
	blockOffset?: number;
	searchOpen?: boolean;
	searchQuery?: string;
	activeSearchMatch?: ConversationSearchMatch | null;
};

export type MessageListHandle = {
	scrollToBottom: (behavior?: ScrollBehavior) => void;
	scrollToEntry: (entryId: string, behavior?: ScrollBehavior) => boolean;
};

type RenderableTimelineBlock = {
	block: TimelineBlock;
	blockOffset: number;
};

const DEFAULT_ITEM_HEIGHT: number = 168;
const MIN_ITEM_HEIGHT: number = 48;
const MAX_ITEM_HEIGHT: number = 640;
const VIRTUAL_VIEWPORT_EXPANSION = { top: 800, bottom: 1200 } as const;
const FULL_WINDOW_VIEWPORT_EXPANSION = { top: 1_000_000, bottom: 1_000_000 } as const;
const AT_BOTTOM_THRESHOLD: number = 16;

function normalizeVirtuosoScrollBehavior(behavior: ScrollBehavior): "auto" | "smooth" {
	return behavior === "smooth" ? "smooth" : "auto";
}

function getAssistantMarkdown(block: TimelineAssistantBlock): string {
	if (block.content.length > 0) {
		return block.content;
	}
	return block.bodyParts
		.filter((part) => part.type === "markdown")
		.map((part) => part.text)
		.join("");
}

export function shouldRenderTimelineBlock(block: TimelineBlock): boolean {
	if (block.type !== "assistant") {
		return true;
	}
	return block.status === "running" || block.content.trim().length > 0 || block.bodyParts.length > 0;
}

function getEstimatedItemHeight(blocks: TimelineBlock[]): number {
	const estimates: number[] = blocks
		.map((block: TimelineBlock): number | null => block.renderHints?.estimatedHeight ?? null)
		.filter((height: number | null): height is number => height !== null && Number.isFinite(height) && height > 0)
		.sort((left: number, right: number): number => left - right);
	if (estimates.length === 0) {
		return DEFAULT_ITEM_HEIGHT;
	}
	const median: number = estimates[Math.floor(estimates.length / 2)] ?? DEFAULT_ITEM_HEIGHT;
	return Math.min(MAX_ITEM_HEIGHT, Math.max(MIN_ITEM_HEIGHT, Math.round(median)));
}

function isNodeInside(element: HTMLElement, node: Node | null): boolean {
	if (node === null) {
		return false;
	}
	const target: Element | null = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
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

type AssistantTimelineRowProps = {
	block: TimelineAssistantBlock;
	blockOffset: number;
	onInlineDiffReview?: () => void;
};

const AssistantTimelineRow = memo(function AssistantTimelineRow({ block, blockOffset, onInlineDiffReview }: AssistantTimelineRowProps): React.JSX.Element {
	const [nowIsoTime, setNowIsoTime] = useState<string>(() => new Date().toISOString());
	useEffect((): (() => void) | void => {
		if (block.status !== "running") {
			return;
		}
		setNowIsoTime(new Date().toISOString());
		const timerId: number = window.setInterval((): void => {
			setNowIsoTime(new Date().toISOString());
		}, 1000);
		return (): void => window.clearInterval(timerId);
	}, [block.status]);

	return (
		<AssistantBubble
			entryId={block.id}
			searchBlockOffset={blockOffset}
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
});

const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList({
	blocks,
	isLoading,
	errorMessage,
	hasMoreBefore = false,
	hasMoreAfter = false,
	isLoadingMoreBefore = false,
	isLoadingMoreAfter = false,
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
	onScrollContainerReady,
	blockOffset = 0,
	searchOpen = false,
	searchQuery = "",
	activeSearchMatch = null
}: MessageListProps, ref): React.JSX.Element {
	const { t } = useTranslation();
	const [messageApi, messageContextHolder] = message.useMessage();
	const virtuosoRef = useRef<VirtuosoHandle | null>(null);
	const scrollerRef = useRef<HTMLElement | null>(null);
	const shouldFollowBottomRef = useRef<boolean>(true);
	const initialBottomAnchorRef = useRef<boolean>(true);
	const bottomStateFrameRef = useRef<number | null>(null);
	const bottomFollowFrameRef = useRef<number | null>(null);
	const lastTotalListHeightRef = useRef<number | null>(null);
	const lastScrollerTopRef = useRef<number>(0);
	const pointerScrollActiveRef = useRef<boolean>(false);
	const userScrollAwayIntentRef = useRef<boolean>(false);
	const lastScrollToBottomRequestRef = useRef<number>(0);
	const highlightFrameRef = useRef<number | null>(null);
	const [contextMenuSelection, setContextMenuSelection] = useState<string>("");
	const [selectionViewportExpanded, setSelectionViewportExpanded] = useState<boolean>(false);
	const [searchRangeRevision, setSearchRangeRevision] = useState<number>(0);
	const items: RenderableTimelineBlock[] = useMemo((): RenderableTimelineBlock[] => {
		return blocks.map((block: TimelineBlock, index: number): RenderableTimelineBlock => ({
			block,
			blockOffset: blockOffset + index
		}));
	}, [blockOffset, blocks]);
	const hasRunningAssistantBlock: boolean = blocks.some((block: TimelineBlock): boolean => block.type === "assistant" && block.status === "running");
	const isInitialLoading: boolean = isLoading === true && blocks.length === 0;
	const canEditUserMessages: boolean = onRetryFromUserMessage !== undefined && !retryDisabled && !hasRunningAssistantBlock && activeRetryRequestId === null;
	const defaultItemHeight: number = useMemo((): number => getEstimatedItemHeight(blocks), [blocks]);
	const expandFullWindow: boolean = selectionViewportExpanded || activeRetryRequestId !== null;
	const increaseViewportBy = expandFullWindow ? FULL_WINDOW_VIEWPORT_EXPANSION : VIRTUAL_VIEWPORT_EXPANSION;
	const setAwayFromBottom = useCallback((awayFromBottom: boolean): void => {
		onAwayFromBottomChange?.(awayFromBottom);
	}, [onAwayFromBottomChange]);

	const commitBottomState = useCallback((atBottom: boolean): void => {
		setAwayFromBottom(!atBottom);
	}, [setAwayFromBottom]);

	const releaseBottomFollow = useCallback((): void => {
		initialBottomAnchorRef.current = false;
		shouldFollowBottomRef.current = false;
	}, []);

	const scheduleBottomFollow = useCallback((): void => {
		if (bottomFollowFrameRef.current !== null) {
			return;
		}
		bottomFollowFrameRef.current = window.requestAnimationFrame((): void => {
			bottomFollowFrameRef.current = null;
			if (!initialBottomAnchorRef.current && !shouldFollowBottomRef.current) {
				return;
			}
			virtuosoRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "auto" });
			virtuosoRef.current?.autoscrollToBottom();
		});
	}, []);

	const syncBottomStateFromMetrics = useCallback((): void => {
		const scroller: HTMLElement | null = scrollerRef.current;
		if (scroller === null) {
			return;
		}
		const atBottom: boolean = isNearBottomByMetrics(
			scroller.scrollHeight,
			scroller.scrollTop,
			scroller.clientHeight,
			AT_BOTTOM_THRESHOLD
		);
		if (atBottom) {
			initialBottomAnchorRef.current = false;
			shouldFollowBottomRef.current = true;
			commitBottomState(true);
			return;
		}
		if (initialBottomAnchorRef.current && blocks.length > 0) {
			commitBottomState(true);
			scheduleBottomFollow();
			return;
		}
		if (shouldFollowBottomRef.current) {
			commitBottomState(true);
			return;
		}
		commitBottomState(false);
	}, [blocks.length, commitBottomState, scheduleBottomFollow]);

	const scheduleBottomStateSync = useCallback((): void => {
		if (bottomStateFrameRef.current !== null) {
			return;
		}
		bottomStateFrameRef.current = window.requestAnimationFrame((): void => {
			bottomStateFrameRef.current = null;
			syncBottomStateFromMetrics();
		});
	}, [syncBottomStateFromMetrics]);

	const scrollToBottomNow = useCallback((behavior: ScrollBehavior = "auto"): void => {
		initialBottomAnchorRef.current = false;
		shouldFollowBottomRef.current = true;
		commitBottomState(true);
		if (blocks.length > 0) {
			virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end", behavior: normalizeVirtuosoScrollBehavior(behavior) });
		}
	}, [blocks.length, commitBottomState]);

	const scrollToEntry = useCallback((entryId: string, behavior: ScrollBehavior = "smooth"): boolean => {
		const index: number = blocks.findIndex((block: TimelineBlock): boolean => block.id === entryId);
		if (index < 0) {
			return false;
		}
		releaseBottomFollow();
		commitBottomState(false);
		virtuosoRef.current?.scrollToIndex({ index, align: "center", behavior: normalizeVirtuosoScrollBehavior(behavior) });
		return true;
	}, [blocks, commitBottomState, releaseBottomFollow]);

	useImperativeHandle(ref, (): MessageListHandle => ({
		scrollToBottom: scrollToBottomNow,
		scrollToEntry
	}), [scrollToBottomNow, scrollToEntry]);

	const selectMountedMessageText = useCallback((): void => {
		const scroller: HTMLElement | null = scrollerRef.current;
		const selection: Selection | null = window.getSelection();
		if (scroller === null || selection === null) {
			return;
		}
		const firstEntry: HTMLElement | null = scroller.querySelector("[data-entry-id]");
		const entries: NodeListOf<HTMLElement> = scroller.querySelectorAll("[data-entry-id]");
		const lastEntry: HTMLElement | undefined = entries[entries.length - 1];
		if (firstEntry === null || lastEntry === undefined) {
			return;
		}
		const range: Range = document.createRange();
		range.setStartBefore(firstEntry);
		range.setEndAfter(lastEntry);
		selection.removeAllRanges();
		selection.addRange(range);
		setContextMenuSelection(selection.toString());
	}, []);

	const selectAllMessageText = useCallback((): void => {
		flushSync((): void => setSelectionViewportExpanded(true));
		window.requestAnimationFrame((): void => {
			window.requestAnimationFrame(selectMountedMessageText);
		});
	}, [selectMountedMessageText]);

	useEffect((): (() => void) | void => {
		if (!selectionViewportExpanded) {
			return;
		}
		const handleSelectionChange = (): void => {
			const selection: Selection | null = window.getSelection();
			if (selection === null || selection.isCollapsed) {
				setSelectionViewportExpanded(false);
			}
		};
		document.addEventListener("selectionchange", handleSelectionChange);
		return (): void => document.removeEventListener("selectionchange", handleSelectionChange);
	}, [selectionViewportExpanded]);

	const copyContextMenuSelection = useCallback((): void => {
		if (contextMenuSelection.length === 0) {
			return;
		}
		void copyTextToClipboard(contextMenuSelection)
			.then((): void => void messageApi.success(t("chat.common.copied")))
			.catch((error: unknown): void => {
				console.error("[MessageList] copy selected text failed", error);
				void messageApi.error(t("chat.common.copyFailed"));
			});
	}, [contextMenuSelection, messageApi, t]);

	const messageContextMenu: MenuProps = useMemo((): MenuProps => ({
		items: [
			{ key: "select-all", label: t("chat.common.selectAll") },
			...(contextMenuSelection.length > 0 ? [
				{ type: "divider" as const },
				{ key: "copy", label: t("chat.common.copy") }
			] : [])
		],
		onClick: ({ key, domEvent }): void => {
			domEvent.preventDefault();
			domEvent.stopPropagation();
			if (key === "select-all") {
				selectAllMessageText();
			} else if (key === "copy") {
				copyContextMenuSelection();
			}
		}
	}), [contextMenuSelection.length, copyContextMenuSelection, selectAllMessageText, t]);

	const handleContextMenuCapture = useCallback((): void => {
		const scroller: HTMLElement | null = scrollerRef.current;
		if (scroller !== null) {
			flushSync((): void => setContextMenuSelection(getSelectedTextInside(scroller)));
		}
	}, []);

	const applySearchHighlights = useCallback((scrollActiveIntoView: boolean): void => {
		const scroller: HTMLElement | null = scrollerRef.current;
		if (highlightFrameRef.current !== null) {
			window.cancelAnimationFrame(highlightFrameRef.current);
		}
		highlightFrameRef.current = window.requestAnimationFrame((): void => {
			highlightFrameRef.current = null;
			if (scroller === null || !searchOpen || searchQuery.trim().length === 0) {
				clearConversationSearchHighlights(scroller);
				return;
			}
			const result = applyConversationSearchHighlights(scroller, searchQuery, activeSearchMatch);
			if (scrollActiveIntoView && result.activeElement !== null) {
				result.activeElement.scrollIntoView({ block: "center", behavior: "smooth" });
			}
		});
	}, [activeSearchMatch, searchOpen, searchQuery]);

	useLayoutEffect((): (() => void) => {
		if (activeSearchMatch !== null) {
			const targetIndex: number = activeSearchMatch.blockOffset;
			if (targetIndex >= blockOffset && targetIndex < blockOffset + blocks.length) {
				releaseBottomFollow();
				commitBottomState(false);
				virtuosoRef.current?.scrollToIndex({ index: targetIndex - blockOffset, align: "center", behavior: "smooth" });
			}
		}
		applySearchHighlights(true);
		return (): void => clearConversationSearchHighlights(scrollerRef.current);
	}, [activeSearchMatch, applySearchHighlights, blockOffset, blocks.length, commitBottomState, releaseBottomFollow]);

	useLayoutEffect((): void => {
		if (searchRangeRevision > 0) {
			applySearchHighlights(false);
		}
	}, [applySearchHighlights, searchRangeRevision]);

	const handleRangeChanged = useCallback((range: ListRange): void => {
		let activeEntryId: string | null = null;
		const relativeStart: number = Math.max(0, range.startIndex - blockOffset);
		for (let index: number = Math.min(relativeStart, blocks.length - 1); index >= 0; index -= 1) {
			const block: TimelineBlock | undefined = blocks[index];
			if (block?.type === "user") {
				activeEntryId = block.id;
				break;
			}
		}
		onActiveUserEntryChange?.(activeEntryId);
		if (searchOpen) {
			setSearchRangeRevision((revision: number): number => revision + 1);
		}
	}, [blockOffset, blocks, onActiveUserEntryChange, searchOpen]);

	const handleAtBottomStateChange = useCallback((atBottom: boolean): void => {
		if (atBottom) {
			initialBottomAnchorRef.current = false;
			shouldFollowBottomRef.current = true;
			commitBottomState(true);
			return;
		}
		scheduleBottomStateSync();
	}, [commitBottomState, scheduleBottomStateSync]);

	const handleTotalListHeightChanged = useCallback((height: number): void => {
		if (height <= 0 || lastTotalListHeightRef.current === height) {
			return;
		}
		lastTotalListHeightRef.current = height;
		if (initialBottomAnchorRef.current || shouldFollowBottomRef.current) {
			commitBottomState(true);
			scheduleBottomFollow();
		}
		scheduleBottomStateSync();
	}, [commitBottomState, scheduleBottomFollow, scheduleBottomStateSync]);

	const handleWheelCapture = useCallback((event: React.WheelEvent<HTMLDivElement>): void => {
		userScrollAwayIntentRef.current = event.deltaY < 0;
	}, []);

	const handlePointerDownCapture = useCallback((): void => {
		pointerScrollActiveRef.current = true;
		lastScrollerTopRef.current = scrollerRef.current?.scrollTop ?? 0;
	}, []);

	const handlePointerEndCapture = useCallback((): void => {
		pointerScrollActiveRef.current = false;
	}, []);

	const handleScrollCapture = useCallback((): void => {
		const scroller: HTMLElement | null = scrollerRef.current;
		if (scroller === null) {
			return;
		}
		const nextScrollTop: number = scroller.scrollTop;
		if (
			(pointerScrollActiveRef.current || userScrollAwayIntentRef.current)
			&& nextScrollTop < lastScrollerTopRef.current - 1
		) {
			releaseBottomFollow();
		}
		userScrollAwayIntentRef.current = false;
		lastScrollerTopRef.current = nextScrollTop;
		scheduleBottomStateSync();
	}, [releaseBottomFollow, scheduleBottomStateSync]);

	const handleKeyDownCapture = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
		if (
			event.key === "ArrowUp"
			|| event.key === "PageUp"
			|| event.key === "Home"
			|| (event.key === " " && event.shiftKey)
		) {
			userScrollAwayIntentRef.current = true;
		}
	}, []);

	const handleScrollerRef = useCallback((element: HTMLElement | Window | null): void => {
		const scroller: HTMLElement | null = element instanceof HTMLElement ? element : null;
		if (scroller !== null && scroller !== scrollerRef.current) {
			initialBottomAnchorRef.current = true;
			shouldFollowBottomRef.current = true;
			lastTotalListHeightRef.current = null;
			lastScrollerTopRef.current = scroller.scrollTop;
			commitBottomState(true);
		}
		scrollerRef.current = scroller;
		onScrollContainerReady?.(scroller);
	}, [commitBottomState, onScrollContainerReady]);

	useEffect((): (() => void) => {
		const handlePointerEnd = (): void => {
			pointerScrollActiveRef.current = false;
		};
		window.addEventListener("pointerup", handlePointerEnd);
		window.addEventListener("pointercancel", handlePointerEnd);
		return (): void => {
			window.removeEventListener("pointerup", handlePointerEnd);
			window.removeEventListener("pointercancel", handlePointerEnd);
			onScrollContainerReady?.(null);
			if (bottomStateFrameRef.current !== null) {
				window.cancelAnimationFrame(bottomStateFrameRef.current);
			}
			if (bottomFollowFrameRef.current !== null) {
				window.cancelAnimationFrame(bottomFollowFrameRef.current);
			}
			if (highlightFrameRef.current !== null) {
				window.cancelAnimationFrame(highlightFrameRef.current);
			}
		};
	}, [onScrollContainerReady]);

	useEffect((): void => {
		if (scrollToBottomRequest <= 0 || lastScrollToBottomRequestRef.current === scrollToBottomRequest) {
			return;
		}
		lastScrollToBottomRequestRef.current = scrollToBottomRequest;
		scrollToBottomNow("smooth");
	}, [scrollToBottomNow, scrollToBottomRequest]);

	const renderHeader = useCallback((): React.JSX.Element => {
		return (
			<>
				<div className={styles.listEdgeSpacer} aria-hidden="true" />
				{errorMessage !== null && errorMessage !== undefined ? (
					<div className={styles.messageListContent}>
						<Alert description={errorMessage} type="error" showIcon={true} />
					</div>
				) : isLoadingMoreBefore ? (
					<div className={styles.pageLoadingIndicator}><Spin size="small" /></div>
				) : null}
			</>
		);
	}, [errorMessage, isLoadingMoreBefore]);

	const renderFooter = useCallback((): React.JSX.Element => {
		return (
			<>
				{isLoadingMoreAfter ? <div className={styles.pageLoadingIndicator}><Spin size="small" /></div> : null}
				<div className={styles.listEdgeSpacer} aria-hidden="true" />
			</>
		);
	}, [isLoadingMoreAfter]);

	const renderEmpty = useCallback((): null => null, []);

	const itemContent = useCallback((_index: number, item: RenderableTimelineBlock): React.ReactNode => {
		const block: TimelineBlock = item.block;
		if (!shouldRenderTimelineBlock(block)) {
			return <div className={styles.emptyAssistantPlaceholder} aria-hidden="true" />;
		}
		return (
			<div className={styles.messageListContent}>
				{block.type === "user" ? (
					<UserBubble
						entryId={block.id}
						searchBlockOffset={item.blockOffset}
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
				) : (
					<AssistantTimelineRow block={block} blockOffset={item.blockOffset} onInlineDiffReview={onInlineDiffReview} />
				)}
			</div>
		);
	}, [activeRetryRequestId, canEditUserMessages, onInlineDiffReview, onRetryEditCancel, onRetryEditStart, onRetryFromUserMessage, retryDisabled]);
	const virtuosoComponents = useMemo(() => ({
		Header: renderHeader,
		Footer: renderFooter,
		EmptyPlaceholder: renderEmpty
	}), [renderEmpty, renderFooter, renderHeader]);

	return (
		<>
			{messageContextHolder}
			{isInitialLoading ? (
				<div className={styles.initialLoadingShell}>
					<Spin className={styles.loadingIcon} />
				</div>
			) : (
			<TimelineDisclosureProvider>
				<Dropdown menu={messageContextMenu} trigger={["contextMenu"]}>
					<div
						className={styles.messageListShell}
						onContextMenuCapture={handleContextMenuCapture}
						onWheelCapture={handleWheelCapture}
						onPointerDownCapture={handlePointerDownCapture}
						onPointerUpCapture={handlePointerEndCapture}
						onPointerCancelCapture={handlePointerEndCapture}
						onScrollCapture={handleScrollCapture}
						onKeyDownCapture={handleKeyDownCapture}
					>
						<Virtuoso<RenderableTimelineBlock>
					ref={virtuosoRef}
					className={styles.messageList}
					data={items}
					firstItemIndex={blockOffset}
					initialTopMostItemIndex={{ index: "LAST", align: "end" }}
					computeItemKey={(_index: number, item: RenderableTimelineBlock): string => item.block.id}
					defaultItemHeight={defaultItemHeight}
					increaseViewportBy={increaseViewportBy}
					minOverscanItemCount={{ top: 3, bottom: 4 }}
					alignToBottom={true}
					followOutput={(): "auto" | false => shouldFollowBottomRef.current ? "auto" : false}
					atBottomThreshold={AT_BOTTOM_THRESHOLD}
					atBottomStateChange={handleAtBottomStateChange}
					totalListHeightChanged={handleTotalListHeightChanged}
					startReached={(): void => {
						if (hasMoreBefore && !isLoadingMoreBefore) {
							onLoadMoreBefore?.();
						}
					}}
					endReached={(): void => {
						if (hasMoreAfter && !isLoadingMoreAfter) {
							onLoadMoreAfter?.();
						}
					}}
					rangeChanged={handleRangeChanged}
					scrollerRef={handleScrollerRef}
					components={virtuosoComponents}
					itemContent={itemContent}
						/>
					</div>
				</Dropdown>
			</TimelineDisclosureProvider>
			)}
		</>
	);
});

export default memo(MessageList);
