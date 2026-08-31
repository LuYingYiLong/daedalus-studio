import { useEffect, type MutableRefObject } from "react";
import type { PendingApproval } from "@/platform/rpc/approval-api";
import type {
	PendingToolBudget,
	PlanApprovalState,
	PlanClarificationState,
} from "@/platform/rpc/types";

export type AppRuntimeNotificationCopy = {
	approvalTitle: string;
	toolApprovalBody: string;
	toolBudgetBody: string;
	planApprovalBody: string;
	clarificationTitle: string;
	clarificationBody: string;
};

export type AppRuntimeNotificationEffectsParams = {
	activeSessionId: string | null;
	activeSessionTitleRef: MutableRefObject<string>;
	pendingUserActionRequestIdsRef: MutableRefObject<Set<string>>;
	chatTitle: string;
	appUpdateRuntimeBusy: boolean;
	pendingApproval: PendingApproval | null;
	pendingToolBudget: PendingToolBudget | null;
	pendingPlanApproval: PlanApprovalState | null;
	pendingPlanClarification: PlanClarificationState | null;
	showNativeTaskNotification: (payload: NativeNotificationPayload) => void;
	clearNativeTaskNotificationAttention: () => void;
	notificationCopy: AppRuntimeNotificationCopy;
};

export default function useAppRuntimeNotificationEffects({
	activeSessionId,
	activeSessionTitleRef,
	pendingUserActionRequestIdsRef,
	chatTitle,
	appUpdateRuntimeBusy,
	pendingApproval,
	pendingToolBudget,
	pendingPlanApproval,
	pendingPlanClarification,
	showNativeTaskNotification,
	clearNativeTaskNotificationAttention,
	notificationCopy,
}: AppRuntimeNotificationEffectsParams): void {
	useEffect((): void => {
		void window.electronAPI.appUpdate
			.setRuntimeBusy(appUpdateRuntimeBusy)
			.catch((error: unknown): void => {
				console.warn(
					"[App] failed to publish runtime activity to update service",
					error,
				);
			});
	}, [appUpdateRuntimeBusy]);

	useEffect((): void => {
		activeSessionTitleRef.current = chatTitle;
	}, [chatTitle]);

	useEffect((): void => {
		pendingUserActionRequestIdsRef.current.clear();
		clearNativeTaskNotificationAttention();
	}, [activeSessionId, clearNativeTaskNotificationAttention]);

	useEffect((): void => {
		if (activeSessionId === null || pendingApproval === null) {
			return;
		}

		showNativeTaskNotification({
			kind: "approval_required",
			sessionId: activeSessionId,
			requestId: pendingApproval.requestId,
			title: notificationCopy.approvalTitle,
			body: notificationCopy.toolApprovalBody,
			dedupeKey: `approval_required:${activeSessionId}:tool:${pendingApproval.approvalId}`,
		});
	}, [
		activeSessionId,
		pendingApproval?.approvalId,
		pendingApproval?.requestId,
		showNativeTaskNotification,
		notificationCopy.approvalTitle,
		notificationCopy.toolApprovalBody,
	]);

	useEffect((): void => {
		if (activeSessionId === null || pendingToolBudget === null) {
			return;
		}

		showNativeTaskNotification({
			kind: "approval_required",
			sessionId: activeSessionId,
			requestId: pendingToolBudget.requestId,
			title: notificationCopy.approvalTitle,
			body: notificationCopy.toolBudgetBody,
			dedupeKey: `approval_required:${activeSessionId}:tool_budget:${pendingToolBudget.budgetId}`,
		});
	}, [
		activeSessionId,
		pendingToolBudget?.budgetId,
		pendingToolBudget?.requestId,
		showNativeTaskNotification,
		notificationCopy.approvalTitle,
		notificationCopy.toolBudgetBody,
	]);

	useEffect((): void => {
		if (activeSessionId === null || pendingPlanApproval === null) {
			return;
		}

		showNativeTaskNotification({
			kind: "approval_required",
			sessionId: activeSessionId,
			requestId: pendingPlanApproval.requestId,
			title: notificationCopy.approvalTitle,
			body: notificationCopy.planApprovalBody,
			dedupeKey: `approval_required:${activeSessionId}:plan:${pendingPlanApproval.planId}:${pendingPlanApproval.updatedAt}`,
		});
	}, [
		activeSessionId,
		pendingPlanApproval?.planId,
		pendingPlanApproval?.requestId,
		pendingPlanApproval?.updatedAt,
		showNativeTaskNotification,
		notificationCopy.approvalTitle,
		notificationCopy.planApprovalBody,
	]);

	useEffect((): void => {
		if (activeSessionId === null || pendingPlanClarification === null) {
			return;
		}

		showNativeTaskNotification({
			kind: "clarification_required",
			sessionId: activeSessionId,
			requestId: pendingPlanClarification.requestId,
			title: notificationCopy.clarificationTitle,
			body: notificationCopy.clarificationBody,
			dedupeKey: `clarification_required:${activeSessionId}:${pendingPlanClarification.planId}:${pendingPlanClarification.question}`,
		});
	}, [
		activeSessionId,
		pendingPlanClarification?.planId,
		pendingPlanClarification?.question,
		pendingPlanClarification?.requestId,
		showNativeTaskNotification,
		notificationCopy.clarificationTitle,
		notificationCopy.clarificationBody,
	]);
}
