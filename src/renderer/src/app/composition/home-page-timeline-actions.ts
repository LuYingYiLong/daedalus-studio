import type { HomePageActionHandlers } from "./home-page-actions";

export type HomePageTimelineActionParams = {
	handleLoadMoreBefore: HomePageActionHandlers["onLoadMoreBefore"];
	handleLoadMoreAfter: HomePageActionHandlers["onLoadMoreAfter"];
	handleTimelineNavigationLoadEntry: HomePageActionHandlers["onTimelineNavigationLoadEntry"];
	handleTimelineSearchLoadOffset: HomePageActionHandlers["onTimelineSearchLoadOffset"];
	handleRetryFromUserMessage: HomePageActionHandlers["onRetryFromUserMessage"];
	handlePlanClarificationSubmit: (
		reply?: string,
		skip?: boolean,
	) => Promise<void>;
	handlePlanApprove: HomePageActionHandlers["onPlanApprove"];
	handlePlanRevise: HomePageActionHandlers["onPlanRevise"];
	handleWorkflowTodoDismiss: HomePageActionHandlers["onWorkflowTodoDismiss"];
	applyCurrentGoalSnapshot: HomePageActionHandlers["onGoalChange"];
	handleTerminalGoalDismiss: HomePageActionHandlers["onGoalDismiss"];
	handleCompletionOpen: HomePageActionHandlers["onCompletionOpen"];
};

export type HomePageTimelineActions = Pick<
	HomePageActionHandlers,
	| "onLoadMoreBefore"
	| "onLoadMoreAfter"
	| "onTimelineNavigationLoadEntry"
	| "onTimelineSearchLoadOffset"
	| "onRetryFromUserMessage"
	| "onPlanClarificationSubmit"
	| "onPlanClarificationSkip"
	| "onPlanApprove"
	| "onPlanRevise"
	| "onWorkflowTodoDismiss"
	| "onGoalChange"
	| "onGoalDismiss"
	| "onCompletionOpen"
>;

export function createHomePageTimelineActions({
	handleLoadMoreBefore,
	handleLoadMoreAfter,
	handleTimelineNavigationLoadEntry,
	handleTimelineSearchLoadOffset,
	handleRetryFromUserMessage,
	handlePlanClarificationSubmit,
	handlePlanApprove,
	handlePlanRevise,
	handleWorkflowTodoDismiss,
	applyCurrentGoalSnapshot,
	handleTerminalGoalDismiss,
	handleCompletionOpen,
}: HomePageTimelineActionParams): HomePageTimelineActions {
	return {
		onLoadMoreBefore: handleLoadMoreBefore,
		onLoadMoreAfter: handleLoadMoreAfter,
		onTimelineNavigationLoadEntry: handleTimelineNavigationLoadEntry,
		onTimelineSearchLoadOffset: handleTimelineSearchLoadOffset,
		onRetryFromUserMessage: handleRetryFromUserMessage,
		onPlanClarificationSubmit: (reply): void => {
			void handlePlanClarificationSubmit(reply);
		},
		onPlanClarificationSkip: (): void => {
			void handlePlanClarificationSubmit(undefined, true);
		},
		onPlanApprove: handlePlanApprove,
		onPlanRevise: handlePlanRevise,
		onWorkflowTodoDismiss: (snapshot): void => {
			void handleWorkflowTodoDismiss(snapshot);
		},
		onGoalChange: applyCurrentGoalSnapshot,
		onGoalDismiss: handleTerminalGoalDismiss,
		onCompletionOpen: handleCompletionOpen,
	};
}
