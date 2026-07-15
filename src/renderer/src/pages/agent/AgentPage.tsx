import { Button, Typography } from "antd";
import { Icon } from "@/assets/icons";
import type { AdditionalContextItem, SessionMetadata, TimelineBlock, WorkbenchSnapshot, WorkspaceConfig } from "@/api/types";
import type { ChatMode } from "@/api/chat-api";
import type { ApprovalMode } from "@/api/approval-api";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { ProviderModelSelection } from "@/api/provider-api";
import type { SkillSummary } from "@/api/skill-api";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";
import MessageList from "@/features/chat/MessageList";
import Composer from "@/features/composer/Composer";
import type { ComposerCompletionTrigger } from "@/features/composer/composer-completion";
import type { RetryUserMessagePayload } from "@/features/bubble/UserBubble";
import WorkbenchPanel from "@/features/workbench/WorkbenchPanel";
import styles from "./AgentPage.module.css";

type AgentPageProps = {
	workspaceRefreshToken: number;
	chatTitle: string;
	workbenchPanelOpen: boolean;
	timelineBlocks: TimelineBlock[];
	isSessionLoading: boolean;
	sessionError: string | null;
	hasMoreBefore: boolean;
	hasMoreAfter: boolean;
	initialScrollToBottomKey: string;
	retryDisabled: boolean;
	activeRetryRequestId: string | null;
	providerModelSelection: ProviderModelSelection | null;
	selectedProviderId: string | null;
	selectedModelId: string | null;
	message: string;
	contextItems: AdditionalContextItem[];
	mode: ChatMode;
	approvalMode: ApprovalMode;
	slashCommands: SlashCommandDefinition[];
	skills: SkillSummary[];
	isSending: boolean;
	isApprovalModeSaving: boolean;
	workbench: WorkbenchSnapshot | null;
	activeWorkspace: WorkspaceConfig | null;
	onWorkspaceRefresh: () => void;
	onWorkspaceSelect: (workspaceId: string) => void;
	onSessionSelect: (session: SessionMetadata) => void;
	onSessionArchive: (session: SessionMetadata) => void;
	onWorkbenchPanelOpenChange: (open: boolean) => void;
	onLoadMoreBefore: () => void;
	onLoadMoreAfter: () => void;
	onRetryEditStart: (requestId: string) => void;
	onRetryEditCancel: (requestId: string) => void;
	onRetryFromUserMessage: (payload: RetryUserMessagePayload) => Promise<boolean>;
	onMessageChange: (message: string) => void;
	onModeChange: (mode: ChatMode) => void;
	onApprovalModeChange: (mode: ApprovalMode) => void;
	onProviderModelChange: (providerId: string, modelId: string) => void;
	onRemoveContext: (contextId: string) => void;
	onPinContext: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext: () => void;
	onCancel: () => void;
	onSubmit: (message: string) => void;
	onCompletionOpen: (trigger: ComposerCompletionTrigger) => void;
	onAddContext: (item: AdditionalContextItem) => void;
	onClearHints: () => void;
	onApprove: (approvalId: string) => void;
	onReject: (approvalId: string) => void;
};

function AgentPage({
	workspaceRefreshToken,
	chatTitle,
	workbenchPanelOpen,
	timelineBlocks,
	isSessionLoading,
	sessionError,
	hasMoreBefore,
	hasMoreAfter,
	initialScrollToBottomKey,
	retryDisabled,
	activeRetryRequestId,
	providerModelSelection,
	selectedProviderId,
	selectedModelId,
	message,
	contextItems,
	mode,
	approvalMode,
	slashCommands,
	skills,
	isSending,
	isApprovalModeSaving,
	workbench,
	activeWorkspace,
	onWorkspaceRefresh,
	onWorkspaceSelect,
	onSessionSelect,
	onSessionArchive,
	onWorkbenchPanelOpenChange,
	onLoadMoreBefore,
	onLoadMoreAfter,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage,
	onMessageChange,
	onModeChange,
	onApprovalModeChange,
	onProviderModelChange,
	onRemoveContext,
	onPinContext,
	onClearUnpinnedContext,
	onCancel,
	onSubmit,
	onCompletionOpen,
	onAddContext,
	onClearHints,
	onApprove,
	onReject
}: AgentPageProps): React.JSX.Element {
	return (
		<>
			<aside className={styles.workspaceSidebar}>
				<header className={styles.workspaceHeader}>
					<Button type="text" block={true} className={styles.createSessionButton}>
						New session
					</Button>
				</header>

				<div className={styles.workspaceTitleRow}>
					<Typography.Title level={4} className={styles.workspaceTitle}>
						Workspace
					</Typography.Title>
					<Button
						className={styles.workspaceRefreshButton}
						size="small"
						type="text"
						icon={<Icon name="reload" />}
						onClick={onWorkspaceRefresh}
					/>
				</div>

				<WorkspaceTree
					refreshToken={workspaceRefreshToken}
					onWorkspaceSelect={onWorkspaceSelect}
					onSessionSelect={onSessionSelect}
					onSessionArchive={onSessionArchive}
				/>
			</aside>

			<section className={styles.chatPanel}>
				<header className={styles.chatHeader}>
					<Typography.Title level={4} className={styles.chatTitle}>
						{chatTitle}
					</Typography.Title>
					<Button
						type={workbenchPanelOpen ? "default" : "text"}
						icon={<Icon name="mcp" />}
						onClick={(): void => onWorkbenchPanelOpenChange(!workbenchPanelOpen)}
					>
						Workbench
					</Button>
				</header>

				<MessageList
					blocks={timelineBlocks}
					isLoading={isSessionLoading}
					errorMessage={sessionError}
					hasMoreBefore={hasMoreBefore}
					hasMoreAfter={hasMoreAfter}
					initialScrollToBottomKey={initialScrollToBottomKey}
					onLoadMoreBefore={onLoadMoreBefore}
					onLoadMoreAfter={onLoadMoreAfter}
					retryDisabled={retryDisabled}
					activeRetryRequestId={activeRetryRequestId}
					onRetryEditStart={onRetryEditStart}
					onRetryEditCancel={onRetryEditCancel}
					onRetryFromUserMessage={onRetryFromUserMessage}
				/>

				<footer className={styles.composer}>
					<Composer
						providerModelSelection={providerModelSelection}
						selectedProviderId={selectedProviderId}
						selectedModelId={selectedModelId}
						message={message}
						contextItems={contextItems}
						mode={mode}
						approvalMode={approvalMode}
						slashCommands={slashCommands}
						skills={skills}
						isSending={isSending}
						isApprovalModeSaving={isApprovalModeSaving}
						onMessageChange={onMessageChange}
						onModeChange={onModeChange}
						onApprovalModeChange={onApprovalModeChange}
						onProviderModelChange={onProviderModelChange}
						onRemoveContext={onRemoveContext}
						onPinContext={onPinContext}
						onClearUnpinnedContext={onClearUnpinnedContext}
						onCancel={onCancel}
						onSubmit={onSubmit}
						onCompletionOpen={onCompletionOpen}
					/>
				</footer>
			</section>

			<WorkbenchPanel
				open={workbenchPanelOpen}
				workbench={workbench}
				activeWorkspace={activeWorkspace}
				onClose={(): void => onWorkbenchPanelOpenChange(false)}
				onAddContext={onAddContext}
				onRemoveContext={onRemoveContext}
				onPinContext={onPinContext}
				onClearUnpinnedContext={onClearUnpinnedContext}
				onClearHints={onClearHints}
				onApprove={onApprove}
				onReject={onReject}
			/>
		</>
	);
}

export default AgentPage;
