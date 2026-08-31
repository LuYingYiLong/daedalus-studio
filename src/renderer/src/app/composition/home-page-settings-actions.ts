import type { HomePageActionHandlers } from "./home-page-actions";

export type HomePageSettingsActionParams = {
	handleModeChange: HomePageActionHandlers["onModeChange"];
	handleApprovalModeChange: HomePageActionHandlers["onApprovalModeChange"];
	handleApprovalApprove: HomePageActionHandlers["onApprovalApprove"];
	handleApprovalApproveAndEnableAutoSafe: HomePageActionHandlers["onApprovalApproveAndEnableAutoSafe"];
	handleApprovalReject: HomePageActionHandlers["onApprovalReject"];
	handleToolBudgetContinue: HomePageActionHandlers["onToolBudgetContinue"];
	handleToolBudgetStop: HomePageActionHandlers["onToolBudgetStop"];
	handleProviderModelChange: HomePageActionHandlers["onProviderModelChange"];
	handleReasoningEffortChange: HomePageActionHandlers["onReasoningEffortChange"];
	handleWorkspaceLaunchChange: HomePageActionHandlers["onWorkspaceLaunchChange"];
	handleAddPastedTextAttachment: HomePageActionHandlers["onAddPastedTextAttachment"];
};

export type HomePageSettingsActions = Pick<
	HomePageActionHandlers,
	| "onModeChange"
	| "onApprovalModeChange"
	| "onApprovalApprove"
	| "onApprovalApproveAndEnableAutoSafe"
	| "onApprovalReject"
	| "onToolBudgetContinue"
	| "onToolBudgetStop"
	| "onProviderModelChange"
	| "onReasoningEffortChange"
	| "onWorkspaceLaunchChange"
	| "onAddPastedTextAttachment"
>;

export function createHomePageSettingsActions({
	handleModeChange,
	handleApprovalModeChange,
	handleApprovalApprove,
	handleApprovalApproveAndEnableAutoSafe,
	handleApprovalReject,
	handleToolBudgetContinue,
	handleToolBudgetStop,
	handleProviderModelChange,
	handleReasoningEffortChange,
	handleWorkspaceLaunchChange,
	handleAddPastedTextAttachment,
}: HomePageSettingsActionParams): HomePageSettingsActions {
	return {
		onModeChange: handleModeChange,
		onApprovalModeChange: handleApprovalModeChange,
		onApprovalApprove: handleApprovalApprove,
		onApprovalApproveAndEnableAutoSafe: handleApprovalApproveAndEnableAutoSafe,
		onApprovalReject: handleApprovalReject,
		onToolBudgetContinue: handleToolBudgetContinue,
		onToolBudgetStop: handleToolBudgetStop,
		onProviderModelChange: handleProviderModelChange,
		onReasoningEffortChange: handleReasoningEffortChange,
		onWorkspaceLaunchChange: handleWorkspaceLaunchChange,
		onAddPastedTextAttachment: handleAddPastedTextAttachment,
	};
}
