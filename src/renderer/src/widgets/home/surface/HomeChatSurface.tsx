import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button, Divider, Dropdown, Space, Typography, Tooltip } from "antd";
import type {
	AdditionalContextItem,
	AgentGoalState,
	MessageQueueItem,
	PendingGuide,
	PendingToolBudget,
	PlanApprovalState,
	PlanClarificationState,
	SelectionAskThread,
	SessionMetadata,
	SessionTimelineNavigationEntry,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { PendingApproval } from "@/platform/rpc/approval-api";
import ConversationTimelinePane, {
	type ConversationTimelinePaneHandle,
} from "@/widgets/conversation/ConversationTimelinePane";
import type { RetryUserMessagePayload } from "@/widgets/conversation/UserBubble";
import MessageQueuePanel from "@/widgets/composer/MessageQueuePanel";
import NewSessionHome from "./NewSessionHome";
import ApprovalDialog from "@/widgets/approval/ApprovalDialog";
import ToolBudgetDialog from "@/widgets/approval/ToolBudgetDialog";
import ClarificationDialog from "@/widgets/clarification/ClarificationDialog";
import PlanApprovalDialog from "@/widgets/approval/PlanApprovalDialog";
import { Icon } from "@/assets/icons";
import { MarkdownResourceActionsProvider } from "@/widgets/markdown/markdown-resource-actions";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";
import styles from "../HomePage.module.css";

type WorkspaceLaunchTarget = {
	id: WorkspaceLaunchTargetId;
	label: string;
};

export type HomeChatSurfaceProps = {
	activeSessionMetadata: SessionMetadata | null;
	isSessionLoading: boolean;
	onForkSourceOpen: (sessionId: string) => Promise<void>;
	onSessionWorktreeSetup: (action: "retry" | "skip") => Promise<void>;
	onSessionWorktreeHandoff: (target: "local" | "worktree") => Promise<void>;
	chatTitle: string;
	sideDockOpen: boolean;
	isHome: boolean;
	chatBodyRef: MutableRefObject<HTMLDivElement | null>;
	homeWorkspace: WorkspaceConfig | null;
	sessionError: string | null;
	message: string;
	chatSurfaceSettled: boolean;
	handleHomeStarterSelect: (prompt: string) => void;
	activeSessionId: string | null;
	workspaceForActions: WorkspaceConfig | null;
	effectiveGodotLaunchExecutablePath: string | null;
	selectedLaunchTarget: WorkspaceLaunchTarget;
	workspaceLaunchTargets: readonly WorkspaceLaunchTarget[];
	openMessageWebUrl: (url: string) => void;
	openMessageHtmlFile: (params: {
		workspaceRoot: string;
		filePath: string;
	}) => void;
	conversationTimelinePaneRef: MutableRefObject<ConversationTimelinePaneHandle | null>;
	timelineStore: TimelinePageStore;
	timelineNavigationEntries: SessionTimelineNavigationEntry[];
	isLoadingMoreBefore: boolean;
	isLoadingMoreAfter: boolean;
	retryDisabled: boolean;
	activeRetryRequestId: string | null;
	onLoadMoreBefore: () => void;
	onLoadMoreAfter: () => void;
	onTimelineNavigationLoadEntry: (
		entry: SessionTimelineNavigationEntry,
	) => Promise<void>;
	onTimelineSearchLoadOffset: (blockOffset: number) => Promise<void>;
	onRetryEditStart: (requestId: string) => void;
	onRetryEditCancel: (requestId: string) => void;
	onRetryFromUserMessage: (
		payload: RetryUserMessagePayload,
	) => Promise<boolean>;
	onForkFromUserMessage: (requestId: string) => Promise<void>;
	forkDisabled: boolean;
	forkingRequestId: string | null;
	openReviewPanel: () => void;
	setScrollToBottomButtonVisible: (visible: boolean) => void;
	selectionMarkerContextItems: AdditionalContextItem[];
	onAddContext: (item: AdditionalContextItem) => void;
	selectionAskThreads: SelectionAskThread[];
	currentGoal: AgentGoalState | null;
	scrollToBottomButtonRef: MutableRefObject<HTMLButtonElement | null>;
	showExecutionStatusPanel: boolean;
	executionStatusPanel: React.ReactNode;
	isDockFullscreen: boolean;
	scrollMessageListToBottom: () => void;
	pendingApproval: PendingApproval | null;
	isApproving: boolean;
	isApprovalAutoSafeEnabling: boolean;
	isRejecting: boolean;
	approvalError: string | null;
	onApprovalApprove: (approvalId: string, consentText?: string) => void;
	onApprovalApproveAndEnableAutoSafe: (
		approvalId: string,
		consentText?: string,
	) => void;
	onApprovalReject: (approvalId: string) => void;
	pendingToolBudget: PendingToolBudget | null;
	isToolBudgetContinuing: boolean;
	isToolBudgetStopping: boolean;
	isCancelling: boolean;
	toolBudgetError: string | null;
	onToolBudgetContinue: (budgetId: string) => void;
	onToolBudgetStop: (budgetId: string) => void;
	onCancel: () => void;
	pendingPlanClarification: PlanClarificationState | null;
	isPlanClarificationSubmitting: boolean;
	planClarificationError: string | null;
	onPlanClarificationSubmit: (reply: string) => void;
	onPlanClarificationSkip: () => void;
	pendingPlanApproval: PlanApprovalState | null;
	isPlanApproving: boolean;
	isPlanRevising: boolean;
	planApprovalError: string | null;
	onPlanApprove: (planId: string) => void;
	onPlanRevise: (planId: string, feedback: string) => void;
	messageQueue: MessageQueueItem[];
	pendingGuides: PendingGuide[];
	activeQueueItemId: number | null;
	onQueueMessageRemove: (queueId: number) => void;
	onQueueMessageEdit: (item: MessageQueueItem) => void;
	onQueueMessageReorder: (queueIds: number[]) => void;
	onGuideDelete: (guideId: string) => void;
	onGuideReorder: (guideIds: string[]) => void;
	renderComposer: (compact: boolean) => React.JSX.Element;
};

function HomeChatSurface({
	activeSessionMetadata,
	isSessionLoading,
	onForkSourceOpen,
	onSessionWorktreeSetup,
	onSessionWorktreeHandoff,
	chatTitle,
	sideDockOpen,
	isHome,
	chatBodyRef,
	homeWorkspace,
	sessionError,
	message,
	chatSurfaceSettled,
	handleHomeStarterSelect,
	activeSessionId,
	workspaceForActions,
	effectiveGodotLaunchExecutablePath,
	selectedLaunchTarget,
	workspaceLaunchTargets,
	openMessageWebUrl,
	openMessageHtmlFile,
	conversationTimelinePaneRef,
	timelineStore,
	timelineNavigationEntries,
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
	onForkFromUserMessage,
	forkDisabled,
	forkingRequestId,
	openReviewPanel,
	setScrollToBottomButtonVisible,
	selectionMarkerContextItems,
	onAddContext,
	selectionAskThreads,
	currentGoal,
	scrollToBottomButtonRef,
	showExecutionStatusPanel,
	executionStatusPanel,
	isDockFullscreen,
	scrollMessageListToBottom,
	pendingApproval,
	isApproving,
	isApprovalAutoSafeEnabling,
	isRejecting,
	approvalError,
	onApprovalApprove,
	onApprovalApproveAndEnableAutoSafe,
	onApprovalReject,
	pendingToolBudget,
	isToolBudgetContinuing,
	isToolBudgetStopping,
	isCancelling,
	toolBudgetError,
	onToolBudgetContinue,
	onToolBudgetStop,
	onCancel,
	pendingPlanClarification,
	isPlanClarificationSubmitting,
	planClarificationError,
	onPlanClarificationSubmit,
	onPlanClarificationSkip,
	pendingPlanApproval,
	isPlanApproving,
	isPlanRevising,
	planApprovalError,
	onPlanApprove,
	onPlanRevise,
	messageQueue,
	pendingGuides,
	activeQueueItemId,
	onQueueMessageRemove,
	onQueueMessageEdit,
	onQueueMessageReorder,
	onGuideDelete,
	onGuideReorder,
	renderComposer,
}: HomeChatSurfaceProps): React.JSX.Element {
	const { t } = useTranslation();

	return (
		<section className={styles.chatPanel}>
			<header
				className={styles.chatHeader}
				data-side-dock-open={sideDockOpen ? "true" : undefined}
			>
				<div className={styles.chatTitleRow}>
					<Typography.Text
						className={styles.chatText}
						ellipsis={{
							tooltip: chatTitle,
						}}
					>
						{chatTitle}
					</Typography.Text>
					{activeSessionMetadata?.forkedFrom !== undefined ? (
						<Tooltip
							placement="bottom"
							title={t("chat.fork.openSourceTooltip")}
						>
							<Button
								type="text"
								size="small"
								shape="circle"
								className={styles.forkOriginButton}
								aria-label={t("chat.fork.openSourceAria")}
								icon={<Icon name="fork" />}
								disabled={isSessionLoading}
								onClick={(): void => {
									void onForkSourceOpen(
										activeSessionMetadata.forkedFrom!
											.sessionId,
									);
								}}
							/>
						</Tooltip>
					) : null}
					{activeSessionMetadata?.worktree !== undefined ? (
						<Space size={4}>
							<Tooltip
								title={t("agentPage.worktree.source", {
									workspace:
										activeSessionMetadata.worktree
											.sourceWorkspaceName,
								})}
							>
								<span className={styles.worktreeBadge}>
									<Icon name="git-branch" />
									{t("agentPage.worktree.label")}
								</span>
							</Tooltip>
							<Dropdown
								menu={{
									items: [
										...((activeSessionMetadata.worktree
											.status ?? "ready") === "ready"
											? []
											: [
													{
														key: "setup-retry",
														label: t(
															"agentPage.worktree.setupRetry",
														),
													},
													{
														key: "setup-skip",
														label: t(
															"agentPage.worktree.setupSkip",
														),
													},
													{
														type: "divider" as const,
													},
												]),
										{
											key: "local",
											label: t(
												"agentPage.worktree.handoffLocal",
											),
											disabled:
												(activeSessionMetadata.worktree
													.location ?? "worktree") ===
												"local",
										},
										{
											key: "worktree",
											label: t(
												"agentPage.worktree.handoffWorktree",
											),
											disabled:
												(activeSessionMetadata.worktree
													.location ?? "worktree") ===
												"worktree",
										},
									],
									onClick: ({ key }): void => {
										if (
											key === "setup-retry" ||
											key === "setup-skip"
										) {
											void onSessionWorktreeSetup(
												key === "setup-retry"
													? "retry"
													: "skip",
											);
											return;
										}
										void onSessionWorktreeHandoff(
											key as "local" | "worktree",
										);
									},
								}}
							>
								<Button
									type="text"
									size="small"
									icon={<Icon name="arrow-forward" />}
									aria-label={t("agentPage.worktree.handoff")}
								/>
							</Dropdown>
						</Space>
					) : null}
				</div>
			</header>

			<Divider size="small" />

			<div ref={chatBodyRef} className={styles.chatBody}>
				{isHome ? (
					<NewSessionHome
						workspace={homeWorkspace}
						errorMessage={sessionError}
						message={message}
						showStarters={chatSurfaceSettled}
						onStarterSelect={handleHomeStarterSelect}
					/>
				) : activeSessionId !== null ? (
					<MarkdownResourceActionsProvider
						value={{
							workspaceRoots:
								workspaceForActions === null
									? []
									: [
											workspaceForActions.rootPath,
											...workspaceForActions.sourceFolders.map(
												(sourceFolder): string =>
													sourceFolder.path,
											),
										],
							godotExecutablePath:
								effectiveGodotLaunchExecutablePath,
							currentWorkspaceLaunch:
								workspaceForActions === null
									? null
									: selectedLaunchTarget,
							launchTargets: workspaceLaunchTargets,
							openWebUrl: openMessageWebUrl,
							openHtmlFile: openMessageHtmlFile,
						}}
					>
						<ConversationTimelinePane
							ref={conversationTimelinePaneRef}
							sessionId={activeSessionId}
							timelineStore={timelineStore}
							timelineNavigationEntries={
								timelineNavigationEntries
							}
							isLoading={isSessionLoading}
							errorMessage={sessionError}
							isLoadingMoreBefore={isLoadingMoreBefore}
							isLoadingMoreAfter={isLoadingMoreAfter}
							retryDisabled={retryDisabled}
							activeRetryRequestId={activeRetryRequestId}
							onLoadMoreBefore={onLoadMoreBefore}
							onLoadMoreAfter={onLoadMoreAfter}
							onTimelineNavigationLoadEntry={
								onTimelineNavigationLoadEntry
							}
							onTimelineSearchLoadOffset={
								onTimelineSearchLoadOffset
							}
							onRetryEditStart={onRetryEditStart}
							onRetryEditCancel={onRetryEditCancel}
							onRetryFromUserMessage={onRetryFromUserMessage}
							onForkFromUserMessage={onForkFromUserMessage}
							onOpenForkSource={onForkSourceOpen}
							forkDisabled={forkDisabled}
							forkingRequestId={forkingRequestId}
							onInlineDiffReview={openReviewPanel}
							onAwayFromBottomChange={
								setScrollToBottomButtonVisible
							}
							contextItems={selectionMarkerContextItems}
							onAddContext={onAddContext}
							initialSelectionAskThreads={selectionAskThreads}
							goal={currentGoal}
						/>
					</MarkdownResourceActionsProvider>
				) : null}
			</div>

			<footer className={styles.composer}>
				{!isHome ? (
					<Button
						ref={scrollToBottomButtonRef}
						shape="circle"
						title={t("agentPage.actions.scrollToBottom")}
						icon={<Icon name="arrow-bottom" />}
						tabIndex={-1}
						className={[
							styles.scrollToBottomButton,
							showExecutionStatusPanel
								? styles.scrollToBottomButtonAboveExecutionStatus
								: "",
							styles.scrollToBottomButtonHidden,
						]
							.filter(Boolean)
							.join(" ")}
						onClick={scrollMessageListToBottom}
					/>
				) : null}
				{!isHome && pendingApproval !== null ? (
					<ApprovalDialog
						pendingApproval={pendingApproval}
						isApproving={isApproving}
						isApprovalAutoSafeEnabling={isApprovalAutoSafeEnabling}
						isRejecting={isRejecting}
						errorMessage={approvalError}
						onApprove={onApprovalApprove}
						onApproveAndEnableAutoSafe={
							onApprovalApproveAndEnableAutoSafe
						}
						onReject={onApprovalReject}
					/>
				) : !isHome && pendingToolBudget !== null ? (
					<ToolBudgetDialog
						pendingToolBudget={pendingToolBudget}
						isContinuing={isToolBudgetContinuing}
						isStopping={isToolBudgetStopping}
						isCancelling={isCancelling}
						errorMessage={toolBudgetError}
						onContinue={onToolBudgetContinue}
						onStop={onToolBudgetStop}
						onCancel={onCancel}
					/>
				) : !isHome && pendingPlanClarification !== null ? (
					<ClarificationDialog
						planId={pendingPlanClarification.planId}
						title={pendingPlanClarification.title}
						question={pendingPlanClarification.question}
						recommendedReplies={
							pendingPlanClarification.recommendedReplies
						}
						isSubmitting={isPlanClarificationSubmitting}
						errorMessage={planClarificationError}
						onSubmit={onPlanClarificationSubmit}
						onSkip={onPlanClarificationSkip}
					/>
				) : !isHome && pendingPlanApproval !== null ? (
					<PlanApprovalDialog
						plan={pendingPlanApproval}
						isApproving={isPlanApproving}
						isRevising={isPlanRevising}
						errorMessage={planApprovalError}
						onApprove={onPlanApprove}
						onRevise={onPlanRevise}
					/>
				) : (
					<>
						{showExecutionStatusPanel ? executionStatusPanel : null}
						{!isHome ? (
							<MessageQueuePanel
								messageQueue={messageQueue}
								pendingGuides={pendingGuides}
								activeQueueItemId={activeQueueItemId}
								onQueueRemove={onQueueMessageRemove}
								onQueueEdit={onQueueMessageEdit}
								onQueueReorder={onQueueMessageReorder}
								onGuideDelete={onGuideDelete}
								onGuideReorder={onGuideReorder}
							/>
						) : null}
						{isDockFullscreen ? null : renderComposer(false)}
					</>
				)}
			</footer>
		</section>
	);
}

export default HomeChatSurface;
