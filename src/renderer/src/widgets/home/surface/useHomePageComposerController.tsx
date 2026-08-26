import { useCallback, useMemo } from "react";
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

export default function useHomePageComposerController({
	state,
	actions,
}: HomePageComposerControllerParams): HomePageComposerController {
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
			selectedWorkspace: state.isHome
				? state.homeWorkspace
				: state.activeWorkspace,
			workspaceFooterDisabled: state.workspaceFooterDisabled,
			worktreeMode: state.isHome
				? state.homeExecutionEnvironment
				: undefined,
			worktreeSourceOptions: state.isHome
				? state.homeWorktreeSources
				: undefined,
			worktreeDisabledReason: state.isHome
				? state.worktreeDisabledReason
				: null,
			isWorktreePreparing: state.isWorktreePreparing,
			showContextUsage: !state.isHome,
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
			onAddPastedTextAttachment: actions.onAddPastedTextAttachment,
			onAddContextFiles: actions.onAddContextFiles,
			onWorkspaceSelect: state.isHome
				? actions.onHomeWorkspaceSelect
				: undefined,
			onWorkspaceAdd: state.isHome
				? actions.onHomeWorkspaceAdd
				: undefined,
			onWorkspaceClear: state.isHome
				? actions.onHomeWorkspaceClear
				: undefined,
			onWorktreeModeChange: state.isHome
				? actions.onHomeWorktreeModeChange
				: undefined,
			onWorktreeSourceOptionsChange: state.isHome
				? actions.onHomeWorktreeSourceOptionsChange
				: undefined,
			onRemoveContext: actions.onRemoveContext,
			onPinContext: actions.onPinContext,
			onClearUnpinnedContext: actions.onClearUnpinnedContext,
			onCancel: actions.onCancel,
			onSubmit: actions.onSubmit,
			onGuideSubmit: actions.onGuideSubmit,
			onCompletionOpen: actions.onCompletionOpen,
		};
	}, [actions, state]);

	const renderComposer = useCallback(
		(compact: boolean): React.JSX.Element => {
			return (
				<Composer
					key={state.composerInstanceKey}
					{...composerProps}
					compact={compact}
					floating={compact}
				/>
			);
		},
		[composerProps, state.composerInstanceKey],
	);

	return { renderComposer };
}
