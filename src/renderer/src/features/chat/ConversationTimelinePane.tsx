import type { AdditionalContextItem, AgentGoalState, MessageTextAnchor, SelectionAskThread, SessionTimelineNavigationEntry, TimelineBlock } from "@/api/types";
import type { TimelinePageStore } from "@/features/workbench/timeline-page-store";
import { useTimelinePage } from "@/features/workbench/timeline-page-store";
import type { RetryUserMessagePayload } from "./UserBubble";
import ConversationAnchorNavigator from "./ConversationAnchorNavigator";
import { resolveActiveTimelineEntryId, resolveAdjacentTimelineEntry } from "./conversation-navigation";
import ConversationSearchPanel from "./ConversationSearchPanel";
import MessageList, { type MessageListHandle } from "./MessageList";
import { useConversationSearch } from "./useConversationSearch";
import { App, type InputRef } from "antd";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelectionAsk } from "./useSelectionAsk";
import SelectionAskDialog from "./SelectionAskDialog";
import styles from "./ConversationTimelinePane.module.css";
import { shouldHideInlineDiffForGoal } from "@/features/composer/goal-display";

export type ConversationTimelinePaneHandle = {
	closeSearch: () => boolean;
	navigateTurn: (direction: "previous" | "next") => void;
	openSearch: (query?: string) => void;
	scrollToBottom: (behavior?: ScrollBehavior) => void;
};

export type ConversationTimelinePaneProps = {
	sessionId: string;
	timelineStore: TimelinePageStore;
	timelineNavigationEntries: SessionTimelineNavigationEntry[];
	isLoading: boolean;
	errorMessage: string | null;
	isLoadingMoreBefore: boolean;
	isLoadingMoreAfter: boolean;
	retryDisabled: boolean;
	activeRetryRequestId: string | null;
	onLoadMoreBefore: () => void;
	onLoadMoreAfter: () => void;
	onTimelineNavigationLoadEntry: (entry: SessionTimelineNavigationEntry) => Promise<void>;
	onTimelineSearchLoadOffset: (blockOffset: number) => Promise<void>;
	onRetryEditStart: (requestId: string) => void;
	onRetryEditCancel: (requestId: string) => void;
	onRetryFromUserMessage: (payload: RetryUserMessagePayload) => Promise<boolean>;
	onInlineDiffReview: () => void;
	onAwayFromBottomChange: (awayFromBottom: boolean) => void;
	contextItems: AdditionalContextItem[];
	onAddContext: (item: AdditionalContextItem) => void;
	initialSelectionAskThreads: SelectionAskThread[];
	goal: AgentGoalState | null;
};

const ConversationTimelinePane = forwardRef<ConversationTimelinePaneHandle, ConversationTimelinePaneProps>(function ConversationTimelinePane({
	sessionId,
	timelineStore,
	timelineNavigationEntries,
	isLoading,
	errorMessage,
	isLoadingMoreBefore,
	isLoadingMoreAfter,
	retryDisabled,
	activeRetryRequestId,
	onLoadMoreBefore,
	onLoadMoreAfter,
	onTimelineNavigationLoadEntry,
	onTimelineSearchLoadOffset,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage,
	onInlineDiffReview,
	onAwayFromBottomChange,
	contextItems,
	onAddContext,
	initialSelectionAskThreads,
	goal
}: ConversationTimelinePaneProps, ref): React.JSX.Element {
	const { i18n, t } = useTranslation();
	const { message } = App.useApp();
	const timelinePage = useTimelinePage(timelineStore);
	const messageListRef = useRef<MessageListHandle | null>(null);
	const conversationSearchInputRef = useRef<InputRef | null>(null);
	const [messageScrollContainer, setMessageScrollContainer] = useState<HTMLElement | null>(null);
	const [activeTimelineBlockOffset, setActiveTimelineBlockOffset] = useState<number | null>(null);
	const [pendingTimelineEntryId, setPendingTimelineEntryId] = useState<string | null>(null);
	const selectionAsk = useSelectionAsk(sessionId, initialSelectionAskThreads);
	const activeSelectionAskThread: SelectionAskThread | null = selectionAsk.activeThreadId === null
		? null
		: selectionAsk.threads.find((thread: SelectionAskThread): boolean => thread.threadId === selectionAsk.activeThreadId) ?? null;
	const activeTimelineEntryId: string | null = useMemo(
		(): string | null => resolveActiveTimelineEntryId(timelineNavigationEntries, activeTimelineBlockOffset),
		[activeTimelineBlockOffset, timelineNavigationEntries]
	);
	const handleConversationSearchLoadError = useCallback((error: unknown): void => {
		console.warn("[ConversationTimelinePane] conversation search degraded to loaded messages", error);
	}, []);
	const conversationSearch = useConversationSearch({
		sessionId,
		timelineBlocks: timelinePage.blocks,
		timelineBlockOffset: timelinePage.blockOffset,
		activeRetryRequestId,
		onLoadBlockOffset: onTimelineSearchLoadOffset,
		onLoadError: handleConversationSearchLoadError
	});

	const focusConversationSearchInput = useCallback((): void => {
		window.requestAnimationFrame((): void => {
			conversationSearchInputRef.current?.focus();
			conversationSearchInputRef.current?.select();
		});
	}, []);

	useEffect((): void => {
		if (conversationSearch.open) {
			focusConversationSearchInput();
		}
	}, [conversationSearch.open, focusConversationSearchInput]);

	useEffect((): void => {
		setActiveTimelineBlockOffset(null);
		setPendingTimelineEntryId(null);
	}, [sessionId]);

	useEffect((): void => {
		if (pendingTimelineEntryId === null || !timelinePage.blocks.some((block: TimelineBlock): boolean => block.id === pendingTimelineEntryId)) {
			return;
		}
		window.requestAnimationFrame((): void => {
			if (messageListRef.current?.scrollToEntry(pendingTimelineEntryId, "smooth") === true) {
				setPendingTimelineEntryId(null);
			}
		});
	}, [pendingTimelineEntryId, timelinePage.blocks]);

	const handleTimelineNavigate = useCallback((entry: SessionTimelineNavigationEntry): void => {
		setActiveTimelineBlockOffset(entry.blockOffset);
		if (messageListRef.current?.scrollToEntry(entry.entryId, "smooth") === true) {
			return;
		}
		setPendingTimelineEntryId(entry.entryId);
		void onTimelineNavigationLoadEntry(entry);
	}, [onTimelineNavigationLoadEntry]);
	const handleViewportTimelineEntryChange = useCallback((entry: SessionTimelineNavigationEntry): void => {
		setActiveTimelineBlockOffset(entry.blockOffset);
	}, []);

	const handleSelectionAsk = useCallback(async (anchor: MessageTextAnchor): Promise<void> => {
		try {
			await selectionAsk.createOrOpen(anchor, i18n.language.startsWith("zh") ? "zh-CN" : "en-US");
		} catch (error: unknown) {
			void message.error(error instanceof Error ? error.message : t("chat.selection.askFailed"));
		}
	}, [i18n.language, message, selectionAsk, t]);
	const handleDeleteSelectionAsk = useCallback(async (threadId: string): Promise<void> => {
		try {
			await selectionAsk.remove(threadId);
		} catch (error: unknown) {
			void message.error(error instanceof Error ? error.message : t("chat.selection.deleteAskFailed"));
		}
	}, [message, selectionAsk, t]);
	const handleDeleteAllSelectionAsks = useCallback(async (): Promise<void> => {
		try {
			await selectionAsk.removeAll();
		} catch (error: unknown) {
			void message.error(error instanceof Error ? error.message : t("chat.selection.deleteAskFailed"));
		}
	}, [message, selectionAsk, t]);

	const navigateTurn = useCallback((direction: "previous" | "next"): void => {
		if (timelineNavigationEntries.length === 0) {
			return;
		}
		const liveBlockOffset: number | null = messageListRef.current?.getActiveBlockOffset() ?? activeTimelineBlockOffset;
		const liveActiveEntryId: string | null = resolveActiveTimelineEntryId(timelineNavigationEntries, liveBlockOffset);
		const target: SessionTimelineNavigationEntry | null = resolveAdjacentTimelineEntry(
			timelineNavigationEntries,
			liveActiveEntryId,
			direction
		);
		if (target !== null) {
			handleTimelineNavigate(target);
		}
	}, [activeTimelineBlockOffset, handleTimelineNavigate, timelineNavigationEntries]);

	useImperativeHandle(ref, (): ConversationTimelinePaneHandle => ({
		closeSearch: (): boolean => {
			if (!conversationSearch.open) {
				return false;
			}
			conversationSearch.closeSearch();
			return true;
		},
		navigateTurn,
		openSearch: (query?: string): void => {
			conversationSearch.openSearch(query);
			focusConversationSearchInput();
		},
		scrollToBottom: (behavior: ScrollBehavior = "smooth"): void => {
			messageListRef.current?.scrollToBottom(behavior);
		}
	}), [conversationSearch, focusConversationSearchInput, navigateTurn]);

	return (
		<div className={styles.timelinePane}>
			<ConversationSearchPanel
				open={conversationSearch.open}
				query={conversationSearch.query}
				current={conversationSearch.current}
				total={conversationSearch.total}
				loading={conversationSearch.loading}
				inputRef={conversationSearchInputRef}
				onQueryChange={conversationSearch.setQuery}
				onPrevious={conversationSearch.goPrevious}
				onNext={conversationSearch.goNext}
				onClose={conversationSearch.closeSearch}
			/>
			<MessageList
				key={sessionId}
				ref={messageListRef}
				blocks={timelinePage.blocks}
				blockOffset={timelinePage.blockOffset}
				searchOpen={conversationSearch.open}
				searchQuery={conversationSearch.query}
				activeSearchMatch={conversationSearch.activeMatch}
				hideInlineDiff={shouldHideInlineDiffForGoal(goal)}
				contextItems={contextItems}
				selectionAskThreads={selectionAsk.threads}
				onAddSelectionContext={onAddContext}
				onSelectionAsk={handleSelectionAsk}
				onOpenSelectionAsk={selectionAsk.open}
				onDeleteSelectionAsk={handleDeleteSelectionAsk}
				onDeleteAllSelectionAsks={handleDeleteAllSelectionAsks}
				isLoading={isLoading}
				errorMessage={errorMessage}
				hasMoreBefore={timelinePage.hasMoreBefore}
				hasMoreAfter={timelinePage.hasMoreAfter}
				isLoadingMoreBefore={isLoadingMoreBefore}
				isLoadingMoreAfter={isLoadingMoreAfter}
				onLoadMoreBefore={onLoadMoreBefore}
				onLoadMoreAfter={onLoadMoreAfter}
				retryDisabled={retryDisabled}
				activeRetryRequestId={activeRetryRequestId}
				onRetryEditStart={onRetryEditStart}
				onRetryEditCancel={onRetryEditCancel}
				onRetryFromUserMessage={onRetryFromUserMessage}
				onInlineDiffReview={onInlineDiffReview}
				onAwayFromBottomChange={onAwayFromBottomChange}
				onActiveBlockOffsetChange={setActiveTimelineBlockOffset}
				onScrollContainerReady={setMessageScrollContainer}
			/>
			<ConversationAnchorNavigator
				entries={timelineNavigationEntries}
				activeEntryId={activeTimelineEntryId}
				scrollContainer={messageScrollContainer}
				onNavigate={handleTimelineNavigate}
				onActiveEntryChange={handleViewportTimelineEntryChange}
			/>
			<SelectionAskDialog
				thread={activeSelectionAskThread}
				messages={activeSelectionAskThread === null ? [] : selectionAsk.messagesByThread[activeSelectionAskThread.threadId] ?? []}
				loading={selectionAsk.loading}
				sending={selectionAsk.sending || activeSelectionAskThread?.status === "running"}
				cancelling={selectionAsk.cancelling}
				error={selectionAsk.error}
				onClose={selectionAsk.close}
				onSend={selectionAsk.send}
				onStop={selectionAsk.cancel}
			/>
		</div>
	);
});

export default memo(ConversationTimelinePane);
