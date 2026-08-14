import type { AdditionalContextItem, MessageTextAnchor, SelectionAskThread, TimelineAssistantBlock, TimelineBlock } from "@/platform/rpc/types";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import { formatElapsedTime, formatShortDateTime } from "@/domain/session/time-format";
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
import { resolveActiveBlockOffset, type ConversationViewportRow } from "@/domain/conversation/conversation-navigation";
import {
	createTimelineScrollFrameCoordinator,
	type TimelineScrollFrameCoordinator
} from "@/domain/conversation/timeline-scroll-frame";
import type { ConversationSearchMatch } from "@/domain/conversation/conversation-search-engine";
import {
	applyConversationSearchHighlights,
	clearConversationSearchHighlights
} from "@/domain/conversation/conversation-search-highlight";
import styles from "./MessageList.module.css";
import { isNearBottomByMetrics } from "@/domain/conversation/message-list-virtual";
import { TimelineDisclosureProvider } from "@/features/conversation/timeline-disclosure-state";
import { TimelineScrollFrameProvider } from "@/features/conversation/timeline-scroll-frame-context";
import UserBubble, { type RetryUserMessagePayload } from "./UserBubble";
import MessageSelectionOverlay from "./MessageSelectionOverlay";
import DividerPart from "./DividerPart";

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
	onForkFromUserMessage?: (requestId: string) => void | Promise<void>;
	onOpenForkSource?: (sessionId: string) => void | Promise<void>;
	forkDisabled?: boolean;
	forkingRequestId?: string | null;
	onInlineDiffReview?: () => void;
	scrollToBottomRequest?: number;
	onAwayFromBottomChange?: (awayFromBottom: boolean) => void;
	onActiveBlockOffsetChange?: (blockOffset: number | null) => void;
	blockOffset?: number;
	searchOpen?: boolean;
	searchQuery?: string;
	activeSearchMatch?: ConversationSearchMatch | null;
	contextItems?: AdditionalContextItem[];
	selectionAskThreads?: SelectionAskThread[];
	onAddSelectionContext?: (item: AdditionalContextItem) => void;
	onSelectionAsk?: (anchor: MessageTextAnchor) => Promise<void>;
	onOpenSelectionAsk?: (threadId: string) => Promise<void>;
	onDeleteSelectionAsk?: (threadId: string) => Promise<void>;
	onDeleteAllSelectionAsks?: () => Promise<void>;
	hideInlineDiff?: boolean;
};

export type MessageListHandle = {
	getActiveBlockOffset: () => number | null;
	scrollToBottom: (behavior?: ScrollBehavior) => void;
	scrollToEntry: (entryId: string, behavior?: ScrollBehavior) => boolean;
};

type RenderableTimelineBlock = {
	block: TimelineBlock;
	blockOffset: number;
};

const EMPTY_ADDITIONAL_CONTEXT: AdditionalContextItem[] = [];

const DEFAULT_ITEM_HEIGHT: number = 168;
const MIN_ITEM_HEIGHT: number = 48;
const MAX_ITEM_HEIGHT: number = 640;
const VIRTUAL_VIEWPORT_EXPANSION = { top: 480, bottom: 720 } as const;
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

export function getTimelineCopyText(blocks: readonly TimelineBlock[]): string {
	return blocks
		.map((block: TimelineBlock): string => block.type === "divider"
			? ""
			: block.type === "user"
				? block.content
				: getAssistantMarkdown(block))
		.map((content: string): string => content.trim())
		.filter((content: string): boolean => content.length > 0)
		.join("\n\n");
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

function getTimelineBlockOffsetAtPoint(
	scroller: HTMLElement,
	scrollerBounds: DOMRect,
	viewportY: number
): number | null {
	const viewportX: number = scrollerBounds.left + scroller.clientWidth / 2;
	let candidate: Element | null = document.elementFromPoint(viewportX, viewportY);
	while (candidate !== null && candidate !== scroller) {
		if (candidate instanceof HTMLElement && candidate.dataset.timelineBlockOffset !== undefined) {
			const blockOffset: number = Number(candidate.dataset.timelineBlockOffset);
			return Number.isSafeInteger(blockOffset) ? blockOffset : null;
		}
		candidate = candidate.parentElement;
	}
	return null;
}

type AssistantTimelineRowProps = {
	block: TimelineAssistantBlock;
	blockOffset: number;
	hideInlineDiff: boolean;
	onInlineDiffReview?: () => void;
	onTerminalWheelPassThrough?: (deltaY: number) => void;
};

const AssistantTimelineRow = memo(function AssistantTimelineRow({ block, blockOffset, hideInlineDiff, onInlineDiffReview, onTerminalWheelPassThrough }: AssistantTimelineRowProps): React.JSX.Element {
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
			requestId={block.requestId}
			searchBlockOffset={blockOffset}
			bodyParts={block.bodyParts}
			message={getAssistantMarkdown(block)}
			elapsedTime={formatElapsedTime(
				block.startedAtUtc,
				block.status === "running" ? nowIsoTime : block.completedAtUtc
			) ?? undefined}
			completionStatus={block.completionStatus}
			endTime={block.status === "running" ? undefined : formatShortDateTime(block.completedAtUtc)}
			streaming={block.status === "running"}
			selectionEnabled={block.status !== "running" && block.status !== "failed"}
			hideInlineDiff={hideInlineDiff}
			onInlineDiffReview={onInlineDiffReview}
			onTerminalWheelPassThrough={onTerminalWheelPassThrough}
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
	onForkFromUserMessage,
	onOpenForkSource,
	forkDisabled = false,
	forkingRequestId = null,
	onInlineDiffReview,
	scrollToBottomRequest = 0,
	onAwayFromBottomChange,
	onActiveBlockOffsetChange,
	blockOffset = 0,
	searchOpen = false,
	searchQuery = "",
	activeSearchMatch = null,
	contextItems = [],
	selectionAskThreads = [],
	onAddSelectionContext,
	onSelectionAsk,
	onOpenSelectionAsk,
	onDeleteSelectionAsk,
	onDeleteAllSelectionAsks,
	hideInlineDiff = false
}: MessageListProps, ref): React.JSX.Element {
	const { t } = useTranslation();
	const [messageApi, messageContextHolder] = message.useMessage();
	const virtuosoRef = useRef<VirtuosoHandle | null>(null);
	const scrollerRef = useRef<HTMLElement | null>(null);
	const scrollFrameCoordinatorRef = useRef<TimelineScrollFrameCoordinator | null>(null);
	if (scrollFrameCoordinatorRef.current === null) {
		scrollFrameCoordinatorRef.current = createTimelineScrollFrameCoordinator();
	}
	const scrollFrameCoordinator: TimelineScrollFrameCoordinator = scrollFrameCoordinatorRef.current;
	const shouldFollowBottomRef = useRef<boolean>(true);
	const initialBottomAnchorRef = useRef<boolean>(true);
	const bottomFollowFrameRef = useRef<number | null>(null);
	const lastTotalListHeightRef = useRef<number | null>(null);
	const lastScrollerTopRef = useRef<number>(0);
	const pointerScrollActiveRef = useRef<boolean>(false);
	const userScrollAwayIntentRef = useRef<boolean>(false);
	const lastScrollToBottomRequestRef = useRef<number>(0);
	const highlightFrameRef = useRef<number | null>(null);
	const lastReportedActiveBlockOffsetRef = useRef<number | null>(null);
	const lastReportedAwayFromBottomRef = useRef<boolean | null>(null);
	const [contextMenuSelection, setContextMenuSelection] = useState<string>("");
	const [selectionContainer, setSelectionContainer] = useState<HTMLElement | null>(null);
	const [selectionScroller, setSelectionScroller] = useState<HTMLElement | null>(null);
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
	const expandFullWindow: boolean = activeRetryRequestId !== null;
	const increaseViewportBy = expandFullWindow ? FULL_WINDOW_VIEWPORT_EXPANSION : VIRTUAL_VIEWPORT_EXPANSION;
	const scheduleTimelineScrollFrame = useCallback((): void => {
		scrollFrameCoordinator.schedule();
	}, [scrollFrameCoordinator]);
	const setAwayFromBottom = useCallback((awayFromBottom: boolean): void => {
		if (lastReportedAwayFromBottomRef.current === awayFromBottom) {
			return;
		}
		lastReportedAwayFromBottomRef.current = awayFromBottom;
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
		virtuosoRef.current?.scrollToIndex({ index: blockOffset + index, align: "start", behavior: normalizeVirtuosoScrollBehavior(behavior) });
		return true;
	}, [blockOffset, blocks, commitBottomState, releaseBottomFollow]);

	const getActiveBlockOffset = useCallback((): number | null => {
		const scroller: HTMLElement | null = scrollerRef.current;
		if (scroller === null) {
			return null;
		}
		const scrollerBounds: DOMRect = scroller.getBoundingClientRect();
		const activationTop: number = scrollerBounds.top + Math.min(56, scroller.clientHeight * 0.2);
		const atBottom: boolean = isNearBottomByMetrics(
			scroller.scrollHeight,
			scroller.scrollTop,
			scroller.clientHeight,
			AT_BOTTOM_THRESHOLD
		);
		if (!atBottom) {
			const pointedBlockOffset: number | null = getTimelineBlockOffsetAtPoint(scroller, scrollerBounds, activationTop);
			if (pointedBlockOffset !== null) {
				return pointedBlockOffset;
			}
		}
		const rows: ConversationViewportRow[] = Array.from(
			scroller.querySelectorAll<HTMLElement>("[data-timeline-block-offset]")
		).map((row: HTMLElement): ConversationViewportRow | null => {
			const parsedBlockOffset: number = Number(row.dataset.timelineBlockOffset);
			if (!Number.isSafeInteger(parsedBlockOffset)) {
				return null;
			}
			const rowBounds: DOMRect = row.getBoundingClientRect();
			return {
				blockOffset: parsedBlockOffset,
				top: rowBounds.top,
				bottom: rowBounds.bottom
			};
		}).filter((row: ConversationViewportRow | null): row is ConversationViewportRow => row !== null);
		return resolveActiveBlockOffset(
			rows,
			activationTop,
			atBottom,
			scrollerBounds.top,
			scrollerBounds.bottom
		) ?? lastReportedActiveBlockOffsetRef.current;
	}, []);

	useImperativeHandle(ref, (): MessageListHandle => ({
		getActiveBlockOffset,
		scrollToBottom: scrollToBottomNow,
		scrollToEntry
	}), [getActiveBlockOffset, scrollToBottomNow, scrollToEntry]);

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

	const copyAllMessageText = useCallback((): void => {
		const text: string = getTimelineCopyText(blocks);
		if (text.length === 0) {
			return;
		}
		void copyTextToClipboard(text)
			.then((): void => void messageApi.success(t("chat.common.copied")))
			.catch((error: unknown): void => {
				console.error("[MessageList] copy all messages failed", error);
				void messageApi.error(t("chat.common.copyFailed"));
			});
	}, [blocks, messageApi, t]);

	const messageContextMenu: MenuProps = useMemo((): MenuProps => ({
		items: [
			{ key: "copy-all", label: t("chat.common.copyAll"), disabled: blocks.length === 0 },
			...(contextMenuSelection.length > 0 ? [
				{ type: "divider" as const },
				{ key: "copy", label: t("chat.common.copy") }
			] : [])
		],
		onClick: ({ key, domEvent }): void => {
			domEvent.preventDefault();
			domEvent.stopPropagation();
			if (key === "copy-all") {
				copyAllMessageText();
			} else if (key === "copy") {
				copyContextMenuSelection();
			}
		}
	}), [blocks.length, contextMenuSelection.length, copyAllMessageText, copyContextMenuSelection, t]);

	const handleContextMenuCapture = useCallback((): void => {
		const scroller: HTMLElement | null = scrollerRef.current;
		if (scroller !== null) {
			flushSync((): void => setContextMenuSelection(getSelectedTextInside(scroller)));
		}
	}, []);

	const handleCopyCapture = useCallback((event: React.ClipboardEvent<HTMLDivElement>): void => {
		const scroller: HTMLElement | null = scrollerRef.current;
		const selectedText: string = scroller === null ? "" : getSelectedTextInside(scroller);
		if (selectedText.length === 0) {
			return;
		}

		event.preventDefault();
		void copyTextToClipboard(selectedText).catch((error: unknown): void => {
			console.error("[MessageList] native copy selected text failed", error);
			void messageApi.error(t("chat.common.copyFailed"));
		});
	}, [messageApi, t]);

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
				virtuosoRef.current?.scrollToIndex({ index: targetIndex, align: "center", behavior: "smooth" });
			}
		}
		applySearchHighlights(true);
		return (): void => clearConversationSearchHighlights(scrollerRef.current);
	}, [activeSearchMatch, applySearchHighlights, blockOffset, blocks.length, commitBottomState, releaseBottomFollow]);

	const syncActiveBlockOffset = useCallback((): void => {
		const nextBlockOffset: number | null = getActiveBlockOffset();
		if (nextBlockOffset !== null && nextBlockOffset !== lastReportedActiveBlockOffsetRef.current) {
			lastReportedActiveBlockOffsetRef.current = nextBlockOffset;
			onActiveBlockOffsetChange?.(nextBlockOffset);
		}
	}, [getActiveBlockOffset, onActiveBlockOffsetChange]);

	useEffect((): (() => void) => {
		const unsubscribe = scrollFrameCoordinator.subscribe("active_block", syncActiveBlockOffset);
		scheduleTimelineScrollFrame();
		return unsubscribe;
	}, [scheduleTimelineScrollFrame, scrollFrameCoordinator, syncActiveBlockOffset]);
	useEffect((): (() => void) => {
		const unsubscribe = scrollFrameCoordinator.subscribe("bottom_state", syncBottomStateFromMetrics);
		scheduleTimelineScrollFrame();
		return unsubscribe;
	}, [scheduleTimelineScrollFrame, scrollFrameCoordinator, syncBottomStateFromMetrics]);
	useEffect((): (() => void) => (): void => scrollFrameCoordinator.cancel(), [scrollFrameCoordinator]);

	const handleVirtuosoScrolling = useCallback((_scrolling: boolean): void => {
		scheduleTimelineScrollFrame();
	}, [scheduleTimelineScrollFrame]);

	const handleRangeChanged = useCallback((_range: ListRange): void => {
		scheduleTimelineScrollFrame();
		if (searchOpen) {
			// 可见范围变化通常由滚动、定位或高亮触发。这里只安排下一帧更新，
			// 不让 Virtuoso 的 rangeChanged 反过来驱动 React 状态更新，避免滚动时形成更新闭环。
			applySearchHighlights(false);
		}
	}, [applySearchHighlights, scheduleTimelineScrollFrame, searchOpen]);

	useLayoutEffect((): void => {
		scheduleTimelineScrollFrame();
	}, [items, scheduleTimelineScrollFrame]);

	const handleAtBottomStateChange = useCallback((atBottom: boolean): void => {
		if (atBottom) {
			initialBottomAnchorRef.current = false;
			shouldFollowBottomRef.current = true;
			commitBottomState(true);
		}
		scheduleTimelineScrollFrame();
	}, [commitBottomState, scheduleTimelineScrollFrame]);

	const handleTotalListHeightChanged = useCallback((height: number): void => {
		if (height <= 0 || lastTotalListHeightRef.current === height) {
			return;
		}
		lastTotalListHeightRef.current = height;
		if (initialBottomAnchorRef.current || shouldFollowBottomRef.current) {
			commitBottomState(true);
			scheduleBottomFollow();
		}
		scheduleTimelineScrollFrame();
	}, [commitBottomState, scheduleBottomFollow, scheduleTimelineScrollFrame]);

	const handleWheelCapture = useCallback((event: React.WheelEvent<HTMLDivElement>): void => {
		userScrollAwayIntentRef.current = event.deltaY < 0;
	}, []);

	const handleTerminalWheelPassThrough = useCallback((deltaY: number): void => {
		const scroller: HTMLElement | null = scrollerRef.current;
		if (scroller === null || !Number.isFinite(deltaY) || deltaY === 0) {
			return;
		}
		userScrollAwayIntentRef.current = deltaY < 0;
		scroller.scrollTop += deltaY;
		scheduleTimelineScrollFrame();
	}, [scheduleTimelineScrollFrame]);

	const handlePointerDownCapture = useCallback((): void => {
		pointerScrollActiveRef.current = true;
		lastScrollerTopRef.current = scrollerRef.current?.scrollTop ?? 0;
	}, []);

	const handlePointerEndCapture = useCallback((): void => {
		pointerScrollActiveRef.current = false;
	}, []);

	const handleScrollerScroll = useCallback((): void => {
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
		scheduleTimelineScrollFrame();
	}, [releaseBottomFollow, scheduleTimelineScrollFrame]);

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
		setSelectionScroller((current: HTMLElement | null): HTMLElement | null => current === scroller ? current : scroller);
		scheduleTimelineScrollFrame();
	}, [commitBottomState, scheduleTimelineScrollFrame]);

	useEffect((): (() => void) | undefined => {
		const scroller: HTMLElement | null = selectionScroller;
		if (scroller === null) {
			return undefined;
		}
		scroller.addEventListener("scroll", handleScrollerScroll, { passive: true });
		scheduleTimelineScrollFrame();
		return (): void => scroller.removeEventListener("scroll", handleScrollerScroll);
	}, [handleScrollerScroll, scheduleTimelineScrollFrame, selectionScroller]);

	useEffect((): (() => void) | undefined => {
		const scroller: HTMLElement | null = selectionScroller;
		if (scroller === null) {
			return undefined;
		}
		const resizeObserver = new ResizeObserver(scheduleTimelineScrollFrame);
		resizeObserver.observe(scroller);
		const observeMountedRows = (): void => {
			for (const row of scroller.querySelectorAll<HTMLElement>("[data-timeline-block-offset]")) {
				resizeObserver.observe(row);
			}
		};
		observeMountedRows();
		const mutationObserver = new MutationObserver((): void => {
			observeMountedRows();
			scheduleTimelineScrollFrame();
		});
		mutationObserver.observe(scroller, { childList: true, subtree: true });
		scheduleTimelineScrollFrame();
		return (): void => {
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [scheduleTimelineScrollFrame, selectionScroller]);

	useEffect((): (() => void) => {
		const handlePointerEnd = (): void => {
			pointerScrollActiveRef.current = false;
		};
		window.addEventListener("pointerup", handlePointerEnd);
		window.addEventListener("pointercancel", handlePointerEnd);
		return (): void => {
			window.removeEventListener("pointerup", handlePointerEnd);
			window.removeEventListener("pointercancel", handlePointerEnd);
			if (bottomFollowFrameRef.current !== null) {
				window.cancelAnimationFrame(bottomFollowFrameRef.current);
			}
			if (highlightFrameRef.current !== null) {
				window.cancelAnimationFrame(highlightFrameRef.current);
			}
		};
	}, []);

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
			return <div className={styles.emptyAssistantPlaceholder} data-timeline-block-offset={item.blockOffset} aria-hidden="true" />;
		}
		return (
			<div className={styles.messageListContent} data-timeline-block-offset={item.blockOffset}>
				{block.type === "divider" ? (
					<DividerPart block={block} onOpenForkSource={onOpenForkSource} />
				) : block.type === "user" ? (
					<UserBubble
						entryId={block.id}
						searchBlockOffset={item.blockOffset}
						requestId={block.requestId}
						message={block.content}
						additionalContext={block.additionalContext ?? EMPTY_ADDITIONAL_CONTEXT}
						sentTime={formatShortDateTime(block.sentAtUtc)}
						showEditButton={canEditUserMessages}
						disabled={retryDisabled}
						isRetryEditing={activeRetryRequestId === block.requestId}
						onRetryEditStart={onRetryEditStart}
						onRetryEditCancel={onRetryEditCancel}
						onRetryFromUserMessage={onRetryFromUserMessage}
						onForkFromUserMessage={onForkFromUserMessage}
						forkDisabled={forkDisabled}
						isForking={forkingRequestId === block.requestId}
					/>
				) : (
					<AssistantTimelineRow block={block} blockOffset={item.blockOffset} hideInlineDiff={hideInlineDiff} onInlineDiffReview={onInlineDiffReview} onTerminalWheelPassThrough={handleTerminalWheelPassThrough} />
				)}
			</div>
		);
	}, [activeRetryRequestId, canEditUserMessages, forkDisabled, forkingRequestId, handleTerminalWheelPassThrough, hideInlineDiff, onForkFromUserMessage, onInlineDiffReview, onOpenForkSource, onRetryEditCancel, onRetryEditStart, onRetryFromUserMessage, retryDisabled]);
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
				<TimelineScrollFrameProvider coordinator={scrollFrameCoordinator}>
					<TimelineDisclosureProvider>
						<Dropdown menu={messageContextMenu} trigger={["contextMenu"]}>
							<div
								ref={setSelectionContainer}
								className={styles.messageListShell}
								onCopyCapture={handleCopyCapture}
								onContextMenuCapture={handleContextMenuCapture}
								onWheelCapture={handleWheelCapture}
								onPointerDownCapture={handlePointerDownCapture}
								onPointerUpCapture={handlePointerEndCapture}
								onPointerCancelCapture={handlePointerEndCapture}
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
									isScrolling={handleVirtuosoScrolling}
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
								{onAddSelectionContext !== undefined && onSelectionAsk !== undefined && onOpenSelectionAsk !== undefined && onDeleteSelectionAsk !== undefined && onDeleteAllSelectionAsks !== undefined ? (
									<MessageSelectionOverlay
										container={selectionContainer}
										scroller={selectionScroller}
										contextItems={contextItems}
										askThreads={selectionAskThreads}
										onAddContext={onAddSelectionContext}
										onAsk={onSelectionAsk}
										onOpenAsk={onOpenSelectionAsk}
										onDeleteAsk={onDeleteSelectionAsk}
										onDeleteAllAsks={onDeleteAllSelectionAsks}
									/>
								) : null}
							</div>
						</Dropdown>
					</TimelineDisclosureProvider>
				</TimelineScrollFrameProvider>
			)}
		</>
	);
});

export default memo(MessageList);
