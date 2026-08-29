import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Input,
	Dropdown,
	Button,
	Divider,
	Flex,
	Tooltip,
	Popover,
	Progress,
	Typography,
	Spin,
	Segmented,
} from "antd";
import type { MenuProps } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { workspaceSupportsWorktrees } from "@/domain/workspace/worktree-capability";
import styles from "./Composer.module.css";
import type { ApprovalMode } from "@/platform/rpc/approval-api";
import type { ChatMode } from "@/platform/rpc/chat-api";
import type { SlashCommandDefinition } from "@/platform/rpc/command-api";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import type {
	AdditionalContextItem,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type {
	ProviderModelInfo,
	ProviderModelSelection,
	ProviderModelSelectionProvider,
	ProviderReasoningEffortOption,
} from "@/platform/rpc/provider-api";
import { fetchTextAttachmentContent } from "@/platform/rpc/image-attachment-api";
import AdditionalContextStrip from "@/widgets/conversation/AdditionalContextStrip";
import { WorkspaceIconView } from "@/widgets/workspace/workspace-appearance";
import {
	createCompletionOptions,
	getCompletionToken,
	replaceCompletionToken,
	type ComposerCompletionOption,
	type ComposerCompletionToken,
	type ComposerCompletionTrigger,
} from "@/domain/composer/composer-completion";
import { parseComposerModeCommand } from "@/domain/composer/composer-mode-command";
import {
	copyTextToClipboard,
	readImageFromClipboard,
	readTextFromClipboard,
} from "@/platform/electron/clipboard";
import { normalizeContextBudgetSegments } from "@/domain/composer/context-budget-segments";
import {
	createComposerPasteOrigin,
	getComposerPasteOrigin,
	getTextAttachmentId,
	isLongPastedText,
	resolveComposerPasteRange,
	type PastedTextAttachmentInput,
} from "@/features/conversation/pasted-text-attachment";
import {
	ADD_WORKSPACE_KEY,
	COMPOSER_PLACEHOLDER_KEYS,
	createApprovalModeItems,
	createComposerOptionsItems,
	createModelKey,
	createProviderModelAndReasoningItems,
	createWorkspaceFooterItems,
	createWorkspaceKey,
	findSelectedModel,
	getReasoningEffortLabel,
	getSelectedModelLabel,
	isApprovalMode,
	isComposerMode,
	NO_WORKSPACE_KEY,
	parseModelKey,
	parseReasoningEffortKey,
	parseWorkspaceKey,
	resolveDisplayedReasoningEffort,
	createReasoningEffortKey,
	type SelectedModel,
} from "./composer-menu-items";
import useComposerContextUsage, {
	formatTokenCount,
} from "./useComposerContextUsage";
import WorktreeCreationOptions, {
	type WorktreeSourceOptions,
} from "./WorktreeCreationOptions";

export type ComposerProps = {
	providerModelSelection: ProviderModelSelection | null;
	selectedProviderId: string | null;
	selectedModelId: string | null;
	reasoningEffort?: string | null;
	message: string;
	nextStepSuggestion?: string | null;
	inputRequest?: ComposerInputRequest;
	onDraftChange?: (message: string) => void;
	contextItems?: AdditionalContextItem[];
	mode: ChatMode;
	approvalMode: ApprovalMode;
	slashCommands?: SlashCommandDefinition[];
	skills?: SkillSummary[];
	isSending?: boolean;
	isCancelling?: boolean;
	isAddingTextAttachment?: boolean;
	isApprovalModeSaving?: boolean;
	workspaceOptions?: WorkspaceConfig[];
	selectedWorkspace?: WorkspaceConfig | null;
	workspaceFooterDisabled?: boolean;
	showContextUsage?: boolean;
	compact?: boolean;
	floating?: boolean;
	allowedModes?: readonly ChatMode[];
	allowQueue?: boolean;
	layout?: "standard" | "mobile";
	worktreeMode?: "local" | "worktree";
	worktreeDisabledReason?: string | null;
	isWorktreePreparing?: boolean;
	worktreeSourceOptions?: Record<string, WorktreeSourceOptions>;
	onModeChange?: (mode: ChatMode) => void;
	onApprovalModeChange?: (mode: ApprovalMode) => void;
	onProviderModelChange?: (providerId: string, modelId: string) => void;
	onConfigureProvider?: () => void;
	onReasoningEffortChange?: (effort: string) => void;
	onWorkspaceSelect?: (workspaceId: string) => void;
	onWorkspaceAdd?: () => void;
	onWorkspaceClear?: () => void;
	onWorktreeModeChange?: (mode: "local" | "worktree") => void;
	onWorktreeSourceOptionsChange?: (
		value: Record<string, WorktreeSourceOptions>,
	) => void;
	onAddFiles?: () => void;
	onAddFolder?: () => void;
	onAddImages?: (files: File[]) => void;
	onAddContextFiles?: (files: File[]) => void;
	onAddPastedTextAttachment?: (input: PastedTextAttachmentInput) => boolean;
	onRemoveContext?: (contextId: string) => void;
	onPinContext?: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext?: () => void;
	onCancel?: () => void;
	onSubmit?: (message: string, modeOverride?: ChatMode) => void;
	onGuideSubmit?: (message: string) => void;
	onCompletionOpen?: (trigger: ComposerCompletionTrigger) => void;
};

export type ComposerInputRequest = {
	requestId: number;
	message: string;
};

type TextAreaSelection = {
	start: number;
	end: number;
};

const CONTEXT_INPUT_COLOR: string = "var(--ds-accent)";
const CONTEXT_OUTPUT_RESERVE_COLOR: string =
	"color-mix(in srgb, var(--ds-accent) 65%, var(--ds-surface))";
const CONTEXT_SAFETY_MARGIN_COLOR: string =
	"color-mix(in srgb, var(--ds-accent) 35%, var(--ds-surface))";

const EMPTY_CONTEXT_ITEMS: AdditionalContextItem[] = [];

function localizeContextCompressionReason(
	reason: string | null | undefined,
	t: TFunction<"common">,
): string | null {
	if (reason === undefined || reason === null || reason.trim().length === 0) {
		return null;
	}

	const knownReasons: Record<string, string> = {
		"No active session":
			"composer.contextUsage.compressDisabled.noActiveSession",
		"A run is active": "composer.contextUsage.compressDisabled.activeRun",
		"Not enough messages":
			"composer.contextUsage.compressDisabled.notEnoughMessages",
		"Protected context blocks cannot be compressed":
			"composer.contextUsage.compressDisabled.protectedBlocks",
		"No new compressible messages":
			"composer.contextUsage.compressDisabled.noCompressibleMessages",
		"No matching context blocks":
			"composer.contextUsage.compressDisabled.noMatchingBlocks",
	};
	const translationKey: string | undefined = knownReasons[reason];
	if (translationKey !== undefined) {
		return t(translationKey);
	}

	const apiKeySuffix: string = " API key not configured";
	if (reason.endsWith(apiKeySuffix)) {
		return t("composer.contextUsage.compressDisabled.providerApiKey", {
			provider: reason.slice(0, -apiKeySuffix.length),
		});
	}

	return reason;
}

function getNativeTextArea(
	ref: TextAreaRef | null,
): HTMLTextAreaElement | null {
	return ref?.resizableTextArea?.textArea ?? null;
}

function createCompletionSignature(
	token: ComposerCompletionToken,
	options: readonly ComposerCompletionOption[],
): string {
	return [
		token.trigger,
		token.query,
		String(token.start),
		String(token.end),
		options
			.map((option: ComposerCompletionOption): string => option.key)
			.join(","),
	].join(":");
}

function Composer({
	providerModelSelection,
	selectedProviderId,
	selectedModelId,
	reasoningEffort,
	message,
	nextStepSuggestion,
	inputRequest,
	contextItems: composerContextItems = EMPTY_CONTEXT_ITEMS,
	mode,
	approvalMode,
	slashCommands = [],
	skills = [],
	isSending = false,
	isCancelling = false,
	isAddingTextAttachment = false,
	isApprovalModeSaving = false,
	workspaceOptions = [],
	selectedWorkspace = null,
	workspaceFooterDisabled = false,
	worktreeMode,
	worktreeDisabledReason = null,
	isWorktreePreparing = false,
	worktreeSourceOptions = {},
	showContextUsage = true,
	compact = false,
	floating = false,
	allowedModes,
	allowQueue = true,
	layout = "standard",
	onModeChange,
	onApprovalModeChange,
	onProviderModelChange,
	onConfigureProvider,
	onReasoningEffortChange,
	onWorkspaceSelect,
	onWorkspaceAdd,
	onWorkspaceClear,
	onWorktreeModeChange,
	onWorktreeSourceOptionsChange,
	onAddFiles,
	onAddFolder,
	onAddImages,
	onAddContextFiles,
	onAddPastedTextAttachment,
	onRemoveContext,
	onPinContext,
	onCancel,
	onSubmit,
	onGuideSubmit,
	onDraftChange,
	onCompletionOpen,
}: ComposerProps): React.JSX.Element {
	const { t } = useTranslation();
	const rootRef = useRef<HTMLDivElement | null>(null);
	const textAreaRef = useRef<TextAreaRef | null>(null);
	const textAreaSelectionRef = useRef<TextAreaSelection>({
		start: 0,
		end: 0,
	});
	const lastInputRequestIdRef = useRef<number | undefined>(
		inputRequest?.requestId,
	);
	const imageInputRef = useRef<HTMLInputElement | null>(null);
	const suppressedCompletionValueRef = useRef<string | null>(null);
	const completionStateSignatureRef = useRef<string>("");
	const expandingTextAttachmentIdsRef = useRef<Set<string>>(new Set());
	const floatingBlurFrameRef = useRef<number | null>(null);
	const [draftMessage, setDraftMessage] = useState<string>(message);
	const [completionToken, setCompletionToken] =
		useState<ComposerCompletionToken | null>(null);
	const [completionOptions, setCompletionOptions] = useState<
		ComposerCompletionOption[]
	>([]);
	const [selectedCompletionIndex, setSelectedCompletionIndex] =
		useState<number>(0);
	const [isComposing, setIsComposing] = useState<boolean>(false);
	const [isFloatingComposerFocused, setIsFloatingComposerFocused] =
		useState<boolean>(false);
	const textAreaPlaceholder: string =
		draftMessage.length === 0 && nextStepSuggestion?.trim().length
			? nextStepSuggestion
			: t(COMPOSER_PLACEHOLDER_KEYS[mode]);
	useEffect((): (() => void) => {
		if (!floating) {
			setIsFloatingComposerFocused(false);
		}

		return (): void => {
			if (floatingBlurFrameRef.current !== null) {
				window.cancelAnimationFrame(floatingBlurFrameRef.current);
			}
		};
	}, [floating]);

	const handleFloatingComposerFocus = useCallback((): void => {
		if (floating) {
			setIsFloatingComposerFocused(true);
		}
	}, [floating]);

	const handleFloatingComposerBlur = useCallback((): void => {
		if (!floating) {
			return;
		}

		if (floatingBlurFrameRef.current !== null) {
			window.cancelAnimationFrame(floatingBlurFrameRef.current);
		}

		floatingBlurFrameRef.current = window.requestAnimationFrame(
			(): void => {
				floatingBlurFrameRef.current = null;
				if (!rootRef.current?.contains(document.activeElement)) {
					setIsFloatingComposerFocused(false);
				}
			},
		);
	}, [floating]);

	const handleApprovalModeClick: MenuProps["onClick"] = useCallback(
		({ key }): void => {
			if (isApprovalMode(key)) {
				onApprovalModeChange?.(key);
			}
		},
		[onApprovalModeChange],
	);

	const handleWorkspaceClick: MenuProps["onClick"] = useCallback(
		({ key }): void => {
			if (workspaceFooterDisabled) {
				return;
			}

			const selectedKey: string = String(key);
			if (selectedKey === NO_WORKSPACE_KEY) {
				onWorkspaceClear?.();
				return;
			}
			if (selectedKey === ADD_WORKSPACE_KEY) {
				onWorkspaceAdd?.();
				return;
			}

			const workspaceId: string | null = parseWorkspaceKey(selectedKey);
			if (workspaceId !== null) {
				onWorkspaceSelect?.(workspaceId);
			}
		},
		[
			onWorkspaceAdd,
			onWorkspaceClear,
			onWorkspaceSelect,
			workspaceFooterDisabled,
		],
	);

	const handleComposerOptionsClick: MenuProps["onClick"] = useCallback(
		({ key }): void => {
			const selectedKey: string = String(key);
			if (isComposerMode(selectedKey)) {
				onModeChange?.(selectedKey);
				return;
			}
			if (selectedKey === "files") {
				onAddFiles?.();
				return;
			}
			if (selectedKey === "folder") {
				onAddFolder?.();
				return;
			}
			if (selectedKey === "images") {
				imageInputRef.current?.click();
			}
		},
		[onAddFiles, onAddFolder, onModeChange],
	);

	const handleTextAreaContextAction: MenuProps["onClick"] = useCallback(
		({ key }): void => {
			const nativeTextArea: HTMLTextAreaElement | null =
				getNativeTextArea(textAreaRef.current);
			if (nativeTextArea === null) {
				return;
			}

			const selection: TextAreaSelection = textAreaSelectionRef.current;
			const value: string = nativeTextArea.value;
			const selectedText: string = value.slice(
				selection.start,
				selection.end,
			);
			const replaceSelection = (replacement: string): void => {
				const nextMessage: string = `${value.slice(0, selection.start)}${replacement}${value.slice(selection.end)}`;
				suppressedCompletionValueRef.current = null;
				hideCompletion();
				setDraftMessage(nextMessage);
				onDraftChange?.(nextMessage);
				setSelectionAfterRender(selection.start + replacement.length);
			};

			switch (String(key)) {
				case "cut":
					if (selectedText.length > 0) {
						void copyTextToClipboard(selectedText)
							.then((): void => replaceSelection(""))
							.catch((error: unknown): void =>
								console.error("[Composer] cut failed", error),
							);
					}
					return;
				case "copy":
					if (selectedText.length > 0) {
						void copyTextToClipboard(selectedText).catch(
							(error: unknown): void =>
								console.error("[Composer] copy failed", error),
						);
					}
					return;
				case "paste": {
					void (async (): Promise<void> => {
						try {
							const image: File | null =
								await readImageFromClipboard();
							if (image !== null && addContextFiles([image])) {
								return;
							}
						} catch (error: unknown) {
							console.warn(
								"[Composer] read clipboard image failed",
								error,
							);
						}

						const text: string = await readTextFromClipboard();
						if (
							isLongPastedText(text) &&
							onAddPastedTextAttachment?.({
								content: text,
								origin: createComposerPasteOrigin(
									value,
									selection.start,
									selection.end,
								),
							}) === true
						) {
							return;
						}
						replaceSelection(text);
					})().catch((error: unknown): void =>
						console.error("[Composer] paste failed", error),
					);
					return;
				}
				case "select-all":
					nativeTextArea.focus();
					nativeTextArea.select();
					textAreaSelectionRef.current = {
						start: 0,
						end: value.length,
					};
					refreshCompletion(value, value.length);
					return;
				default:
					return;
			}
		},
		[onAddContextFiles, onAddPastedTextAttachment, onDraftChange],
	);

	function handleImageInputChange(
		event: React.ChangeEvent<HTMLInputElement>,
	): void {
		const files: File[] = Array.from(event.currentTarget.files ?? []);
		event.currentTarget.value = "";
		if (files.length === 0) {
			return;
		}
		onAddImages?.(files);
	}

	const hasConfiguredProviders: boolean =
		providerModelSelection?.providers.some(
			(provider: ProviderModelSelectionProvider): boolean =>
				provider.configured && provider.enabled !== false,
		) ?? false;
	const workspaceFooterItems: MenuProps["items"] =
		useMemo((): MenuProps["items"] => {
			return createWorkspaceFooterItems(workspaceOptions, t);
		}, [workspaceOptions, t]);
	const selectedModel: SelectedModel | null =
		selectedProviderId === null || selectedModelId === null
			? null
			: {
					provider: selectedProviderId,
					model: selectedModelId,
				};
	const {
		contextUsage,
		contextUsageError,
		isCompressingContext,
		contextCompressionNotice,
		refreshContextUsage,
		handleCompressContext,
	} = useComposerContextUsage({
		message: draftMessage,
		mode,
		provider: selectedModel?.provider,
		model: selectedModel?.model,
		additionalContext: composerContextItems,
		visible: showContextUsage,
		t,
	});
	const contextUsagePercent: number =
		contextUsage?.committedPercent ?? contextUsage?.percent ?? 0;
	const contextSegmentAllocation = normalizeContextBudgetSegments({
		committedPercent: contextUsagePercent,
		inputPercent: contextUsage?.inputPercent ?? contextUsagePercent,
		outputReservePercent: contextUsage?.outputReservePercent ?? 0,
		safetyMarginPercent: contextUsage?.safetyMarginPercent ?? 0,
	});
	const contextUsageRailColor: string = `linear-gradient(to right, ${CONTEXT_SAFETY_MARGIN_COLOR} 0%, ${CONTEXT_SAFETY_MARGIN_COLOR} ${contextSegmentAllocation.committedPercent}%, var(--ds-border) ${contextSegmentAllocation.committedPercent}%, var(--ds-border) 100%)`;
	const compressDisabledReason: string | null = isSending
		? t("composer.contextUsage.compressDisabled.sending")
		: contextUsage?.canCompress === false
			? (localizeContextCompressionReason(
					contextUsage.compressReason,
					t,
				) ?? t("composer.contextUsage.compressDisabled.unavailable"))
			: null;
	const selectedModelKey: string | undefined =
		selectedModel === null
			? undefined
			: createModelKey(selectedModel.provider, selectedModel.model);
	const selectedModelLabel: string = getSelectedModelLabel(
		providerModelSelection,
		selectedModel,
		t,
	);
	const selectedModelInfo: ProviderModelInfo | null = findSelectedModel(
		providerModelSelection,
		selectedModel,
	);
	const reasoningEffortOptions: readonly ProviderReasoningEffortOption[] =
		selectedModelInfo?.capabilities.reasoningEfforts ?? [];
	const displayedReasoningEffort: string | null =
		resolveDisplayedReasoningEffort(
			reasoningEffortOptions,
			reasoningEffort,
		);
	const displayedReasoningEffortLabel: string =
		displayedReasoningEffort === null
			? ""
			: getReasoningEffortLabel(displayedReasoningEffort, t);
	const modelButtonLabel: string =
		displayedReasoningEffort === null
			? selectedModelLabel
			: `${selectedModelLabel} · ${displayedReasoningEffortLabel}`;
	const selectedWorkspaceKey: string =
		selectedWorkspace === null
			? NO_WORKSPACE_KEY
			: createWorkspaceKey(selectedWorkspace.id);
	const selectedWorkspaceLabel: string =
		selectedWorkspace?.name ?? t("composer.workspace.noWorkspace");
	const canUseWorktrees: boolean =
		workspaceSupportsWorktrees(selectedWorkspace);
	const canAddContext: boolean =
		onAddFiles !== undefined ||
		onAddFolder !== undefined ||
		onAddImages !== undefined ||
		onAddContextFiles !== undefined;
	const canOpenComposerOptions: boolean =
		canAddContext || onModeChange !== undefined;
	const showWorkspaceFooter: boolean =
		onWorkspaceSelect !== undefined ||
		onWorkspaceAdd !== undefined ||
		onWorkspaceClear !== undefined ||
		worktreeMode !== undefined;
	const approvalModeLabel: string =
		approvalMode === "full-trust"
			? t("composer.approvalMode.fullTrust")
			: approvalMode === "auto-safe"
				? t("composer.approvalMode.autoSafe")
				: t("composer.approvalMode.manual");
	const composerOptionsMenu: MenuProps = useMemo(
		(): MenuProps => ({
			items: createComposerOptionsItems(t, {
				includeContext: canAddContext,
				includeMode: onModeChange !== undefined,
				allowedModes,
			}),
			onClick: handleComposerOptionsClick,
		}),
		[
			allowedModes,
			canAddContext,
			handleComposerOptionsClick,
			onModeChange,
			t,
		],
	);
	const textAreaContextMenu: MenuProps = useMemo(
		(): MenuProps => ({
			items: [
				{ key: "cut", label: t("composer.textAreaMenu.cut") },
				{ key: "copy", label: t("composer.textAreaMenu.copy") },
				{ key: "paste", label: t("composer.textAreaMenu.paste") },
				{
					key: "select-all",
					label: t("composer.textAreaMenu.selectAll"),
				},
			],
			onClick: handleTextAreaContextAction,
		}),
		[handleTextAreaContextAction, t],
	);
	const approvalModeMenu: MenuProps = useMemo(
		(): MenuProps => ({
			items: createApprovalModeItems(t),
			selectedKeys: [approvalMode],
			onClick: handleApprovalModeClick,
		}),
		[approvalMode, handleApprovalModeClick, t],
	);
	const workspaceFooterMenu: MenuProps = useMemo(
		(): MenuProps => ({
			items: workspaceFooterItems,
			selectedKeys: [selectedWorkspaceKey],
			onClick: handleWorkspaceClick,
		}),
		[handleWorkspaceClick, selectedWorkspaceKey, workspaceFooterItems],
	);
	const hasCompletion: boolean =
		completionToken !== null && completionOptions.length > 0;
	const isFloatingComposerCollapsed: boolean =
		floating &&
		!isFloatingComposerFocused &&
		!isSending &&
		!isCancelling &&
		!hasCompletion;

	useEffect((): void => {
		if (selectedCompletionIndex >= completionOptions.length) {
			setSelectedCompletionIndex(
				Math.max(0, completionOptions.length - 1),
			);
		}
	}, [completionOptions.length, selectedCompletionIndex]);

	useEffect((): void => {
		const nativeTextArea: HTMLTextAreaElement | null = getNativeTextArea(
			textAreaRef.current,
		);
		if (
			nativeTextArea === null ||
			document.activeElement !== nativeTextArea
		) {
			return;
		}

		refreshCompletion(draftMessage, nativeTextArea.selectionStart);
	}, [slashCommands, skills]);

	useEffect((): void => {
		setDraftMessage(message);
		suppressedCompletionValueRef.current = null;
		hideCompletion();
	}, [message]);

	useEffect((): (() => void) | void => {
		if (
			inputRequest === undefined ||
			inputRequest.requestId === lastInputRequestIdRef.current
		) {
			return;
		}

		lastInputRequestIdRef.current = inputRequest.requestId;
		setDraftMessage(inputRequest.message);
		suppressedCompletionValueRef.current = null;
		hideCompletion();
		onDraftChange?.(inputRequest.message);
		const animationFrameId: number = window.requestAnimationFrame(
			(): void => {
				const nativeTextArea: HTMLTextAreaElement | null =
					getNativeTextArea(textAreaRef.current);
				if (nativeTextArea === null) {
					return;
				}

				nativeTextArea.focus({ preventScroll: true });
				const caretIndex: number = inputRequest.message.length;
				nativeTextArea.setSelectionRange(caretIndex, caretIndex);
				textAreaSelectionRef.current = {
					start: caretIndex,
					end: caretIndex,
				};
			},
		);

		return (): void => window.cancelAnimationFrame(animationFrameId);
	}, [inputRequest, onDraftChange]);

	const handleProviderModelClick: MenuProps["onClick"] = useCallback(
		({ key }): void => {
			const selectedKey: string = String(key);
			const nextReasoningEffort: string | null =
				parseReasoningEffortKey(selectedKey);
			if (
				nextReasoningEffort !== null &&
				reasoningEffortOptions.some(
					(option: ProviderReasoningEffortOption): boolean =>
						option.id === nextReasoningEffort,
				)
			) {
				onReasoningEffortChange?.(nextReasoningEffort);
				return;
			}

			const nextSelectedModel: SelectedModel | null =
				parseModelKey(selectedKey);

			if (nextSelectedModel === null) {
				return;
			}

			onProviderModelChange?.(
				nextSelectedModel.provider,
				nextSelectedModel.model,
			);
		},
		[
			onProviderModelChange,
			onReasoningEffortChange,
			reasoningEffortOptions,
		],
	);
	const providerModelMenuItems: MenuProps["items"] = useMemo(
		(): MenuProps["items"] =>
			createProviderModelAndReasoningItems(
				providerModelSelection,
				reasoningEffortOptions,
				t,
				{ flattenProviders: layout === "mobile" },
			),
		[layout, providerModelSelection, reasoningEffortOptions, t],
	);
	const mobileMenuRootClassName: string =
		layout === "mobile" ? styles.mobileMenuRoot : "";
	const providerModelMenu: MenuProps = useMemo(
		(): MenuProps => ({
			items: providerModelMenuItems,
			selectedKeys: [
				...(selectedModelKey === undefined ? [] : [selectedModelKey]),
				...(displayedReasoningEffort === null
					? []
					: [createReasoningEffortKey(displayedReasoningEffort)]),
			],
			onClick: handleProviderModelClick,
			expandIcon: <Icon name="arrow-forward" />,
		}),
		[
			displayedReasoningEffort,
			handleProviderModelClick,
			providerModelMenuItems,
			selectedModelKey,
		],
	);

	function clearDraftMessage(): void {
		setDraftMessage("");
		onDraftChange?.("");
		suppressedCompletionValueRef.current = null;
		hideCompletion();
	}

	function submitMessage(): void {
		if (isAddingTextAttachment) {
			return;
		}
		if (isSending && !allowQueue) {
			if (!isCancelling) onCancel?.();
			return;
		}
		const modeCommand = parseComposerModeCommand(draftMessage);
		const allowedModeCommand =
			modeCommand !== null &&
			(allowedModes === undefined ||
				allowedModes.includes(modeCommand.mode))
				? modeCommand
				: null;
		const trimmedMessage: string =
			allowedModeCommand?.message ?? draftMessage.trim();
		const hasSubmittableContent: boolean =
			trimmedMessage.length > 0 || composerContextItems.length > 0;
		if (!hasSubmittableContent && allowedModeCommand !== null) {
			clearDraftMessage();
			onModeChange?.(allowedModeCommand.mode);
			return;
		}
		if (!hasSubmittableContent && isSending) {
			if (isCancelling) {
				return;
			}
			onCancel?.();
			return;
		}
		if (!hasSubmittableContent) {
			return;
		}

		clearDraftMessage();
		onSubmit?.(trimmedMessage, allowedModeCommand?.mode);
	}

	function submitGuideMessage(): void {
		const trimmedMessage: string = draftMessage.trim();
		if (trimmedMessage.length === 0) {
			return;
		}

		clearDraftMessage();
		onGuideSubmit?.(trimmedMessage);
	}

	function hideCompletion(): void {
		if (completionStateSignatureRef.current.length === 0) {
			return;
		}

		completionStateSignatureRef.current = "";
		setCompletionToken(null);
		setCompletionOptions([]);
		setSelectedCompletionIndex(0);
	}

	function refreshCompletion(
		nextMessage: string,
		selectionStart: number,
	): void {
		if (
			suppressedCompletionValueRef.current !== null &&
			suppressedCompletionValueRef.current === nextMessage
		) {
			hideCompletion();
			return;
		}

		const nextToken: ComposerCompletionToken | null = getCompletionToken(
			nextMessage,
			selectionStart,
		);
		if (nextToken?.trigger === "/" && slashCommands.length === 0) {
			onCompletionOpen?.(nextToken.trigger);
		}
		if (nextToken?.trigger === "@" && skills.length === 0) {
			onCompletionOpen?.(nextToken.trigger);
		}

		const nextOptions: ComposerCompletionOption[] = createCompletionOptions(
			{
				commands: slashCommands,
				skills,
				token: nextToken,
			},
		).slice(0, 7);

		if (nextToken === null || nextOptions.length === 0) {
			hideCompletion();
			return;
		}

		const nextSignature: string = createCompletionSignature(
			nextToken,
			nextOptions,
		);
		if (completionStateSignatureRef.current === nextSignature) {
			return;
		}

		completionStateSignatureRef.current = nextSignature;
		setCompletionToken(nextToken);
		setCompletionOptions(nextOptions);
		setSelectedCompletionIndex((currentIndex: number): number =>
			Math.max(0, Math.min(currentIndex, nextOptions.length - 1)),
		);
	}

	function setSelectionAfterRender(caretIndex: number): void {
		window.requestAnimationFrame((): void => {
			const nativeTextArea: HTMLTextAreaElement | null =
				getNativeTextArea(textAreaRef.current);
			if (nativeTextArea === null) {
				return;
			}

			nativeTextArea.focus();
			nativeTextArea.setSelectionRange(caretIndex, caretIndex);
		});
	}

	async function expandTextAttachment(
		item: AdditionalContextItem,
	): Promise<void> {
		const attachmentId: string | null = getTextAttachmentId(item);
		if (
			attachmentId === null ||
			expandingTextAttachmentIdsRef.current.has(attachmentId)
		) {
			return;
		}

		expandingTextAttachmentIdsRef.current.add(attachmentId);
		try {
			const result = await fetchTextAttachmentContent(attachmentId);
			const nativeTextArea: HTMLTextAreaElement | null =
				getNativeTextArea(textAreaRef.current);
			const value: string = nativeTextArea?.value ?? draftMessage;
			const origin = getComposerPasteOrigin(item);
			const fallbackSelection: TextAreaSelection =
				textAreaSelectionRef.current;
			const range =
				origin === null
					? {
							start: Math.max(
								0,
								Math.min(fallbackSelection.start, value.length),
							),
							end: Math.max(
								0,
								Math.min(fallbackSelection.end, value.length),
							),
						}
					: resolveComposerPasteRange(value, origin);
			const nextMessage: string = `${value.slice(0, range.start)}${result.content}${value.slice(range.end)}`;
			suppressedCompletionValueRef.current = null;
			hideCompletion();
			setDraftMessage(nextMessage);
			onDraftChange?.(nextMessage);
			onRemoveContext?.(item.id);
			const caretIndex: number = range.start + result.content.length;
			textAreaSelectionRef.current = {
				start: caretIndex,
				end: caretIndex,
			};
			setSelectionAfterRender(caretIndex);
		} catch (error: unknown) {
			console.error("[Composer] expand pasted text failed", error);
		} finally {
			expandingTextAttachmentIdsRef.current.delete(attachmentId);
		}
	}

	function applyCompletion(option: ComposerCompletionOption): void {
		if (completionToken === null) {
			return;
		}

		const replacement = replaceCompletionToken(
			draftMessage,
			completionToken,
			option.insertText,
		);
		suppressedCompletionValueRef.current =
			option.trigger === "/" ? replacement.value : null;
		hideCompletion();
		setDraftMessage(replacement.value);
		onDraftChange?.(replacement.value);
		setSelectionAfterRender(replacement.caretIndex);
	}

	function handleTextAreaChange(
		event: React.ChangeEvent<HTMLTextAreaElement>,
	): void {
		const nextMessage: string = event.target.value;

		if (suppressedCompletionValueRef.current !== nextMessage) {
			suppressedCompletionValueRef.current = null;
		}

		setDraftMessage(nextMessage);
		onDraftChange?.(nextMessage);
		refreshCompletion(nextMessage, event.target.selectionStart);
	}

	function handleTextAreaKeyDown(
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	): void {
		if (isComposing || event.nativeEvent.isComposing) {
			return;
		}

		if (event.key === "Enter" && event.ctrlKey && !event.shiftKey) {
			event.preventDefault();
			submitGuideMessage();
			return;
		}

		if (hasCompletion) {
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSelectedCompletionIndex((currentIndex: number): number => {
					return (
						(currentIndex - 1 + completionOptions.length) %
						completionOptions.length
					);
				});
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSelectedCompletionIndex((currentIndex: number): number => {
					return (currentIndex + 1) % completionOptions.length;
				});
				return;
			}

			if (event.key === "Escape") {
				event.preventDefault();
				hideCompletion();
				return;
			}

			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				applyCompletion(completionOptions[selectedCompletionIndex]);
				return;
			}
		}

		if (event.key !== "Enter" || event.shiftKey) {
			return;
		}

		event.preventDefault();
		submitMessage();
	}

	function handleTextAreaSelection(
		event: React.SyntheticEvent<HTMLTextAreaElement>,
	): void {
		const textArea: HTMLTextAreaElement = event.currentTarget;
		textAreaSelectionRef.current = {
			start: textArea.selectionStart,
			end: textArea.selectionEnd,
		};
		refreshCompletion(textArea.value, textArea.selectionStart);
	}

	function handleTextAreaContextMenu(
		event: React.MouseEvent<HTMLTextAreaElement>,
	): void {
		textAreaSelectionRef.current = {
			start: event.currentTarget.selectionStart,
			end: event.currentTarget.selectionEnd,
		};
	}

	function handleTextAreaCopy(
		event: React.ClipboardEvent<HTMLTextAreaElement>,
	): void {
		const textArea: HTMLTextAreaElement = event.currentTarget;
		const selectionStart: number = textArea.selectionStart;
		const selectionEnd: number = textArea.selectionEnd;
		const selectedText: string = textArea.value.slice(
			selectionStart,
			selectionEnd,
		);
		if (selectedText.length === 0) {
			return;
		}

		event.preventDefault();
		void copyTextToClipboard(selectedText).catch((error: unknown): void => {
			console.error("[Composer] native copy failed", error);
		});
	}

	function addContextFiles(files: File[]): boolean {
		if (onAddContextFiles === undefined) {
			return false;
		}

		if (files.length === 0) {
			return false;
		}

		onAddContextFiles(files);
		return true;
	}

	function addContextFilesFromList(fileList: FileList | null): boolean {
		return addContextFiles(Array.from(fileList ?? []));
	}

	function handleTextAreaPaste(
		event: React.ClipboardEvent<HTMLTextAreaElement>,
	): void {
		const files: File[] = Array.from(event.clipboardData.files);
		if (files.length === 0) {
			for (const item of Array.from(event.clipboardData.items)) {
				if (item.kind !== "file") {
					continue;
				}
				const file: File | null = item.getAsFile();
				if (file !== null) {
					files.push(file);
				}
			}
		}

		if (addContextFiles(files)) {
			event.preventDefault();
			return;
		}

		const text: string = event.clipboardData.getData("text/plain");
		const textArea: HTMLTextAreaElement = event.currentTarget;
		const selectionStart: number = textArea.selectionStart;
		const selectionEnd: number = textArea.selectionEnd;
		if (
			isLongPastedText(text) &&
			onAddPastedTextAttachment?.({
				content: text,
				origin: createComposerPasteOrigin(
					textArea.value,
					selectionStart,
					selectionEnd,
				),
			}) === true
		) {
			event.preventDefault();
			return;
		}

		if (text.length === 0) {
			return;
		}

		event.preventDefault();
		const nextMessage: string = `${textArea.value.slice(0, selectionStart)}${text}${textArea.value.slice(selectionEnd)}`;
		suppressedCompletionValueRef.current = null;
		setDraftMessage(nextMessage);
		onDraftChange?.(nextMessage);
		setSelectionAfterRender(selectionStart + text.length);
		refreshCompletion(nextMessage, selectionStart + text.length);
	}

	function handleTextAreaDragOver(
		event: React.DragEvent<HTMLTextAreaElement>,
	): void {
		if (event.dataTransfer.types.includes("Files")) {
			event.preventDefault();
			event.stopPropagation();
			event.dataTransfer.dropEffect = "copy";
		}
	}

	function handleTextAreaDrop(
		event: React.DragEvent<HTMLTextAreaElement>,
	): void {
		if (!event.dataTransfer.types.includes("Files")) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		addContextFilesFromList(event.dataTransfer.files);
	}

	const contextUsageContent: React.ReactNode =
		contextUsage === null ? (
			<div
				className={
					contextUsageError === null
						? styles.contextUsageLoading
						: styles.contextUsageError
				}
			>
				{contextUsageError === null ? (
					<>
						<Spin size="small" />
						<Typography.Text type="secondary">
							{t("composer.contextUsage.estimating")}
						</Typography.Text>
					</>
				) : (
					<>
						<Typography.Text type="danger">
							{contextUsageError}
						</Typography.Text>
						<Button
							size="small"
							onClick={(): void => {
								void refreshContextUsage();
							}}
						>
							{t("composer.contextUsage.retry")}
						</Button>
					</>
				)}
			</div>
		) : (
			<div className={styles.contextUsagePanel}>
				<div className={styles.contextUsageHeader}>
					<div className={styles.contextUsageTitleRow}>
						<Typography.Text strong>
							{t("composer.contextUsage.usedTokens", {
								used: formatTokenCount(
									contextUsage.committedTokens ??
										contextUsage.usedTokens,
								),
								total: formatTokenCount(
									contextUsage.contextWindowTokens,
								),
							})}
						</Typography.Text>
						<Typography.Text type="secondary">
							{(
								contextUsage.committedPercent ??
								contextUsage.percent
							).toFixed(1)}
							%
						</Typography.Text>
					</div>
					<Typography.Text
						type="secondary"
						className={styles.contextUsageMeta}
					>
						{t("composer.contextUsage.meta", {
							model: contextUsage.modelLabel,
							available: formatTokenCount(
								contextUsage.availableTokens,
							),
							source: contextUsage.estimationSource,
						})}
					</Typography.Text>
				</div>
				<Progress
					percent={contextSegmentAllocation.outputEndPercent}
					success={{
						percent: contextSegmentAllocation.inputEndPercent,
						strokeColor: CONTEXT_INPUT_COLOR,
					}}
					showInfo={false}
					strokeColor={CONTEXT_OUTPUT_RESERVE_COLOR}
					railColor={contextUsageRailColor}
					className={styles.contextUsage}
				/>
				<div className={styles.contextUsageLegend}>
					{[
						{
							key: "input",
							color: CONTEXT_INPUT_COLOR,
							tokens: contextUsage.inputTokens ?? 0,
							percent: contextUsage.inputPercent ?? 0,
						},
						{
							key: "outputReserve",
							color: CONTEXT_OUTPUT_RESERVE_COLOR,
							tokens: contextUsage.outputReserveTokens,
							percent: contextUsage.outputReservePercent ?? 0,
						},
						{
							key: "safetyMargin",
							color: CONTEXT_SAFETY_MARGIN_COLOR,
							tokens: contextUsage.safetyMarginTokens,
							percent: contextUsage.safetyMarginPercent ?? 0,
						},
					].map((item) => (
						<div
							className={styles.contextUsageLegendItem}
							key={item.key}
						>
							<span
								className={styles.contextUsageSwatch}
								style={{ background: item.color }}
							/>
							<span>
								{t(`composer.contextUsage.legend.${item.key}`)}
							</span>
							<span>
								{formatTokenCount(item.tokens)}{" "}
								<span
									className={styles.contextUsageLegendPercent}
								>
									{item.percent.toFixed(1)}%
								</span>
							</span>
						</div>
					))}
				</div>
				<div className={styles.contextUsagePressure}>
					<Typography.Text type="secondary">
						{t("composer.contextUsage.pressureLevel", {
							level: t(
								`composer.contextUsage.pressureLevels.${contextUsage.pressure}`,
							),
						})}
					</Typography.Text>
					<Typography.Text type="secondary" ellipsis>
						{t("composer.contextUsage.largestContributor", {
							largest:
								contextUsage.largestContributor === null
									? t("composer.contextUsage.none")
									: t(
											`composer.contextUsage.breakdown.kinds.${contextUsage.largestContributor.kind}`,
										),
						})}
					</Typography.Text>
				</div>
				<div className={styles.contextUsageBreakdown}>
					{contextUsage.breakdown.map((item) => (
						<div className={styles.contextUsageRow} key={item.kind}>
							<span className={styles.contextUsageLabel}>
								{t(
									`composer.contextUsage.breakdown.kinds.${item.kind}`,
								)}
							</span>
							<span className={styles.contextUsageValue}>
								{formatTokenCount(item.tokens)}
							</span>
							<span className={styles.contextUsagePercent}>
								{item.percent.toFixed(1)}%
							</span>
						</div>
					))}
				</div>
				{contextUsageError === null ? null : (
					<Typography.Text
						type="danger"
						className={styles.contextUsageMeta}
					>
						{contextUsageError}
					</Typography.Text>
				)}
				{contextCompressionNotice === null ? null : (
					<Typography.Text
						type="secondary"
						className={styles.contextUsageNotice}
					>
						{contextCompressionNotice}
					</Typography.Text>
				)}
				<Tooltip title={compressDisabledReason ?? undefined}>
					<span className={styles.contextUsageCompressWrap}>
						<Button
							block={true}
							loading={isCompressingContext}
							disabled={
								isCompressingContext ||
								isSending ||
								!contextUsage.canCompress
							}
							onClick={(): void => {
								void handleCompressContext();
							}}
						>
							{t("composer.contextUsage.compress")}
						</Button>
					</span>
				</Tooltip>
			</div>
		);
	const modelButton: React.JSX.Element = (
		<Button
			type="text"
			className={styles.modelButton}
			data-testid="composer-model-button"
			aria-label={modelButtonLabel}
			disabled={providerModelSelection === null}
			onClick={!hasConfiguredProviders ? onConfigureProvider : undefined}
		>
			<span className={styles.modelButtonContent}>
				<span className={styles.modelButtonText}>
					{selectedModelLabel}
				</span>
				{displayedReasoningEffort === null ? null : (
					<span className={styles.modelButtonEffort}>
						{displayedReasoningEffortLabel}
					</span>
				)}
			</span>
		</Button>
	);
	const isStopAction: boolean =
		isSending &&
		(!allowQueue ||
			(draftMessage.trim().length === 0 &&
				composerContextItems.length === 0));

	return (
		<div
			ref={rootRef}
			data-studio-composer="true"
			className={[
				styles.composerRoot,
				layout === "mobile" ? styles.composerRootMobile : "",
				compact ? styles.composerRootCompact : "",
				floating ? styles.composerRootFloating : "",
				isFloatingComposerCollapsed
					? styles.composerRootFloatingCollapsed
					: "",
			]
				.filter(Boolean)
				.join(" ")}
			onFocusCapture={handleFloatingComposerFocus}
			onBlurCapture={handleFloatingComposerBlur}
			onPointerDownCapture={handleFloatingComposerFocus}
		>
			<input
				ref={imageInputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				multiple={true}
				hidden={true}
				onChange={handleImageInputChange}
			/>
			<div className={styles.composerInputWrap}>
				<div className={styles.composerSurface}>
					{hasCompletion ? (
						<div
							className={styles.completionPanel}
							role="listbox"
							aria-label="Composer completions"
						>
							{completionOptions.map(
								(
									option: ComposerCompletionOption,
									index: number,
								): React.ReactNode => {
									const isSelected: boolean =
										index === selectedCompletionIndex;

									return (
										<button
											key={`${option.trigger}:${option.key}`}
											type="button"
											className={`${styles.completionItem} ${isSelected ? styles.completionItemSelected : ""}`}
											role="option"
											aria-selected={isSelected}
											onMouseDown={(
												event: React.MouseEvent<HTMLButtonElement>,
											): void => {
												event.preventDefault();
												applyCompletion(option);
											}}
											onMouseEnter={(): void => {
												setSelectedCompletionIndex(
													index,
												);
											}}
										>
											<span
												className={
													styles.completionLabel
												}
											>
												{option.label}
											</span>
											<span
												className={
													styles.completionDescription
												}
											>
												{option.description}
											</span>
										</button>
									);
								},
							)}
						</div>
					) : null}
					{composerContextItems.length > 0 ? (
						<div className={styles.contextArea}>
							<AdditionalContextStrip
								items={composerContextItems}
								align="start"
								interactive={true}
								onTogglePin={(
									contextId: string,
									pinned: boolean,
								): void => {
									onPinContext?.(contextId, pinned);
								}}
								onRemove={(contextId: string): void => {
									onRemoveContext?.(contextId);
								}}
								onExpandTextAttachment={(
									item: AdditionalContextItem,
								): void => {
									void expandTextAttachment(item);
								}}
							/>
						</div>
					) : null}
					<Dropdown
						menu={textAreaContextMenu}
						trigger={["contextMenu"]}
					>
						<div
							className={styles.composerTextAreaContextTarget}
							data-studio-input-context-menu="custom"
						>
							<Input.TextArea
								ref={textAreaRef}
								data-testid="composer-input"
								aria-label={textAreaPlaceholder}
								value={draftMessage}
								autoSize={
									layout === "mobile"
										? { minRows: 2, maxRows: 5 }
										: compact
											? { minRows: 1, maxRows: 1 }
											: { minRows: 4, maxRows: 6 }
								}
								disabled={isSending && !allowQueue}
								placeholder={textAreaPlaceholder}
								className={styles.composerTextArea}
								onChange={handleTextAreaChange}
								onKeyDown={handleTextAreaKeyDown}
								onSelect={handleTextAreaSelection}
								onContextMenu={handleTextAreaContextMenu}
								onCopy={handleTextAreaCopy}
								onPaste={handleTextAreaPaste}
								onDragOver={handleTextAreaDragOver}
								onDrop={handleTextAreaDrop}
								onCompositionStart={(): void => {
									setIsComposing(true);
								}}
								onCompositionEnd={(
									event: React.CompositionEvent<HTMLTextAreaElement>,
								): void => {
									setIsComposing(false);
									refreshCompletion(
										event.currentTarget.value,
										event.currentTarget.selectionStart,
									);
								}}
							/>
						</div>
					</Dropdown>
					<div className={styles.composerToolbar}>
						{canOpenComposerOptions ? (
							<div className={styles.composerToolbarControl}>
								<Tooltip
									title={t(
										"composer.tooltips.contextAndMode",
									)}
								>
									<Dropdown
										rootClassName={[
											styles.composerOptionsDropdown,
											mobileMenuRootClassName,
										]
											.filter(Boolean)
											.join(" ")}
										placement="topLeft"
										autoAdjustOverflow={true}
										menu={composerOptionsMenu}
										trigger={["click"]}
									>
										<Button
											type="text"
											shape="circle"
											data-testid="composer-options-button"
											aria-label={t(
												"composer.tooltips.contextAndMode",
											)}
											icon={
												<Icon
													name="add"
													className={
														styles.composerActionIcon
													}
												/>
											}
										/>
									</Dropdown>
								</Tooltip>
							</div>
						) : null}
						{canAddContext ? <Divider vertical={true} /> : null}

						<div className={styles.composerToolbarControl}>
							<Tooltip
								title={t("composer.tooltips.approvalMode")}
							>
								<Dropdown
									menu={approvalModeMenu}
									disabled={isApprovalModeSaving}
									trigger={["click"]}
								>
									<Button
										type="text"
										aria-label={approvalModeLabel}
										loading={isApprovalModeSaving}
										icon={
											<Icon
												name={
													approvalMode ===
													"full-trust"
														? "warning"
														: approvalMode ===
															  "auto-safe"
															? "shield"
															: "hand"
												}
											/>
										}
										className={styles.approvalModeButton}
									>
										<span
											className={styles.approvalModeText}
										>
											{approvalModeLabel}
										</span>
									</Button>
								</Dropdown>
							</Tooltip>
						</div>

						<Divider vertical={true} />

						<div className={styles.composerToolbarModelControl}>
							<Tooltip
								title={
									hasConfiguredProviders
										? t("composer.tooltips.model")
										: t("composer.model.configureProvider")
								}
							>
								{hasConfiguredProviders ? (
									<Dropdown
										rootClassName={[
											styles.modelDropdown,
											mobileMenuRootClassName,
										]
											.filter(Boolean)
											.join(" ")}
										placement="topRight"
										autoAdjustOverflow={true}
										menu={providerModelMenu}
										trigger={["click"]}
									>
										{modelButton}
									</Dropdown>
								) : (
									modelButton
								)}
							</Tooltip>
						</div>

						<div className={styles.composerToolbarControl}>
							<Tooltip
								title={
									isCancelling
										? t("composer.send.stopping")
										: isSending && isStopAction
											? t("composer.send.stop")
											: isSending
												? t("composer.send.queue")
												: t("composer.send.send")
								}
							>
								<Button
									type="text"
									shape="circle"
									aria-label={
										isCancelling
											? t("composer.send.stopping")
											: isSending && isStopAction
												? t("composer.send.stop")
												: isSending
													? t("composer.send.queue")
													: t("composer.send.send")
									}
									icon={
										<Icon
											name={
												isStopAction ? "stop" : "send"
											}
										/>
									}
									className={styles.composerSendButton}
									disabled={
										isCancelling ||
										isAddingTextAttachment ||
										(!isSending &&
											draftMessage.trim().length === 0 &&
											composerContextItems.length === 0)
									}
									onClick={submitMessage}
								/>
							</Tooltip>
						</div>
					</div>
				</div>
			</div>

			{showWorkspaceFooter ? (
				<footer className={styles.footer}>
					<Flex
						align="start"
						justify="space-between"
						gap={8}
						className={styles.workspaceFooterRow}
					>
						<Flex
							align="center"
							gap={6}
							className={styles.workspaceFooterControls}
						>
							<Dropdown
								disabled={
									workspaceFooterDisabled ||
									isWorktreePreparing
								}
								menu={workspaceFooterMenu}
								trigger={["click"]}
							>
								<Button
									type="text"
									size="small"
									disabled={
										workspaceFooterDisabled ||
										isWorktreePreparing
									}
									icon={
										selectedWorkspace === null ? (
											<Icon name="close" />
										) : (
											<WorkspaceIconView
												workspace={selectedWorkspace}
											/>
										)
									}
									className={styles.workspaceFooterButton}
								>
									<span
										className={styles.workspaceFooterText}
									>
										{selectedWorkspaceLabel}
									</span>
								</Button>
							</Dropdown>
							{worktreeMode !== undefined &&
							selectedWorkspace !== null &&
							canUseWorktrees ? (
								<Tooltip
									title={worktreeDisabledReason ?? undefined}
								>
									<span>
										<Segmented
											value={worktreeMode}
											disabled={isWorktreePreparing}
											options={[
												{
													label: t(
														"composer.worktree.local",
													),
													value: "local",
												},
												{
													label: isWorktreePreparing ? (
														<Spin size="small" />
													) : (
														t(
															"composer.worktree.managed",
														)
													),
													value: "worktree",
													disabled:
														worktreeDisabledReason !==
														null,
												},
											]}
											onChange={(value): void =>
												onWorktreeModeChange?.(
													value as
														| "local"
														| "worktree",
												)
											}
										/>
									</span>
								</Tooltip>
							) : null}
							{worktreeMode === "worktree" &&
							selectedWorkspace !== null &&
							canUseWorktrees &&
							onWorktreeSourceOptionsChange !== undefined ? (
								<WorktreeCreationOptions
									workspace={selectedWorkspace}
									value={worktreeSourceOptions}
									disabled={isWorktreePreparing}
									onChange={onWorktreeSourceOptionsChange}
								/>
							) : null}
						</Flex>
						{showContextUsage ? (
							<Popover
								title={t("composer.contextUsage.title")}
								content={contextUsageContent}
								trigger="click"
							>
								<span className={styles.contextUsageAnchor}>
									<button
										type="button"
										className={styles.contextUsageButton}
										aria-label={t(
											"composer.contextUsage.title",
										)}
									>
										<span
											className={
												styles.contextUsageButtonText
											}
										>
											{Math.round(contextUsagePercent)}%
										</span>
										<Progress
											type="circle"
											percent={contextUsagePercent}
											strokeColor="var(--ds-accent)"
											railColor="var(--ds-border)"
											showInfo={false}
											size={16}
										/>
									</button>
								</span>
							</Popover>
						) : null}
					</Flex>
				</footer>
			) : null}
		</div>
	);
}

export default memo(Composer);
