import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import type { ChatMode } from "@/platform/rpc/chat-api";
import {
	saveSessionUiMetadata,
	setSessionModel,
	type SaveSessionUiMetadataParams,
} from "@/platform/rpc/session-api";
import type {
	SessionMetadata,
	WorkbenchPatch,
	WorkbenchSnapshot,
} from "@/platform/rpc/types";
import {
	dispatchClientPreferencesChanged,
	updateClientPreferences,
	type ClientPreferences,
	type NewSessionComposerPreferences,
} from "@/platform/rpc/client-preferences-api";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import { createComposerReasoningEffortUpdate } from "@/domain/composer/composer-reasoning-effort";
import {
	getDisplayedComposerModel,
	resolveReasoningEffortForComposerModelChange,
	type HomeDraft,
} from "@/domain/application/app-helpers";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";
import {
	isRunControllerActive,
	type RunControllerState,
} from "@/domain/workbench/run-state";

export type SessionPreferenceControllerParams = {
	activeSessionId: string | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	isNewSessionHome: boolean;
	isHomeSubmitting: boolean;
	homeDraft: HomeDraft;
	workbench: WorkbenchSnapshot | null;
	runState: RunControllerState;
	activeSessionMetadata: SessionMetadata | null;
	providerModelSelection: ProviderModelSelection | null;
	clientPreferencesRef: MutableRefObject<ClientPreferences>;
	setClientPreferences: Dispatch<SetStateAction<ClientPreferences>>;
	setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setSessionError: Dispatch<SetStateAction<string | null>>;
	queueWorkbenchPatch: (
		patch: WorkbenchPatch,
		flushImmediately?: boolean,
	) => void;
	applyWorkbench: (nextWorkbench: WorkbenchSnapshot) => void;
	onInfo: (message: string) => void;
};

export type SessionPreferenceController = {
	persistSessionUiMetadata: (
		params: SaveSessionUiMetadataParams,
	) => Promise<void>;
	handleWorkspaceLaunchChange: (targetId: WorkspaceLaunchTargetId) => void;
	handleModeChange: (nextMode: ChatMode) => Promise<void>;
	handleProviderModelChange: (
		providerId: string,
		modelId: string,
	) => Promise<void>;
	handleReasoningEffortChange: (nextEffort: string) => Promise<void>;
	persistNewSessionComposerDefaults: (
		patch: Partial<NewSessionComposerPreferences>,
	) => void;
};

export default function useSessionPreferenceController({
	activeSessionId,
	activeSessionIdRef,
	isNewSessionHome,
	isHomeSubmitting,
	homeDraft,
	workbench,
	runState,
	activeSessionMetadata,
	providerModelSelection,
	clientPreferencesRef,
	setClientPreferences,
	setHomeDraft,
	setWorkbench,
	setActiveSessionMetadata,
	setSessionError,
	queueWorkbenchPatch,
	applyWorkbench,
	onInfo,
}: SessionPreferenceControllerParams): SessionPreferenceController {
	async function persistSessionUiMetadata(
		params: SaveSessionUiMetadataParams,
	): Promise<void> {
		const sessionId: string | null = activeSessionId;
		if (sessionId === null) {
			return;
		}

		try {
			await saveSessionUiMetadata(params);
			setActiveSessionMetadata(
				(
					currentMetadata: SessionMetadata | null,
				): SessionMetadata | null => {
					return currentMetadata === null ||
						currentMetadata.id !== sessionId
						? currentMetadata
						: {
								...currentMetadata,
								...params,
							};
				},
			);
		} catch (error: unknown) {
			const message: string =
				error instanceof Error
					? error.message
					: "Failed to save session UI state";

			setSessionError(message);
			console.error("[App] save session UI metadata failed", error);
		}
	}

	function handleWorkspaceLaunchChange(
		targetId: WorkspaceLaunchTargetId,
	): void {
		setHomeDraft(
			(currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				workspaceLaunch: targetId,
			}),
		);
		void persistSessionUiMetadata({ workspaceLaunch: targetId });
	}

	async function handleModeChange(nextMode: ChatMode): Promise<void> {
		persistNewSessionComposerDefaults({ mode: nextMode });
		if (isNewSessionHome) {
			setHomeDraft(
				(currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					chatMode: nextMode,
				}),
			);
			return;
		}

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
								chatMode: nextMode,
							},
						};
			},
		);
		queueWorkbenchPatch({ composer: { chatMode: nextMode } }, true);
		await persistSessionUiMetadata({ chatMode: nextMode });
	}

	async function handleProviderModelChange(
		providerId: string,
		modelId: string,
	): Promise<void> {
		if (isNewSessionHome) {
			if (isHomeSubmitting) {
				onInfo("Model changes apply to your next message.");
			}
			const nextReasoningEffort: string =
				resolveReasoningEffortForComposerModelChange({
					selection: providerModelSelection,
					previousProviderId: homeDraft.providerId,
					previousModelId: homeDraft.modelId,
					previousEffort: homeDraft.reasoningEffort,
					nextProviderId: providerId,
					nextModelId: modelId,
				});
			setHomeDraft(
				(currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					providerId,
					modelId,
					reasoningEffort: nextReasoningEffort,
				}),
			);
			persistNewSessionComposerDefaults({
				model: { providerId, modelId },
				reasoningEffort: nextReasoningEffort,
			});
			return;
		}

		const sessionId: string | null = activeSessionId;
		if (sessionId === null) {
			return;
		}

		if (isRunControllerActive(runState)) {
			onInfo("Model changes apply to your next message.");
		}

		const previousWorkbench: WorkbenchSnapshot | null = workbench;
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
								provider: providerId,
								model: modelId,
							},
						};
			},
		);

		try {
			const result = await setSessionModel({
				provider: providerId,
				model: modelId,
			});
			if (activeSessionIdRef.current !== sessionId) {
				return;
			}
			setActiveSessionMetadata(result.metadata);
			applyWorkbench(result.workbench);
			persistNewSessionComposerDefaults({
				model: { providerId, modelId },
				reasoningEffort:
					result.workbench.composer.reasoningEffort ??
					clientPreferencesRef.current.newSessionComposer.reasoningEffort,
			});
		} catch (error: unknown) {
			if (
				activeSessionIdRef.current === sessionId &&
				previousWorkbench !== null
			) {
				setWorkbench(previousWorkbench);
			}
			const message: string =
				error instanceof Error
					? error.message
					: "Failed to save session model";
			setSessionError(message);
			console.error("[App] save session model failed", error);
		}
	}

	async function handleReasoningEffortChange(
		nextEffort: string,
	): Promise<void> {
		persistNewSessionComposerDefaults({ reasoningEffort: nextEffort });
		if (isNewSessionHome) {
			setHomeDraft(
				(currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					reasoningEffort: nextEffort,
				}),
			);
			return;
		}

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
								reasoningEffort: nextEffort,
							},
						};
			},
		);
		const currentModel = getDisplayedComposerModel({
			isNewSessionHome,
			homeDraft,
			workbench,
			activeSessionMetadata,
			providerModelSelection,
		});
		const update = createComposerReasoningEffortUpdate(
			currentModel.providerId,
			currentModel.modelId,
			nextEffort,
		);
		queueWorkbenchPatch(update.workbenchPatch, true);
		await persistSessionUiMetadata(update.sessionMetadata);
	}

	function persistNewSessionComposerDefaults(
		patch: Partial<NewSessionComposerPreferences>,
	): void {
		const currentPreferences: ClientPreferences =
			clientPreferencesRef.current;
		const newSessionComposer: NewSessionComposerPreferences = {
			...currentPreferences.newSessionComposer,
			...patch,
		};
		const nextPreferences: ClientPreferences = {
			...currentPreferences,
			lastComposerModel: newSessionComposer.model,
			newSessionComposer,
		};
		clientPreferencesRef.current = nextPreferences;
		setClientPreferences(nextPreferences);
		dispatchClientPreferencesChanged(nextPreferences);
		void updateClientPreferences({
			lastComposerModel: nextPreferences.lastComposerModel,
			newSessionComposer,
		})
			.then((savedPreferences: ClientPreferences): void => {
				clientPreferencesRef.current = savedPreferences;
				setClientPreferences(savedPreferences);
			})
			.catch((error: unknown): void => {
				console.error(
					"[App] save new-session composer defaults failed",
					error,
				);
			});
	}

	return {
		persistSessionUiMetadata,
		handleWorkspaceLaunchChange,
		handleModeChange,
		handleProviderModelChange,
		handleReasoningEffortChange,
		persistNewSessionComposerDefaults,
	};
}
