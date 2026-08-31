import type { ComponentProps } from "react";
import type HomePage from "@/widgets/home/HomePage";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { SessionLayoutPreferences } from "@/domain/session/session-layout";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";

export type HomePageProps = ComponentProps<typeof HomePage>;

export type HomePageLayoutProps = Pick<
	HomePageProps,
	| "workspaceRefreshToken"
	| "isHome"
	| "activeSessionId"
	| "workspaceSidebar"
	| "keyboardShortcuts"
	| "onWorkspaceSidebarChange"
	| "sessionLayout"
	| "onSessionLayoutChange"
	| "activeSessionMetadata"
	| "activeWorkspaceId"
	| "chatTitle"
	| "timelineStore"
	| "timelineNavigationEntries"
	| "isSessionLoading"
	| "sessionError"
	| "isLoadingMoreBefore"
	| "isLoadingMoreAfter"
	| "retryDisabled"
	| "activeRetryRequestId"
>;

export type HomePageComposerProps = Pick<
	HomePageProps,
	| "providerModelSelection"
	| "selectedProviderId"
	| "selectedModelId"
	| "reasoningEffort"
	| "composerInstanceKey"
	| "message"
	| "nextStepSuggestion"
	| "onDraftChange"
	| "contextItems"
	| "selectionAskThreads"
	| "messageQueue"
	| "pendingGuides"
	| "workflowTodoSnapshot"
	| "currentGoal"
	| "workflowTodoCollapsed"
	| "mode"
	| "approvalMode"
	| "pendingApproval"
	| "isApproving"
	| "isApprovalAutoSafeEnabling"
	| "isRejecting"
	| "approvalError"
	| "pendingToolBudget"
	| "isToolBudgetContinuing"
	| "isToolBudgetStopping"
	| "toolBudgetError"
	| "pendingPlanClarification"
	| "isPlanClarificationSubmitting"
	| "planClarificationError"
	| "pendingPlanApproval"
	| "isPlanApproving"
	| "isPlanRevising"
	| "planApprovalError"
	| "slashCommands"
	| "skills"
	| "isSending"
	| "isCancelling"
	| "isAddingTextAttachment"
	| "isApprovalModeSaving"
	| "activeQueueItemId"
>;

export type HomePageWorkspaceProps = Pick<
	HomePageProps,
	| "workspaceOptions"
	| "initialWorkspaces"
	| "initialSessions"
	| "initialActiveWorkspaceId"
	| "initialWorkspaceTreeOrder"
	| "runningSessionIds"
	| "unreadSessionIds"
	| "forkingSessionId"
	| "forkingRequestId"
	| "forkDisabled"
	| "homeWorkspace"
	| "homeExecutionEnvironment"
	| "homeWorktreeSources"
	| "worktreeDisabledReason"
	| "isWorktreePreparing"
	| "workspaceFooterDisabled"
	| "activeWorkspace"
	| "godotLaunchExecutablePath"
	| "workspaceLaunchPreference"
>;

export type HomePageActionProps = Omit<
	HomePageProps,
	keyof HomePageLayoutProps | keyof HomePageComposerProps | keyof HomePageWorkspaceProps
>;

export type HomePageViewModelParams = {
	layout: HomePageLayoutProps;
	composer: HomePageComposerProps;
	workspace: HomePageWorkspaceProps;
	actions: HomePageActionProps;
};

export type HomePageRuntimeLayoutParams = {
	workspaceRefreshToken: number;
	isNewSessionHome: boolean;
	activeSessionId: HomePageProps["activeSessionId"];
	clientPreferences: Pick<
		ClientPreferences,
		"workspaceSidebar" | "keyboardShortcuts"
	>;
	onWorkspaceSidebarChange: HomePageProps["onWorkspaceSidebarChange"];
	activeSessionLayout: SessionLayoutPreferences;
	onSessionLayoutChange: HomePageProps["onSessionLayoutChange"];
	activeSessionMetadata: SessionMetadata | null;
	homeWorkspaceId: HomePageProps["activeWorkspaceId"];
	currentSessionWorkspaceId: HomePageProps["activeWorkspaceId"];
	chatTitle: HomePageProps["chatTitle"];
	timelineStore: TimelinePageStore;
	timelineNavigationEntries: HomePageProps["timelineNavigationEntries"];
	isSessionLoading: boolean;
	sessionError: HomePageProps["sessionError"];
	isLoadingMoreBefore: boolean;
	isLoadingMoreAfter: boolean;
	isSending: boolean;
	activeRetryRequestId: HomePageProps["activeRetryRequestId"];
};

export type HomePageRuntimeComposerParams = {
	providerModelSelection: HomePageProps["providerModelSelection"];
	selectedProviderId: HomePageProps["selectedProviderId"];
	selectedModelId: HomePageProps["selectedModelId"];
	reasoningEffort: HomePageProps["reasoningEffort"];
	composerInstanceKey: HomePageProps["composerInstanceKey"];
	message: HomePageProps["message"];
	nextStepSuggestion: HomePageProps["nextStepSuggestion"];
	onDraftChange: HomePageProps["onDraftChange"];
	contextItems: HomePageProps["contextItems"];
	selectionAskThreads: HomePageProps["selectionAskThreads"];
	messageQueue: HomePageProps["messageQueue"];
	pendingGuides: HomePageProps["pendingGuides"];
	workflowTodoSnapshot: HomePageProps["workflowTodoSnapshot"];
	currentGoal: HomePageProps["currentGoal"];
	activeSessionMetadata: SessionMetadata | null;
	mode: HomePageProps["mode"];
	approvalMode: HomePageProps["approvalMode"];
	pendingApproval: HomePageProps["pendingApproval"];
	isApproving: HomePageProps["isApproving"];
	isApprovalAutoSafeEnabling: HomePageProps["isApprovalAutoSafeEnabling"];
	isRejecting: HomePageProps["isRejecting"];
	approvalError: HomePageProps["approvalError"];
	pendingToolBudget: HomePageProps["pendingToolBudget"];
	isToolBudgetContinuing: HomePageProps["isToolBudgetContinuing"];
	isToolBudgetStopping: HomePageProps["isToolBudgetStopping"];
	toolBudgetError: HomePageProps["toolBudgetError"];
	pendingPlanClarification: HomePageProps["pendingPlanClarification"];
	isPlanClarificationSubmitting: HomePageProps["isPlanClarificationSubmitting"];
	planClarificationError: HomePageProps["planClarificationError"];
	pendingPlanApproval: HomePageProps["pendingPlanApproval"];
	isPlanApproving: HomePageProps["isPlanApproving"];
	isPlanRevising: HomePageProps["isPlanRevising"];
	planApprovalError: HomePageProps["planApprovalError"];
	slashCommands: HomePageProps["slashCommands"];
	skills: HomePageProps["skills"];
	isSending: boolean;
	isCancelling: HomePageProps["isCancelling"];
	isAddingTextAttachment: HomePageProps["isAddingTextAttachment"];
	isApprovalModeSaving: HomePageProps["isApprovalModeSaving"];
	activeQueueItemId: HomePageProps["activeQueueItemId"];
};

export type HomePageRuntimeWorkspaceParams = {
	workspaceOptions: HomePageProps["workspaceOptions"];
	initialWorkspaces: WorkspaceConfig[];
	initialSessions: HomePageProps["initialSessions"];
	initialActiveWorkspaceId: HomePageProps["initialActiveWorkspaceId"];
	initialWorkspaceTreeOrder: HomePageProps["initialWorkspaceTreeOrder"];
	runningSessionIds: HomePageProps["runningSessionIds"];
	unreadSessionIds: ReadonlySet<string>;
	forkingSessionId: HomePageProps["forkingSessionId"];
	forkingRequestId: HomePageProps["forkingRequestId"];
	isSending: boolean;
	isSessionLoading: boolean;
	hasForkingSession: boolean;
	homeWorkspace: HomePageProps["homeWorkspace"];
	homeExecutionEnvironment: HomePageProps["homeExecutionEnvironment"];
	homeWorktreeSources: HomePageProps["homeWorktreeSources"];
	worktreeDisabledReason: HomePageProps["worktreeDisabledReason"];
	isWorktreePreparing: HomePageProps["isWorktreePreparing"];
	isHomeSubmitting: boolean;
	composerWorkspaceLocked: boolean;
	activeWorkspace: HomePageProps["activeWorkspace"];
	godotLaunchExecutablePath: HomePageProps["godotLaunchExecutablePath"];
	activeSessionId: HomePageProps["activeSessionId"];
	activeSessionMetadata: SessionMetadata | null;
	homeWorkspaceLaunchPreference: HomePageProps["workspaceLaunchPreference"];
	defaultWorkspaceLaunchPreference: HomePageProps["workspaceLaunchPreference"];
};

export type HomePageRuntimeViewModelParams = {
	layout: HomePageRuntimeLayoutParams;
	composer: HomePageRuntimeComposerParams;
	workspace: HomePageRuntimeWorkspaceParams;
	actions: HomePageActionProps;
};

export function createHomePageViewModel({
	layout,
	composer,
	workspace,
	actions,
}: HomePageViewModelParams): HomePageProps {
	return {
		...layout,
		...composer,
		...workspace,
		...actions,
	};
}

export function createHomePageViewModelFromRuntime({
	layout,
	composer,
	workspace,
	actions,
}: HomePageRuntimeViewModelParams): HomePageProps {
	return createHomePageViewModel({
		layout: {
			workspaceRefreshToken: layout.workspaceRefreshToken,
			isHome: layout.isNewSessionHome,
			activeSessionId: layout.activeSessionId,
			workspaceSidebar: layout.clientPreferences.workspaceSidebar,
			keyboardShortcuts: layout.clientPreferences.keyboardShortcuts,
			onWorkspaceSidebarChange: layout.onWorkspaceSidebarChange,
			sessionLayout: layout.activeSessionLayout,
			onSessionLayoutChange: layout.onSessionLayoutChange,
			activeSessionMetadata: layout.activeSessionMetadata,
			activeWorkspaceId:
				layout.activeSessionId === null
					? layout.homeWorkspaceId
					: layout.currentSessionWorkspaceId,
			chatTitle: layout.chatTitle,
			timelineStore: layout.timelineStore,
			timelineNavigationEntries: layout.timelineNavigationEntries,
			isSessionLoading: layout.isSessionLoading,
			sessionError: layout.sessionError,
			isLoadingMoreBefore: layout.isLoadingMoreBefore,
			isLoadingMoreAfter: layout.isLoadingMoreAfter,
			retryDisabled: layout.isSending || layout.isSessionLoading,
			activeRetryRequestId: layout.activeRetryRequestId,
		},
		composer: {
			providerModelSelection: composer.providerModelSelection,
			selectedProviderId: composer.selectedProviderId,
			selectedModelId: composer.selectedModelId,
			reasoningEffort: composer.reasoningEffort,
			composerInstanceKey: composer.composerInstanceKey,
			message: composer.message,
			nextStepSuggestion: composer.nextStepSuggestion,
			onDraftChange: composer.onDraftChange,
			contextItems: composer.contextItems,
			selectionAskThreads: composer.selectionAskThreads,
			messageQueue: composer.messageQueue,
			pendingGuides: composer.pendingGuides,
			workflowTodoSnapshot: composer.workflowTodoSnapshot,
			currentGoal: composer.currentGoal,
			workflowTodoCollapsed:
				composer.activeSessionMetadata?.workflowTodoCollapsed === true,
			mode: composer.mode,
			approvalMode: composer.approvalMode,
			pendingApproval: composer.pendingApproval,
			isApproving: composer.isApproving,
			isApprovalAutoSafeEnabling: composer.isApprovalAutoSafeEnabling,
			isRejecting: composer.isRejecting,
			approvalError: composer.approvalError,
			pendingToolBudget: composer.pendingToolBudget,
			isToolBudgetContinuing: composer.isToolBudgetContinuing,
			isToolBudgetStopping: composer.isToolBudgetStopping,
			toolBudgetError: composer.toolBudgetError,
			pendingPlanClarification: composer.pendingPlanClarification,
			isPlanClarificationSubmitting: composer.isPlanClarificationSubmitting,
			planClarificationError: composer.planClarificationError,
			pendingPlanApproval: composer.pendingPlanApproval,
			isPlanApproving: composer.isPlanApproving,
			isPlanRevising: composer.isPlanRevising,
			planApprovalError: composer.planApprovalError,
			slashCommands: composer.slashCommands,
			skills: composer.skills,
			isSending: composer.isSending,
			isCancelling: composer.isCancelling,
			isAddingTextAttachment: composer.isAddingTextAttachment,
			isApprovalModeSaving: composer.isApprovalModeSaving,
			activeQueueItemId: composer.activeQueueItemId,
		},
		workspace: {
			workspaceOptions: workspace.workspaceOptions,
			initialWorkspaces: workspace.initialWorkspaces,
			initialSessions: workspace.initialSessions,
			initialActiveWorkspaceId: workspace.initialActiveWorkspaceId,
			initialWorkspaceTreeOrder: workspace.initialWorkspaceTreeOrder,
			runningSessionIds: workspace.runningSessionIds,
			unreadSessionIds: [...workspace.unreadSessionIds],
			forkingSessionId: workspace.forkingSessionId,
			forkingRequestId: workspace.forkingRequestId,
			forkDisabled:
				workspace.isSending ||
				workspace.isSessionLoading ||
				workspace.hasForkingSession,
			homeWorkspace: workspace.homeWorkspace,
			homeExecutionEnvironment: workspace.homeExecutionEnvironment,
			homeWorktreeSources: workspace.homeWorktreeSources,
			worktreeDisabledReason: workspace.worktreeDisabledReason,
			isWorktreePreparing: workspace.isWorktreePreparing,
			workspaceFooterDisabled:
				workspace.isHomeSubmitting ||
				workspace.isWorktreePreparing ||
				workspace.composerWorkspaceLocked ||
				workspace.isSessionLoading,
			activeWorkspace: workspace.activeWorkspace,
			godotLaunchExecutablePath: workspace.godotLaunchExecutablePath,
			workspaceLaunchPreference:
				workspace.activeSessionId === null
					? workspace.homeWorkspaceLaunchPreference
					: (workspace.activeSessionMetadata?.workspaceLaunch ??
						workspace.defaultWorkspaceLaunchPreference),
		},
		actions,
	});
}
