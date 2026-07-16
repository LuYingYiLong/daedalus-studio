import { useEffect, useMemo, useState } from "react";
import { Button, Divider, Dropdown, message as antdMessage, Space, Typography } from "antd";
import type { MenuProps } from "antd";
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
import { Icon } from "@/assets/icons";

type WorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash";

type WorkspaceLaunchTarget = {
	id: WorkspaceLaunchTargetId;
	label: string;
};

const FALLBACK_WORKSPACE_LAUNCH_TARGETS: WorkspaceLaunchTarget[] = [
	{ id: "file-explorer", label: "File Explorer" },
	{ id: "terminal", label: "Terminal" }
];

function isWorkspaceLaunchTargetId(value: string): value is WorkspaceLaunchTargetId {
	return value === "file-explorer"
		|| value === "terminal"
		|| value === "vscode"
		|| value === "visual-studio"
		|| value === "github-desktop"
		|| value === "git-bash";
}

function getWorkspaceLaunchIcon(targetId: WorkspaceLaunchTargetId): React.ReactNode {
	if (targetId === "file-explorer") {
		return <Icon name="folder" />;
	}
	if (targetId === "terminal" || targetId === "git-bash") {
		return <Icon name="terminal" />;
	}
	return <Icon name="external_link" />;
}

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
	workflowTodoCollapsed: boolean;
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
	onAddContextFiles: (files: File[]) => void;
	onRemoveContext: (contextId: string) => void;
	onPinContext: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext: () => void;
	onCancel: () => void;
	onSubmit: (message: string) => void;
	onWorkflowTodoDismiss: (snapshot: WorkflowTodoSnapshot) => void;
	onWorkflowTodoCollapseChange: (collapsed: boolean) => void;
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
	workflowTodoCollapsed,
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
	onAddContextFiles,
	onRemoveContext,
	onPinContext,
	onClearUnpinnedContext,
	onCancel,
	onSubmit,
	onWorkflowTodoDismiss,
	onWorkflowTodoCollapseChange,
	onCompletionOpen
}: AgentPageProps): React.JSX.Element {
	const [workspaceLaunchTargets, setWorkspaceLaunchTargets] = useState<WorkspaceLaunchTarget[]>(FALLBACK_WORKSPACE_LAUNCH_TARGETS);
	const [selectedLaunchTargetId, setSelectedLaunchTargetId] = useState<WorkspaceLaunchTargetId>("file-explorer");
	const [isOpeningLaunchTarget, setIsOpeningLaunchTarget] = useState<boolean>(false);
	const showWorkspaceLaunchControls: boolean = !isHome && activeWorkspace !== null;
	const selectedLaunchTarget: WorkspaceLaunchTarget = useMemo((): WorkspaceLaunchTarget => {
		return workspaceLaunchTargets.find((target: WorkspaceLaunchTarget): boolean => target.id === selectedLaunchTargetId)
			?? workspaceLaunchTargets[0]
			?? FALLBACK_WORKSPACE_LAUNCH_TARGETS[0]!;
	}, [selectedLaunchTargetId, workspaceLaunchTargets]);
	const workspaceLaunchMenuItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return workspaceLaunchTargets.map((target: WorkspaceLaunchTarget) => {
			return {
				key: target.id,
				label: target.label,
				icon: getWorkspaceLaunchIcon(target.id)
			};
		});
	}, [workspaceLaunchTargets]);

	useEffect((): (() => void) | void => {
		if (!showWorkspaceLaunchControls) {
			return;
		}

		let cancelled: boolean = false;
		window.electronAPI.workspaceFs.listLaunchTargets()
			.then((targets: WorkspaceLaunchTarget[]): void => {
				if (cancelled) {
					return;
				}

				const nextTargets: WorkspaceLaunchTarget[] = targets.length > 0 ? targets : FALLBACK_WORKSPACE_LAUNCH_TARGETS;
				setWorkspaceLaunchTargets(nextTargets);
				setSelectedLaunchTargetId((currentTargetId: WorkspaceLaunchTargetId): WorkspaceLaunchTargetId => {
					if (nextTargets.some((target: WorkspaceLaunchTarget): boolean => target.id === currentTargetId)) {
						return currentTargetId;
					}
					return nextTargets.find((target: WorkspaceLaunchTarget): boolean => target.id === "vscode")?.id
						?? nextTargets[0]?.id
						?? "file-explorer";
				});
			})
			.catch((error: unknown): void => {
				console.error("[AgentPage] failed to list workspace launch targets", error);
				if (!cancelled) {
					setWorkspaceLaunchTargets(FALLBACK_WORKSPACE_LAUNCH_TARGETS);
					setSelectedLaunchTargetId("file-explorer");
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [showWorkspaceLaunchControls]);

	async function openWorkspaceLaunchTarget(targetId: WorkspaceLaunchTargetId): Promise<void> {
		if (activeWorkspace === null) {
			return;
		}

		setSelectedLaunchTargetId(targetId);
		setIsOpeningLaunchTarget(true);
		try {
			await window.electronAPI.workspaceFs.openLaunchTarget({
				workspaceRoot: activeWorkspace.rootPath,
				targetId
			});
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to open workspace.";
			console.error("[AgentPage] failed to open workspace launch target", error);
			void antdMessage.error(message);
		} finally {
			setIsOpeningLaunchTarget(false);
		}
	}

	const handleWorkspaceLaunchMenuClick: MenuProps["onClick"] = ({ key }): void => {
		const targetId: string = String(key);
		if (!isWorkspaceLaunchTargetId(targetId)) {
			return;
		}

		void openWorkspaceLaunchTarget(targetId);
	};

	function handlePageDragOver(event: React.DragEvent<HTMLDivElement>): void {
		if (event.dataTransfer.types.includes("Files")) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
		}
	}

	function handlePageDrop(event: React.DragEvent<HTMLDivElement>): void {
		if (!event.dataTransfer.types.includes("Files")) {
			return;
		}

		event.preventDefault();
		const files: File[] = Array.from(event.dataTransfer.files);
		if (files.length > 0) {
			onAddContextFiles(files);
		}
	}

	return (
		<div
			className={styles.page}
			onDragOver={handlePageDragOver}
			onDrop={handlePageDrop}
		>
			<aside className={styles.workspaceSidebar}>
				<header className={styles.workspaceHeader}>
					<Button type="text" block={true} className={styles.createSessionButton} onClick={onNewSession}>
						New session
					</Button>
				</header>

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
					<Typography.Title level={5} className={styles.chatTitle}>
						{chatTitle}
					</Typography.Title>
					{showWorkspaceLaunchControls ? (
						<Space.Compact size="small" className={styles.workspaceLaunchControls}>
							<Button
								loading={isOpeningLaunchTarget}
								icon={getWorkspaceLaunchIcon(selectedLaunchTarget.id)}
								onClick={(): void => { void openWorkspaceLaunchTarget(selectedLaunchTarget.id); }}
							>
								Open in {selectedLaunchTarget.label}
							</Button>
							<Dropdown
								menu={{
									items: workspaceLaunchMenuItems,
									selectedKeys: [selectedLaunchTarget.id],
									onClick: handleWorkspaceLaunchMenuClick
								}}
								trigger={["click"]}
							>
								<Button
									aria-label="Select workspace launch target"
									icon={<Icon name="arrow-drop-down" />}
								/>
							</Dropdown>
						</Space.Compact>
					) : null}
				</header>

				<Divider size="small"/>

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

				<footer className={`${styles.composer} ${workflowTodoSnapshot === null ? "" : styles.composerWithTodo}`}>
					<Composer
						providerModelSelection={providerModelSelection}
						selectedProviderId={selectedProviderId}
						selectedModelId={selectedModelId}
						message={message}
						contextItems={contextItems}
						workflowTodoSnapshot={workflowTodoSnapshot}
						workflowTodoCollapsed={workflowTodoCollapsed}
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
						showContextUsage={!isHome}
						onMessageChange={onMessageChange}
						onModeChange={onModeChange}
						onApprovalModeChange={onApprovalModeChange}
						onProviderModelChange={onProviderModelChange}
						onAddFiles={onAddFiles}
						onAddFolder={onAddFolder}
						onAddImages={onAddImages}
						onAddContextFiles={onAddContextFiles}
						onWorkspaceSelect={onHomeWorkspaceSelect}
						onWorkspaceAdd={onHomeWorkspaceAdd}
						onWorkspaceClear={onHomeWorkspaceClear}
						onRemoveContext={onRemoveContext}
						onPinContext={onPinContext}
						onClearUnpinnedContext={onClearUnpinnedContext}
						onCancel={onCancel}
						onSubmit={onSubmit}
						onWorkflowTodoDismiss={onWorkflowTodoDismiss}
						onWorkflowTodoCollapseChange={onWorkflowTodoCollapseChange}
						onCompletionOpen={onCompletionOpen}
					/>
				</footer>
			</section>
		</div>
	);
}

export default AgentPage;
