import {
	useRef,
	useState,
	type Dispatch,
	type SetStateAction,
} from "react";
import type {
	SessionMetadata,
	WorkflowTodoSnapshot,
} from "@/platform/rpc/types";
import { saveSessionUiMetadata } from "@/platform/rpc/session-api";
import {
	getWorkflowTodoSnapshotKey,
	isWorkflowTodoActive,
} from "@/domain/composer/workflow-todo";

export type WorkflowTodoPresentationControllerParams = {
	activeSessionMetadata: SessionMetadata | null;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
};

export type WorkflowTodoPresentationController = {
	workflowTodoSnapshot: WorkflowTodoSnapshot | null;
	setWorkflowTodoSnapshot: Dispatch<
		SetStateAction<WorkflowTodoSnapshot | null>
	>;
	rememberLoadedWorkflowTodo: (snapshot: WorkflowTodoSnapshot | null) => void;
	clearWorkflowTodoUiState: (options?: {
		preservePlanSnapshot?: boolean;
	}) => void;
	expandWorkflowTodoPanel: () => void;
	showWorkflowTodo: (
		snapshot: WorkflowTodoSnapshot | null,
		forceExpand?: boolean,
	) => void;
	applyInitialWorkflowTodoPreference: (
		snapshot: WorkflowTodoSnapshot | null,
	) => void;
};

export default function useWorkflowTodoPresentationController({
	activeSessionMetadata,
	setActiveSessionMetadata,
}: WorkflowTodoPresentationControllerParams): WorkflowTodoPresentationController {
	const [workflowTodoSnapshot, setWorkflowTodoSnapshot] =
		useState<WorkflowTodoSnapshot | null>(null);
	const initializedWorkflowTodoKeyRef = useRef<string>("");
	const expandedActiveWorkflowTodoKeyRef = useRef<string>("");

	function rememberLoadedWorkflowTodo(
		snapshot: WorkflowTodoSnapshot | null,
	): void {
		initializedWorkflowTodoKeyRef.current =
			snapshot === null ? "" : getWorkflowTodoSnapshotKey(snapshot);
		if (snapshot === null) {
			expandedActiveWorkflowTodoKeyRef.current = "";
		}
	}

	function clearWorkflowTodoUiState(
		options: { preservePlanSnapshot?: boolean } = {},
	): void {
		if (options.preservePlanSnapshot === true) {
			setWorkflowTodoSnapshot(
				(
					currentSnapshot: WorkflowTodoSnapshot | null,
				): WorkflowTodoSnapshot | null => {
					if (currentSnapshot?.source === "plan") {
						return currentSnapshot;
					}

					rememberLoadedWorkflowTodo(null);
					return null;
				},
			);
			return;
		}

		setWorkflowTodoSnapshot(null);
		rememberLoadedWorkflowTodo(null);
	}

	function expandWorkflowTodoPanel(): void {
		setActiveSessionMetadata(
			(
				currentMetadata: SessionMetadata | null,
			): SessionMetadata | null => {
				return currentMetadata === null
					? currentMetadata
					: {
							...currentMetadata,
							workflowTodoCollapsed: false,
						};
			},
		);
	}

	function showWorkflowTodo(
		snapshot: WorkflowTodoSnapshot | null,
		forceExpand: boolean = false,
	): void {
		setWorkflowTodoSnapshot(snapshot);
		rememberLoadedWorkflowTodo(snapshot);
		if (snapshot !== null && forceExpand) {
			expandWorkflowTodoPanel();
		}
	}

	function applyInitialWorkflowTodoPreference(
		snapshot: WorkflowTodoSnapshot | null,
	): void {
		if (snapshot === null) {
			initializedWorkflowTodoKeyRef.current = "";
			return;
		}

		const workflowTodoKey: string = getWorkflowTodoSnapshotKey(snapshot);
		const workflowTodoIsActive: boolean = isWorkflowTodoActive(snapshot);
		if (
			activeSessionMetadata?.workflowTodoDismissedKey === workflowTodoKey
		) {
			initializedWorkflowTodoKeyRef.current = workflowTodoKey;
			return;
		}
		if (initializedWorkflowTodoKeyRef.current === workflowTodoKey) {
			if (
				!workflowTodoIsActive ||
				expandedActiveWorkflowTodoKeyRef.current === workflowTodoKey
			) {
				return;
			}
		}

		initializedWorkflowTodoKeyRef.current = workflowTodoKey;
		if (workflowTodoIsActive) {
			expandedActiveWorkflowTodoKeyRef.current = workflowTodoKey;
		}
		const workflowTodoCollapsed: boolean = !workflowTodoIsActive;
		setActiveSessionMetadata(
			(
				currentMetadata: SessionMetadata | null,
			): SessionMetadata | null => {
				return currentMetadata === null
					? currentMetadata
					: {
							...currentMetadata,
							workflowTodoCollapsed,
							workflowTodoDismissedKey: null,
						};
			},
		);
		void saveSessionUiMetadata({
			workflowTodoCollapsed,
			workflowTodoDismissedKey: null,
		}).catch((error: unknown): void => {
			console.error(
				"[App] save initial workflow todo collapsed state failed",
				error,
			);
		});
	}

	return {
		workflowTodoSnapshot,
		setWorkflowTodoSnapshot,
		rememberLoadedWorkflowTodo,
		clearWorkflowTodoUiState,
		expandWorkflowTodoPanel,
		showWorkflowTodo,
		applyInitialWorkflowTodoPreference,
	};
}
