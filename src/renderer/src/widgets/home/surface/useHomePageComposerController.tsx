import { useCallback, useEffect, useMemo, useState } from "react";
import { ComputerSharingIndicator } from "@/widgets/computer-observation/ComputerObservationBoundary";
import Composer, {
	type ComposerProps,
} from "@/widgets/composer/Composer";

type ComposerActionKeys =
	| "onDraftChange"
	| "onModeChange"
	| "onApprovalModeChange"
	| "onProviderModelChange"
	| "onReasoningEffortChange"
	| "onAddFiles"
	| "onAddFolder"
	| "onAddImages"
	| "onAddWindowScreenshot"
	| "onAddPastedTextAttachment"
	| "onAddContextFiles"
	| "onRemoveContext"
	| "onPinContext"
	| "onClearUnpinnedContext"
	| "onCancel"
	| "onSubmit"
	| "onGuideSubmit"
	| "onCompletionOpen";

export type HomePageComposerControllerParams = {
	state: {
		composerInstanceKey: string;
		inputRequest: ComposerProps["inputRequest"] | null;
		providerModelSelection: ComposerProps["providerModelSelection"];
		selectedProviderId: ComposerProps["selectedProviderId"];
		selectedModelId: ComposerProps["selectedModelId"];
		reasoningEffort: ComposerProps["reasoningEffort"];
		message: ComposerProps["message"];
		nextStepSuggestion: ComposerProps["nextStepSuggestion"];
		contextItems: NonNullable<ComposerProps["contextItems"]>;
		mode: ComposerProps["mode"];
		approvalMode: ComposerProps["approvalMode"];
		slashCommands: NonNullable<ComposerProps["slashCommands"]>;
		skills: NonNullable<ComposerProps["skills"]>;
		isSending: boolean;
		isCancelling: boolean;
		isAddingTextAttachment: boolean;
		isApprovalModeSaving: boolean;
		workspaceOptions: NonNullable<ComposerProps["workspaceOptions"]>;
		workspaceFooterDisabled: boolean;
		isHome: boolean;
		homeExecutionEnvironment: NonNullable<ComposerProps["worktreeMode"]>;
		homeWorktreeSources: NonNullable<ComposerProps["worktreeSourceOptions"]>;
		activeWorkspace: ComposerProps["selectedWorkspace"];
		homeWorkspace: ComposerProps["selectedWorkspace"];
		worktreeDisabledReason: ComposerProps["worktreeDisabledReason"];
		isWorktreePreparing: boolean;
	};
	actions: Pick<ComposerProps, ComposerActionKeys> & {
		onHomeWorkspaceSelect: NonNullable<ComposerProps["onWorkspaceSelect"]>;
		onHomeWorkspaceAdd: NonNullable<ComposerProps["onWorkspaceAdd"]>;
		onHomeWorkspaceClear: NonNullable<ComposerProps["onWorkspaceClear"]>;
		onHomeWorktreeModeChange: NonNullable<
			ComposerProps["onWorktreeModeChange"]
		>;
		onHomeWorktreeSourceOptionsChange: NonNullable<
			ComposerProps["onWorktreeSourceOptionsChange"]
		>;
	};
};

export type HomePageComposerController = {
	renderComposer: (compact: boolean) => React.JSX.Element;
};

const COMPOSER_FOOTER_COVER_TRANSITION_MS = 220;

export default function useHomePageComposerController({
	state,
	actions,
}: HomePageComposerControllerParams): HomePageComposerController {
	const [keepWorkspaceFooter, setKeepWorkspaceFooter] = useState(
		state.isHome,
	);

	useEffect((): (() => void) | void => {
		if (state.isHome) {
			setKeepWorkspaceFooter(true);
			return;
		}
		if (!keepWorkspaceFooter) {
			return;
		}

		const timeoutId: number = window.setTimeout((): void => {
			setKeepWorkspaceFooter(false);
		}, COMPOSER_FOOTER_COVER_TRANSITION_MS);
		return (): void => {
			window.clearTimeout(timeoutId);
		};
	}, [keepWorkspaceFooter, state.isHome]);

	const showWorkspaceFooter: boolean = state.isHome || keepWorkspaceFooter;
	const composerProps: ComposerProps = useMemo<ComposerProps>(() => {
		return {
			providerModelSelection: state.providerModelSelection,
			inputRequest: state.inputRequest ?? undefined,
			nextStepSuggestion: state.nextStepSuggestion,
			selectedProviderId: state.selectedProviderId,
			selectedModelId: state.selectedModelId,
			reasoningEffort: state.reasoningEffort,
			message: state.message,
			onDraftChange: actions.onDraftChange,
			contextItems: state.contextItems,
			mode: state.mode,
			approvalMode: state.approvalMode,
			slashCommands: state.slashCommands,
			skills: state.skills,
			isSending: state.isSending,
			isCancelling: state.isCancelling,
			isAddingTextAttachment: state.isAddingTextAttachment,
			isApprovalModeSaving: state.isApprovalModeSaving,
			workspaceOptions: state.workspaceOptions,
			selectedWorkspace: showWorkspaceFooter
				? state.homeWorkspace
				: state.activeWorkspace,
			workspaceFooterDisabled: state.workspaceFooterDisabled,
			worktreeMode: showWorkspaceFooter
				? state.homeExecutionEnvironment
				: undefined,
			worktreeSourceOptions: showWorkspaceFooter
				? state.homeWorktreeSources
				: undefined,
			worktreeDisabledReason: showWorkspaceFooter
				? state.worktreeDisabledReason
				: null,
			isWorktreePreparing: state.isWorktreePreparing,
			showContextUsage: !state.isHome && !keepWorkspaceFooter,
			onModeChange: actions.onModeChange,
			onApprovalModeChange: actions.onApprovalModeChange,
			onProviderModelChange: actions.onProviderModelChange,
			onConfigureProvider: (): void => {
				void window.electronAPI.windowControl.openSettings("provider");
			},
			onReasoningEffortChange: actions.onReasoningEffortChange,
			onAddFiles: actions.onAddFiles,
			onAddFolder: actions.onAddFolder,
			onAddImages: actions.onAddImages,
			onAddWindowScreenshot: actions.onAddWindowScreenshot,
			onAddPastedTextAttachment: actions.onAddPastedTextAttachment,
			onAddContextFiles: actions.onAddContextFiles,
			onWorkspaceSelect: showWorkspaceFooter
				? actions.onHomeWorkspaceSelect
				: undefined,
			onWorkspaceAdd: showWorkspaceFooter
				? actions.onHomeWorkspaceAdd
				: undefined,
			onWorkspaceClear: showWorkspaceFooter
				? actions.onHomeWorkspaceClear
				: undefined,
			onWorktreeModeChange: showWorkspaceFooter
				? actions.onHomeWorktreeModeChange
				: undefined,
			onWorktreeSourceOptionsChange: showWorkspaceFooter
				? actions.onHomeWorktreeSourceOptionsChange
				: undefined,
			onRemoveContext: actions.onRemoveContext,
			onPinContext: actions.onPinContext,
			onClearUnpinnedContext: actions.onClearUnpinnedContext,
			onCancel: () => { void window.electronAPI.computerObservation?.revoke(); actions.onCancel?.(); },
			onSubmit: actions.onSubmit,
			onGuideSubmit: actions.onGuideSubmit,
			onCompletionOpen: actions.onCompletionOpen,
		};
	}, [actions, keepWorkspaceFooter, showWorkspaceFooter, state]);

	const renderComposer = useCallback(
		(compact: boolean): React.JSX.Element => {
			return (
				<><ComputerSharingIndicator />
				<Composer
					key={compact ? state.composerInstanceKey : "home-page-composer"}
					{...composerProps}
					resetKey={state.composerInstanceKey}
					preserveWorkspaceFooter={!compact}
					coverWorkspaceFooter={!compact && !state.isHome}
					compact={compact}
					floating={compact}
				/>
				</>
			);
		},
		[composerProps, state.composerInstanceKey],
	);

	return { renderComposer };
}
