import type { SessionMetadata } from "@/platform/rpc/types";
import type {
	HomePageActionProps,
	HomePageProps,
	HomePageViewModelParams,
} from "./home-page-view-model";
import {
	createHomePageComposerActions,
	type HomePageComposerActionParams,
} from "./home-page-composer-actions";
import {
	createHomePageDraftActions,
	type HomePageDraftActionParams,
} from "./home-page-draft-actions";
import {
	createHomePageWorkspaceActions,
	type HomePageWorkspaceActionParams,
} from "./home-page-workspace-actions";
import {
	createHomePageTimelineActions,
	type HomePageTimelineActionParams,
} from "./home-page-timeline-actions";
import {
	createHomePageNavigationActions,
	type HomePageNavigationActionParams,
} from "./home-page-navigation-actions";
import {
	createHomePageSettingsActions,
	type HomePageSettingsActionParams,
} from "./home-page-settings-actions";

type HomePageDirectActionKey =
	| "onNewSession"
	| "onNewWorkspaceSession"
	| "onHomeWorkspaceSelect"
	| "onHomeWorkspaceAdd"
	| "onHomeWorkspaceClear"
	| "onSessionSelect"
	| "onSessionFork"
	| "onForkSourceOpen"
	| "onSessionArchive"
	| "onSessionRename"
	| "onSessionWorkspaceMove"
	| "onSessionWorktreeDelete"
	| "onSessionWorktreeHandoff"
	| "onSessionWorktreeSetup"
	| "onSessionsChange"
	| "onWorkspaceDelete"
	| "onWorkspaceUpdate"
	| "onWorkspaceProjectCreated"
	| "onLoadMoreBefore"
	| "onLoadMoreAfter"
	| "onTimelineNavigationLoadEntry"
	| "onTimelineSearchLoadOffset"
	| "onRetryFromUserMessage"
	| "onModeChange"
	| "onApprovalModeChange"
	| "onApprovalApprove"
	| "onApprovalApproveAndEnableAutoSafe"
	| "onApprovalReject"
	| "onToolBudgetContinue"
	| "onToolBudgetStop"
	| "onPlanClarificationSubmit"
	| "onPlanClarificationSkip"
	| "onPlanApprove"
	| "onPlanRevise"
	| "onProviderModelChange"
	| "onReasoningEffortChange"
	| "onWorkspaceLaunchChange"
	| "onAddPastedTextAttachment"
	| "onWorkflowTodoDismiss"
	| "onGoalChange"
	| "onGoalDismiss"
	| "onCompletionOpen";

export type HomePageActionHandlers = Pick<
	HomePageProps,
	HomePageDirectActionKey
>;

export type HomePageDirectActionControllerParams = {
	navigation: HomePageNavigationActionParams;
	timeline: HomePageTimelineActionParams;
	settings: HomePageSettingsActionParams;
};

export function createHomePageDirectActionHandlers({
	navigation,
	timeline,
	settings,
}: HomePageDirectActionControllerParams): HomePageActionHandlers {
	return {
		...createHomePageNavigationActions(navigation),
		...createHomePageTimelineActions(timeline),
		...createHomePageSettingsActions(settings),
	};
}

export type HomePageActionAdapterParams = {
	activeSessionMetadata: SessionMetadata | null;
	worktreeDisabledReason: string | null;
	handlers: HomePageActionHandlers;
} & HomePageWorkspaceActionParams
	& HomePageComposerActionParams
	& Omit<HomePageDraftActionParams, "onNewSession">;

export function createHomePageActions({
	onAddWindowScreenshot,
	activeSessionMetadata,
	worktreeDisabledReason,
	handlers,
	setWorkspaceRefreshToken,
	setHomeDraft,
	handleSessionFork,
	handleAddWorkspaceContext,
	handleAddImageFiles,
	handleAddContextFiles,
	patchContext,
	setActiveRetryRequestId,
	handleComposerCancel,
	handleComposerSubmit,
	handleGuideSubmit,
	handleQueueMessageRemove,
	handleQueueMessageEdit,
	handleQueueMessageReorder,
	handleGuideDelete,
	handleGuideReorder,
}: HomePageActionAdapterParams): HomePageViewModelParams["actions"] {
	return {
		...handlers,
		...createHomePageDraftActions({
			onNewSession: handlers.onNewSession,
			setActiveRetryRequestId,
		}),
		...createHomePageWorkspaceActions({
			onAddWindowScreenshot,
			activeSessionMetadata,
			worktreeDisabledReason,
			setWorkspaceRefreshToken,
			setHomeDraft,
			handleSessionFork,
			handleAddWorkspaceContext,
			handleAddImageFiles,
			handleAddContextFiles,
			patchContext,
		}),
		...createHomePageComposerActions({
			handleComposerCancel,
			handleComposerSubmit,
			handleGuideSubmit,
			handleQueueMessageRemove,
			handleQueueMessageEdit,
			handleQueueMessageReorder,
			handleGuideDelete,
			handleGuideReorder,
		}),
	};
}
