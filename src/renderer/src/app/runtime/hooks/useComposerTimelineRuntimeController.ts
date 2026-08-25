import {
	useCallback,
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
} from "react";
import type {
	AdditionalContextItem,
	MessageQueueItem,
	TimelineBlock,
	WorkbenchPatch,
	WorkbenchPatchResult,
	WorkbenchSnapshot,
} from "@/platform/rpc/types";
import {
	applyWorkbenchSnapshot,
	type TimelinePageState,
} from "@/domain/workbench/workbench-state";
import {
	createOptimisticRunState,
	finishOptimisticRunState,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import {
	markRunStopped,
	markSessionRunStarted,
	type RunningSessionState,
} from "@/domain/workspace/session-running";
import {
	createOptimisticUserBlock,
	insertUserBlockBeforeRequestAssistant,
	trimTimelineFromRequest,
} from "../app-helpers";
import useWorkbenchPatchQueue from "./useWorkbenchPatchQueue";

export type FirstTurnModelTransition = {
	sessionId: string;
	providerId: string;
	modelId: string;
};

export type ComposerTimelineRuntimeControllerParams = {
	activeSessionIdRef: MutableRefObject<string | null>;
	composerDraftsRef: MutableRefObject<Map<string, string>>;
	isNewSessionHome: boolean;
	runState: RunControllerState;
	timelineStore: TimelinePageStore;
	setComposerInputReset: Dispatch<
		SetStateAction<{ scopeId: string; revision: number }>
	>;
	setFirstTurnModelTransition: Dispatch<
		SetStateAction<FirstTurnModelTransition | null>
	>;
	setHomeComposerMessage: Dispatch<SetStateAction<string>>;
	setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	clearWorkflowTodoUiState: (options?: {
		preservePlanSnapshot?: boolean;
	}) => void;
};

export type ComposerTimelineRuntimeController = {
	applyWorkbench: (nextWorkbench: WorkbenchSnapshot) => void;
	takePendingWorkbenchPatch: () => WorkbenchPatch;
	sendWorkbenchPatch: (
		patch: WorkbenchPatch,
		applyResult?: boolean,
	) => Promise<WorkbenchPatchResult | null>;
	queueWorkbenchPatch: (patch: WorkbenchPatch, immediate?: boolean) => void;
	replaceComposerInput: (text: string, scopeId?: string) => void;
	handleComposerDraftChange: (text: string) => void;
	applyOptimisticActiveRun: (
		requestId: string,
		clearComposerText: boolean,
		clearComposerContext?: boolean,
		preserveWorkflowTodo?: boolean,
	) => void;
	appendOptimisticUserBlock: (
		requestId: string,
		message: string,
		additionalContext: AdditionalContextItem[],
	) => void;
	applyOptimisticSend: (
		requestId: string,
		message: string,
		additionalContext: AdditionalContextItem[],
		clearComposerText?: boolean,
		preserveWorkflowTodo?: boolean,
	) => void;
	appendQueuedRunUserBlock: (
		workbenchSnapshot: WorkbenchSnapshot,
	) => void;
	finishOptimisticActiveRun: (requestId: string) => void;
	applyOptimisticRetry: (
		retryFromRequestId: string,
		requestId: string,
		message: string,
		additionalContext: AdditionalContextItem[],
	) => void;
};

export default function useComposerTimelineRuntimeController({
	activeSessionIdRef,
	composerDraftsRef,
	isNewSessionHome,
	runState,
	timelineStore,
	setComposerInputReset,
	setFirstTurnModelTransition,
	setHomeComposerMessage,
	setRunningSessionState,
	setRunState,
	setWorkbench,
	clearWorkflowTodoUiState,
}: ComposerTimelineRuntimeControllerParams): ComposerTimelineRuntimeController {
	const applyWorkbench = useCallback(
		(nextWorkbench: WorkbenchSnapshot): void => {
			setFirstTurnModelTransition(
				(currentTransition): FirstTurnModelTransition | null => {
					return currentTransition?.sessionId ===
						nextWorkbench.sessionId &&
						currentTransition.providerId ===
							nextWorkbench.composer.provider &&
						currentTransition.modelId === nextWorkbench.composer.model
						? null
						: currentTransition;
				},
			);
			setWorkbench(
				(
					currentWorkbench: WorkbenchSnapshot | null,
				): WorkbenchSnapshot => {
					const normalizedWorkbench: WorkbenchSnapshot = {
						...nextWorkbench,
						composer: {
							...nextWorkbench.composer,
							text: "",
						},
					};
					return applyWorkbenchSnapshot(
						currentWorkbench,
						normalizedWorkbench,
					);
				},
			);
		},
		[setFirstTurnModelTransition, setWorkbench],
	);

	const {
		takePendingWorkbenchPatch,
		sendWorkbenchPatch,
		queueWorkbenchPatch,
	} = useWorkbenchPatchQueue(applyWorkbench);

	const replaceComposerInput = useCallback(
		(
			text: string,
			scopeId: string = activeSessionIdRef.current ?? "home",
		): void => {
			if (text.length === 0) {
				composerDraftsRef.current.delete(scopeId);
			} else {
				composerDraftsRef.current.set(scopeId, text);
			}
			if (scopeId === "home" || isNewSessionHome) {
				setHomeComposerMessage(text);
			}
			setComposerInputReset(
				(current): { scopeId: string; revision: number } => ({
					scopeId,
					revision: current.revision + 1,
				}),
			);
		},
		[
			activeSessionIdRef,
			composerDraftsRef,
			isNewSessionHome,
			setComposerInputReset,
			setHomeComposerMessage,
		],
	);

	const handleComposerDraftChange = useCallback(
		(text: string): void => {
			const scopeId: string = activeSessionIdRef.current ?? "home";
			if (text.length === 0) {
				composerDraftsRef.current.delete(scopeId);
				if (isNewSessionHome) {
					setHomeComposerMessage("");
				}
				return;
			}
			composerDraftsRef.current.set(scopeId, text);
			if (isNewSessionHome) {
				setHomeComposerMessage(text);
			}
		},
		[
			activeSessionIdRef,
			composerDraftsRef,
			isNewSessionHome,
			setHomeComposerMessage,
		],
	);

	const applyOptimisticActiveRun = useCallback(
		(
			requestId: string,
			clearComposerText: boolean,
			clearComposerContext: boolean = false,
			preserveWorkflowTodo: boolean = false,
		): void => {
			const startedAt: string = new Date().toISOString();
			const sequence: number = runState.sequence + 1;
			setRunningSessionState(
				(current: RunningSessionState): RunningSessionState => {
					return markSessionRunStarted(
						current,
						activeSessionIdRef.current,
						requestId,
					);
				},
			);

			clearWorkflowTodoUiState({
				preservePlanSnapshot: preserveWorkflowTodo,
			});
			setRunState(
				(currentState: RunControllerState): RunControllerState =>
					createOptimisticRunState(currentState, requestId, startedAt),
			);
			setWorkbench(
				(
					currentWorkbench: WorkbenchSnapshot | null,
				): WorkbenchSnapshot | null => {
					return currentWorkbench === null
						? currentWorkbench
						: {
								...currentWorkbench,
								composer: {
									...currentWorkbench.composer,
									text: clearComposerText
										? ""
										: currentWorkbench.composer.text,
									additionalContext: clearComposerContext
										? []
										: currentWorkbench.composer
												.additionalContext,
								},
								activeRun: {
									status: "streaming",
									requestId,
									startedAt,
									sequence,
								},
							};
				},
			);
		},
		[
			activeSessionIdRef,
			clearWorkflowTodoUiState,
			runState.sequence,
			setRunningSessionState,
			setRunState,
			setWorkbench,
		],
	);

	const appendOptimisticUserBlock = useCallback(
		(
			requestId: string,
			message: string,
			additionalContext: AdditionalContextItem[],
		): void => {
			timelineStore.update(
				(currentPage: TimelinePageState): TimelinePageState => {
					const sessionId: string | null = activeSessionIdRef.current;
					const hasUserBlock: boolean = currentPage.blocks.some(
						(block: TimelineBlock): boolean => {
							return (
								block.type === "user" &&
								block.requestId === requestId
							);
						},
					);

					if (hasUserBlock) {
						return currentPage;
					}
					const blocks: TimelineBlock[] =
						insertUserBlockBeforeRequestAssistant(
							currentPage.blocks,
							createOptimisticUserBlock(
								requestId,
								message,
								additionalContext,
							),
						);

					return {
						...currentPage,
						sessionId: currentPage.sessionId ?? sessionId,
						blocks,
						blockCount: currentPage.blockCount + 1,
						hasMoreAfter: false,
					};
				},
			);
		},
		[activeSessionIdRef, timelineStore],
	);

	const applyOptimisticSend = useCallback(
		(
			requestId: string,
			message: string,
			additionalContext: AdditionalContextItem[],
			clearComposerText: boolean = true,
			preserveWorkflowTodo: boolean = false,
		): void => {
			applyOptimisticActiveRun(
				requestId,
				clearComposerText,
				true,
				preserveWorkflowTodo,
			);
			appendOptimisticUserBlock(requestId, message, additionalContext);
		},
		[applyOptimisticActiveRun, appendOptimisticUserBlock],
	);

	const appendQueuedRunUserBlock = useCallback(
		(workbenchSnapshot: WorkbenchSnapshot): void => {
			const requestId: string | undefined =
				workbenchSnapshot.activeRun.requestId;
			const queueItemId: number | undefined =
				workbenchSnapshot.activeRun.queueItemId;
			if (requestId === undefined || queueItemId === undefined) {
				return;
			}

			const queueItem: MessageQueueItem | undefined =
				workbenchSnapshot.messageQueue.find(
					(item: MessageQueueItem): boolean => {
						return (
							item.id === queueItemId &&
							(item.status === "sending" || item.status === "approval")
						);
					},
				);
			if (queueItem === undefined) {
				return;
			}

			appendOptimisticUserBlock(
				requestId,
				queueItem.text,
				queueItem.additionalContext,
			);
		},
		[appendOptimisticUserBlock],
	);

	const finishOptimisticActiveRun = useCallback(
		(requestId: string): void => {
			setRunningSessionState(
				(current: RunningSessionState): RunningSessionState => {
					return markRunStopped(current, requestId);
				},
			);
			setRunState(
				(currentState: RunControllerState): RunControllerState =>
					finishOptimisticRunState(currentState, requestId),
			);
			setWorkbench(
				(
					currentWorkbench: WorkbenchSnapshot | null,
				): WorkbenchSnapshot | null => {
					if (
						currentWorkbench === null ||
						currentWorkbench.activeRun.requestId !== requestId
					) {
						return currentWorkbench;
					}
					if (currentWorkbench.activeRun.status === "approval") {
						return currentWorkbench;
					}
					return {
						...currentWorkbench,
						activeRun: { status: "idle" },
					};
				},
			);
		},
		[setRunningSessionState, setRunState, setWorkbench],
	);

	const applyOptimisticRetry = useCallback(
		(
			retryFromRequestId: string,
			requestId: string,
			message: string,
			additionalContext: AdditionalContextItem[],
		): void => {
			applyOptimisticActiveRun(requestId, false, false);
			timelineStore.update(
				(currentPage: TimelinePageState): TimelinePageState => {
					const sessionId: string | null = activeSessionIdRef.current;
					const trimmedPage: TimelinePageState = trimTimelineFromRequest(
						currentPage,
						retryFromRequestId,
					);

					return {
						...trimmedPage,
						sessionId: trimmedPage.sessionId ?? sessionId,
						blocks: insertUserBlockBeforeRequestAssistant(
							trimmedPage.blocks,
							createOptimisticUserBlock(
								requestId,
								message,
								additionalContext,
							),
						),
						blockCount: trimmedPage.blockCount + 1,
						hasMoreAfter: false,
					};
				},
			);
		},
		[
			activeSessionIdRef,
			applyOptimisticActiveRun,
			timelineStore,
		],
	);

	return {
		applyWorkbench,
		takePendingWorkbenchPatch,
		sendWorkbenchPatch,
		queueWorkbenchPatch,
		replaceComposerInput,
		handleComposerDraftChange,
		applyOptimisticActiveRun,
		appendOptimisticUserBlock,
		applyOptimisticSend,
		appendQueuedRunUserBlock,
		finishOptimisticActiveRun,
		applyOptimisticRetry,
	};
}
