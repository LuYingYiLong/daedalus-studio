import { Button, Divider, Typography } from "antd";
import type { AdditionalContextItem, SessionMetadata, TimelineBlock, WorkflowTodoSnapshot, WorkspaceConfig } from "@/api/types";
import type { ChatMode } from "@/api/chat-api";
import type { ApprovalMode } from "@/api/approval-api";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { ProviderModelSelection } from "@/api/provider-api";
import type { DeleteWorkspaceResult } from "@/api/workspace-api";
import type { SkillSummary } from "@/api/skill-api";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";
import MessageList from "@/features/chat/MessageList";
import Composer from "@/features/composer/Composer";
import type { ComposerCompletionTrigger } from "@/features/composer/composer-completion";
import type { RetryUserMessagePayload } from "@/features/bubble/UserBubble";
import styles from "./AgentPage.module.css";

type AgentPageProps = {
	workspaceRefreshToken: number;
	isHome: boolean;
	activeSessionId: string | null;
	activeSessionMetadata: SessionMetadata | null;
	activeWorkspaceId: string | null;
	chatTitle: string;
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
	workflowTodoSnapshot: WorkflowTodoSnapshot | null;
	mode: ChatMode;
	approvalMode: ApprovalMode;
	slashCommands: SlashCommandDefinition[];
	skills: SkillSummary[];
	isSending: boolean;
	isApprovalModeSaving: boolean;
	workspaceOptions: WorkspaceConfig[];
	homeWorkspace: WorkspaceConfig | null;
	workspaceFooterDisabled: boolean;
	isWorkspaceAdding: boolean;
	activeWorkspace: WorkspaceConfig | null;
	onNewSession: () => void;
	onWorkspaceRefresh: () => void;
	onWorkspaceSelect: (workspaceId: string) => void;
	onHomeWorkspaceSelect: (workspaceId: string) => void;
	onHomeWorkspaceAdd: () => void;
	onHomeWorkspaceClear: () => void;
	onSessionSelect: (session: SessionMetadata) => void;
	onSessionArchive: (session: SessionMetadata) => void;
	onWorkspaceDelete: (result: DeleteWorkspaceResult) => void;
	onLoadMoreBefore: () => void;
	onLoadMoreAfter: () => void;
	onRetryEditStart: (requestId: string) => void;
	onRetryEditCancel: (requestId: string) => void;
	onRetryFromUserMessage: (payload: RetryUserMessagePayload) => Promise<boolean>;
	onMessageChange: (message: string) => void;
	onModeChange: (mode: ChatMode) => void;
	onApprovalModeChange: (mode: ApprovalMode) => void;
	onProviderModelChange: (providerId: string, modelId: string) => void;
	onAddFiles: () => void;
	onAddFolder: () => void;
	onAddImages: (files: File[]) => void;
	onRemoveContext: (contextId: string) => void;
	onPinContext: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext: () => void;
	onCancel: () => void;
	onSubmit: (message: string) => void;
	onCompletionOpen: (trigger: ComposerCompletionTrigger) => void;
};

function AgentPage({
	workspaceRefreshToken,
	isHome,
	activeSessionId,
	activeSessionMetadata,
	activeWorkspaceId,
	chatTitle,
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
	workflowTodoSnapshot,
	mode,
	approvalMode,
	slashCommands,
	skills,
	isSending,
	isApprovalModeSaving,
	workspaceOptions,
	homeWorkspace,
	workspaceFooterDisabled,
	isWorkspaceAdding,
	activeWorkspace,
	onNewSession,
	onWorkspaceRefresh,
	onWorkspaceSelect,
	onHomeWorkspaceSelect,
	onHomeWorkspaceAdd,
	onHomeWorkspaceClear,
	onSessionSelect,
	onSessionArchive,
	onWorkspaceDelete,
	onLoadMoreBefore,
	onLoadMoreAfter,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage,
	onMessageChange,
	onModeChange,
	onApprovalModeChange,
	onProviderModelChange,
	onAddFiles,
	onAddFolder,
	onAddImages,
	onRemoveContext,
	onPinContext,
	onClearUnpinnedContext,
	onCancel,
	onSubmit,
	onCompletionOpen
}: AgentPageProps): React.JSX.Element {
	return (
		<div className={styles.page}>
			<aside className={styles.workspaceSidebar}>
				<header className={styles.workspaceHeader}>
					<Button type="text" block={true} className={styles.createSessionButton} onClick={onNewSession}>
						New session
					</Button>
				</header>

				<Divider size="small" />

				<WorkspaceTree
					refreshToken={workspaceRefreshToken}
					selectedSessionId={activeSessionId}
					selectedWorkspaceId={activeWorkspaceId}
					sessionUpdate={activeSessionMetadata}
					onWorkspaceSelect={onWorkspaceSelect}
					onSessionSelect={onSessionSelect}
					onSessionArchive={onSessionArchive}
					onWorkspaceDelete={onWorkspaceDelete}
				/>

			</aside>

			<Divider vertical size="small"/>

			<section className={styles.chatPanel}>
				<header className={styles.chatHeader}>
					<Typography.Title level={4} className={styles.chatTitle}>
						{chatTitle}
					</Typography.Title>
				</header>

				{isHome ? (
					<div className={styles.homePanel}>
						<div className={styles.homeContent}>
							<Typography.Title level={1} className={styles.homeTitle}>
								Hi, how can I help with your Godot project?
							</Typography.Title>
							<Typography.Text className={styles.homeSubtitle}>
								Choose a workspace or start without one.
							</Typography.Text>
							{sessionError !== null ? (
								<Typography.Text type="danger" className={styles.homeError}>
									{sessionError}
								</Typography.Text>
							) : null}
						</div>
					</div>
				) : (
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
				)}

				<footer className={styles.composer}>
					<Composer
						providerModelSelection={providerModelSelection}
						selectedProviderId={selectedProviderId}
						selectedModelId={selectedModelId}
						message={message}
						contextItems={contextItems}
						workflowTodoSnapshot={workflowTodoSnapshot}
						mode={mode}
						approvalMode={approvalMode}
						slashCommands={slashCommands}
						skills={skills}
						isSending={isSending}
						isApprovalModeSaving={isApprovalModeSaving}
						workspaceOptions={workspaceOptions}
						selectedWorkspace={isHome ? homeWorkspace : activeWorkspace}
						workspaceFooterDisabled={workspaceFooterDisabled}
						isWorkspaceAdding={isWorkspaceAdding}
						onMessageChange={onMessageChange}
						onModeChange={onModeChange}
						onApprovalModeChange={onApprovalModeChange}
						onProviderModelChange={onProviderModelChange}
						onAddFiles={onAddFiles}
						onAddFolder={onAddFolder}
						onAddImages={onAddImages}
						onWorkspaceSelect={onHomeWorkspaceSelect}
						onWorkspaceAdd={onHomeWorkspaceAdd}
						onWorkspaceClear={onHomeWorkspaceClear}
						onRemoveContext={onRemoveContext}
						onPinContext={onPinContext}
						onClearUnpinnedContext={onClearUnpinnedContext}
						onCancel={onCancel}
						onSubmit={onSubmit}
						onCompletionOpen={onCompletionOpen}
					/>
				</footer>
			</section>
		</div>
	);
}

export default AgentPage;
