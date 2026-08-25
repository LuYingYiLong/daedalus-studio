import {
	useEffect,
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
} from "react";
import type {
	ProviderModelInfo,
	ProviderModelSelection,
	ProviderModelSelectionProvider,
} from "@/platform/rpc/provider-api";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { WorkbenchSnapshot } from "@/platform/rpc/types";
import {
	applyRunStateFromWorkbench,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import { markActiveSessionRead } from "@/domain/workspace/session-unread";
import {
	findPreferredComposerModel,
	type HomeDraft,
} from "../app-helpers";

export type AppRuntimeStateEffectsParams = {
	activeSessionId: string | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	isNewSessionHome: boolean;
	providerModelSelection: ProviderModelSelection | null;
	clientPreferences: ClientPreferences;
	workbench: WorkbenchSnapshot | null;
	runState: RunControllerState;
	cancelledChatRequestIdsRef: MutableRefObject<Set<string>>;
	activeChatRequestIdRef: MutableRefObject<string | null>;
	windowFocusedRef: MutableRefObject<boolean>;
	discardPendingTimelineEvents: () => void;
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
	setIsHomeSubmitting: Dispatch<SetStateAction<boolean>>;
	setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
	setUnreadSessionIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
};

export default function useAppRuntimeStateEffects({
	activeSessionId,
	activeSessionIdRef,
	isNewSessionHome,
	providerModelSelection,
	clientPreferences,
	workbench,
	runState,
	cancelledChatRequestIdsRef,
	activeChatRequestIdRef,
	windowFocusedRef,
	discardPendingTimelineEvents,
	setRunState,
	setIsHomeSubmitting,
	setHomeDraft,
	setUnreadSessionIds,
}: AppRuntimeStateEffectsParams): void {
	useEffect((): void => {
		if (runState.status === "idle") {
			activeChatRequestIdRef.current = null;
			setIsHomeSubmitting(false);
		}
	}, [runState.status]);

	useEffect((): void => {
		setRunState(
			(currentState: RunControllerState): RunControllerState =>
				applyRunStateFromWorkbench(
					currentState,
					workbench,
					cancelledChatRequestIdsRef.current,
				),
		);
	}, [workbench]);

	useEffect((): void => {
		discardPendingTimelineEvents();
		activeSessionIdRef.current = activeSessionId;
	}, [activeSessionId, discardPendingTimelineEvents]);

	useEffect((): void => {
		if (!isNewSessionHome) {
			return;
		}

		setHomeDraft((currentDraft: HomeDraft): HomeDraft => {
			const currentProvider: ProviderModelSelectionProvider | undefined =
				providerModelSelection?.providers.find(
					(provider: ProviderModelSelectionProvider): boolean => {
						return (
							provider.configured &&
							provider.enabled !== false &&
							provider.provider === currentDraft.providerId &&
							provider.models.some(
								(model: ProviderModelInfo): boolean =>
									model.id === currentDraft.modelId,
							)
						);
					},
				);
			if (currentProvider !== undefined) {
				return currentDraft;
			}

			const preferredModel = findPreferredComposerModel(
				clientPreferences,
				providerModelSelection,
			);
			if (preferredModel === null) {
				return {
					...currentDraft,
					providerId: null,
					modelId: null,
				};
			}

			return {
				...currentDraft,
				providerId: preferredModel.providerId,
				modelId: preferredModel.modelId,
			};
		});
	}, [clientPreferences, isNewSessionHome, providerModelSelection]);

	useEffect((): (() => void) => {
		return (): void => {
			discardPendingTimelineEvents();
		};
	}, [discardPendingTimelineEvents]);

	useEffect((): (() => void) => {
		const handleWindowFocus = (): void => {
			windowFocusedRef.current = true;
			setUnreadSessionIds(
				(
					currentSessionIds: ReadonlySet<string>,
				): ReadonlySet<string> => {
					return markActiveSessionRead(
						currentSessionIds,
						activeSessionIdRef.current,
						true,
					);
				},
			);
		};
		const handleWindowBlur = (): void => {
			windowFocusedRef.current = false;
		};

		window.addEventListener("focus", handleWindowFocus);
		window.addEventListener("blur", handleWindowBlur);
		if (document.hasFocus()) {
			handleWindowFocus();
		} else {
			handleWindowBlur();
		}

		return (): void => {
			window.removeEventListener("focus", handleWindowFocus);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, []);

	useEffect((): void => {
		setUnreadSessionIds(
			(currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
				return markActiveSessionRead(
					currentSessionIds,
					activeSessionId,
					windowFocusedRef.current,
				);
			},
		);
	}, [activeSessionId]);
}
