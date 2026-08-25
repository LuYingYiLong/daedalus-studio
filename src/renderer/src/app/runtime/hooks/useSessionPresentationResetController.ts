import type {
	Dispatch,
	SetStateAction,
} from "react";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import {
	createIdleRunState,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import type { WorkbenchSnapshot } from "@/platform/rpc/types";

export type SessionPresentationResetControllerParams = {
	timelineStore: TimelinePageStore;
	resetTimelineUiState: () => void;
	clearWorkflowTodoUiState: () => void;
	resetPlanGoalUiState: () => void;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setActiveRetryRequestId: Dispatch<SetStateAction<string | null>>;
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
};

export type SessionPresentationResetController = {
	resetSessionPresentationState: () => void;
};

export default function useSessionPresentationResetController({
	timelineStore,
	resetTimelineUiState,
	clearWorkflowTodoUiState,
	resetPlanGoalUiState,
	setWorkbench,
	setActiveRetryRequestId,
	setRunState,
}: SessionPresentationResetControllerParams): SessionPresentationResetController {
	function resetSessionPresentationState(): void {
		timelineStore.reset();
		resetTimelineUiState();
		setWorkbench(null);
		clearWorkflowTodoUiState();
		resetPlanGoalUiState();
		setActiveRetryRequestId(null);
		setRunState(
			(currentState: RunControllerState): RunControllerState =>
				createIdleRunState(currentState.sequence),
		);
	}

	return {
		resetSessionPresentationState,
	};
}
