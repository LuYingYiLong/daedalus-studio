import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Dropdown, Button, Divider, Flex, Tooltip, Popover, Progress, Typography, Spin } from "antd";
import type { MenuProps, ProgressProps } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import styles from "./Composer.module.css";
import type { ApprovalMode } from "@/api/approval-api";
import type { ChatMode } from "@/api/chat-api";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { SkillSummary } from "@/api/skill-api";
import type { AdditionalContextItem, WorkspaceConfig } from "@/api/types";
import type { ProviderModelInfo, ProviderModelSelection, ProviderModelSelectionProvider, ProviderReasoningEffortOption } from "@/api/provider-api";
import { compressSession, estimateContextUsage, type ContextUsageEstimate, type EstimateContextUsageParams } from "@/api/context-api";
import AdditionalContextStrip from "@/features/chat/AdditionalContextStrip";
import { WorkspaceIconView } from "@/features/workspace/workspace-appearance";
import {
	createCompletionOptions,
	getCompletionToken,
	replaceCompletionToken,
	type ComposerCompletionOption,
	type ComposerCompletionToken,
	type ComposerCompletionTrigger
} from "./composer-completion";
import { parseComposerModeCommand } from "./composer-mode-command";
import { copyTextToClipboard, readTextFromClipboard } from "@/shared/lib/clipboard";

export type ComposerProps = {
	providerModelSelection: ProviderModelSelection | null;
	selectedProviderId: string | null;
	selectedModelId: string | null;
	reasoningEffort?: string | null;
	message: string;
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
	onModeChange?: (mode: ChatMode) => void;
	onApprovalModeChange?: (mode: ApprovalMode) => void;
	onProviderModelChange?: (providerId: string, modelId: string) => void;
	onConfigureProvider?: () => void;
	onReasoningEffortChange?: (effort: string) => void;
	onWorkspaceSelect?: (workspaceId: string) => void;
	onWorkspaceAdd?: () => void;
	onWorkspaceClear?: () => void;
	onAddFiles?: () => void;
	onAddFolder?: () => void;
	onAddImages?: (files: File[]) => void;
	onAddContextFiles?: (files: File[]) => void;
	onAddPastedTextAttachment?: (text: string) => boolean;
	onRemoveContext?: (contextId: string) => void;
	onPinContext?: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext?: () => void;
	onCancel?: () => void;
	onSubmit?: (message: string, modeOverride?: ChatMode) => void;
	onGuideSubmit?: (message: string) => void;
	onCompletionOpen?: (trigger: ComposerCompletionTrigger) => void;
};

type SelectedModel = {
	provider: string;
	model: string;
};

type ProgressStrokeColor = NonNullable<ProgressProps["strokeColor"]>;

type TextAreaSelection = {
	start: number;
	end: number;
};

const CONTEXT_USAGE_NORMAL_STROKE: ProgressStrokeColor = {
	"0%": "var(--ds-accent)",
	"100%": "var(--ds-success)",
};
const CONTEXT_USAGE_WARNING_STROKE: ProgressStrokeColor = {
	"0%": "var(--ds-warning)",
	"100%": "var(--ds-warning)",
};
const CONTEXT_USAGE_DANGER_STROKE: ProgressStrokeColor = {
	"0%": "var(--ds-danger)",
	"100%": "var(--ds-danger)",
};

const NO_WORKSPACE_KEY: string = "workspace:none";
const ADD_WORKSPACE_KEY: string = "workspace:add";
const EMPTY_CONTEXT_ITEMS: AdditionalContextItem[] = [];
const CONTEXT_USAGE_REFRESH_INTERVAL_MS: number = 5_000;

function createContextItems(t: TFunction<"common">): MenuProps["items"] {
	return [
		{
			key: "files",
			label: t("composer.context.addFiles"),
		},
		{
			key: "folder",
			label: t("composer.context.addFolder"),
		},
		{
			key: "images",
			label: t("composer.context.addImages"),
		},
	];
}

function createApprovalModeItems(t: TFunction<"common">): MenuProps["items"] {
	return [
		{
			key: "manual",
			label: t("composer.approvalMode.manual"),
			icon: <Icon name="hand" />,
		},
		{
			key: "auto-safe",
			label: t("composer.approvalMode.autoSafe"),
			icon: <Icon name="shield" />,
		},
		{
			key: "full-trust",
			label: t("composer.approvalMode.fullTrust"),
			icon: <Icon name="warning" />,
		},
	];
}

function createModeItems(t: TFunction<"common">): MenuProps["items"] {
	return [
		{
			key: "ask",
			label: t("composer.mode.ask"),
			icon: <Icon name="ask" />
		},
		{
			key: "agent",
			label: t("composer.mode.agent"),
			icon: <Icon name="agent" />
		},
		{
			key: "plan",
			label: t("composer.mode.plan"),
			icon: <Icon name="plan" />
		},
		{
			key: "goal",
			label: t("composer.mode.goal"),
			icon: <Icon name="goal" />
		},
	];
}

function isComposerMode(value: string): value is ChatMode {
	return value === "ask" || value === "agent" || value === "plan" || value === "goal";
}

function isApprovalMode(value: string): value is ApprovalMode {
	return value === "manual" || value === "auto-safe" || value === "full-trust";
}

function createModelKey(provider: string, model: string): string {
	return `model:${provider}:${model}`;
}

function parseModelKey(key: string): SelectedModel | null {
	const prefix = "model:";

	if (!key.startsWith(prefix)) {
		return null;
	}

	const value: string = key.slice(prefix.length);
	const separatorIndex: number = value.indexOf(":");

	if (separatorIndex < 0) {
		return null;
	}

	return {
		provider: value.slice(0, separatorIndex),
		model: value.slice(separatorIndex + 1)
	};
}

function findSelectedProvider(selection: ProviderModelSelection | null, selectedModel: SelectedModel | null): ProviderModelSelectionProvider | null {
	if (selection === null || selectedModel === null) {
		return null;
	}

	return selection.providers.find((provider: ProviderModelSelectionProvider): boolean => {
		return provider.configured && provider.provider === selectedModel.provider;
	}) ?? null;
}

function findSelectedModel(selection: ProviderModelSelection | null, selectedModel: SelectedModel | null): ProviderModelInfo | null {
	const selectedProvider: ProviderModelSelectionProvider | null = findSelectedProvider(selection, selectedModel);

	if (selectedProvider === null || selectedModel === null) {
		return null;
	}

	return selectedProvider.models.find((model: ProviderModelInfo): boolean => {
		return model.id === selectedModel.model;
	}) ?? null;
}

function getSelectedModelLabel(selection: ProviderModelSelection | null, selectedModel: SelectedModel | null, t: TFunction<"common">): string {
	const selectedProvider: ProviderModelSelectionProvider | null = findSelectedProvider(selection, selectedModel);
	const selectedModelInfo: ProviderModelInfo | null = findSelectedModel(selection, selectedModel);

	if (selection !== null && !selection.providers.some((provider: ProviderModelSelectionProvider): boolean => provider.configured)) {
		return t("composer.model.configureProvider");
	}

	if (selectedProvider === null || selectedModel === null) {
		return t("composer.model.fallback");
	}

	return `${selectedProvider.displayName}/${selectedModelInfo?.displayName ?? selectedModel.model}`;
}

function getReasoningEffortLabel(effort: string, t: TFunction<"common">): string {
	const key: string = `composer.reasoning.efforts.${effort}`;
	return t(key, { defaultValue: effort });
}

function resolveDisplayedReasoningEffort(options: readonly ProviderReasoningEffortOption[], requested: string | null | undefined): string | null {
	if (options.length === 0) {
		return null;
	}
	if (requested !== undefined && requested !== null && options.some((option: ProviderReasoningEffortOption): boolean => option.id === requested)) {
		return requested;
	}
	return options.find((option: ProviderReasoningEffortOption): boolean => option.id === "medium")?.id ?? options[0]?.id ?? null;
}

function createProviderModelItems(selection: ProviderModelSelection | null, t: TFunction<"common">): MenuProps["items"] {
	if (selection === null) {
		return [];
	}

	return selection.providers.filter((provider: ProviderModelSelectionProvider): boolean => {
		return provider.configured;
	}).map((provider: ProviderModelSelectionProvider) => {
		return {
			key: `provider:${provider.provider}`,
			popupClassName: styles.modelSubmenuPopup,
			label: <span className={styles.providerGroupLabel}>{provider.displayName}</span>,
			children: provider.models.map((model: ProviderModelInfo) => {
				const modelBadges: string[] = [];

				if (model.capabilities.reasoning) {
					modelBadges.push(t("composer.model.capabilities.reasoning"));
				}

				if (model.capabilities.imageInput) {
					modelBadges.push(t("composer.model.capabilities.vision"));
				}

				if (model.capabilities.webSearch) {
					modelBadges.push(t("composer.model.capabilities.search"));
				}

				return {
					key: createModelKey(provider.provider, model.id),
					label: (
						<span className={styles.modelMenuItem}>
							<span className={styles.modelMenuName}>{model.displayName}</span>
							<span className={styles.modelMenuMeta}>
								{modelBadges.length > 0 ? modelBadges.join(" · ") : model.id}
							</span>
						</span>
					)
				};
			})
		};
	});
}

function createWorkspaceKey(workspaceId: string): string {
	return `workspace:${workspaceId}`;
}

function parseWorkspaceKey(key: string): string | null {
	if (!key.startsWith("workspace:") || key === NO_WORKSPACE_KEY || key === ADD_WORKSPACE_KEY) {
		return null;
	}

	return key.slice("workspace:".length);
}

function createWorkspaceFooterItems(workspaces: readonly WorkspaceConfig[], t: TFunction<"common">): MenuProps["items"] {
	const workspaceItems: MenuProps["items"] = [
		...workspaces.map((workspace: WorkspaceConfig) => {
			return {
				key: createWorkspaceKey(workspace.id),
				label: (
					<span className={styles.workspaceMenuItem}>
						<span className={styles.workspaceMenuName}>{workspace.name}</span>
					</span>
				),
				icon: <WorkspaceIconView workspace={workspace} />
			};
		}),
	];

	return [
		...workspaceItems,
		...(workspaces.length > 0 ? [{
			type: "divider" as const
		}] : []),
		{
			key: NO_WORKSPACE_KEY,
			label: t("composer.workspace.noWorkspace"),
			icon: <Icon name="close" />
		},
		{
			key: ADD_WORKSPACE_KEY,
			label: t("composer.workspace.addWorkspace"),
			icon: <Icon name="add" />
		}
	];
}

function getNativeTextArea(ref: TextAreaRef | null): HTMLTextAreaElement | null {
	return ref?.resizableTextArea?.textArea ?? null;
}

function createCompletionSignature(token: ComposerCompletionToken, options: readonly ComposerCompletionOption[]): string {
	return [
		token.trigger,
		token.query,
		String(token.start),
		String(token.end),
		options.map((option: ComposerCompletionOption): string => option.key).join(",")
	].join(":");
}

function getErrorMessage(error: unknown, t: TFunction<"common">): string {
	if (error instanceof Error) {
		return error.message;
	}
	return t("composer.contextUsage.errors.estimate");
}

function formatTokenCount(tokens: number): string {
	if (!Number.isFinite(tokens)) {
		return "0";
	}

	const absoluteTokens: number = Math.abs(tokens);
	if (absoluteTokens >= 1_000_000) {
		const value: number = tokens / 1_000_000;
		return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}M`;
	}
	if (absoluteTokens >= 1_000) {
		const value: number = tokens / 1_000;
		return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}K`;
	}
	return Math.max(0, Math.round(tokens)).toLocaleString();
}

function getContextUsageStrokeColor(percent: number): ProgressStrokeColor {
	if (percent >= 90) {
		return CONTEXT_USAGE_DANGER_STROKE;
	}
	if (percent >= 70) {
		return CONTEXT_USAGE_WARNING_STROKE;
	}
	return CONTEXT_USAGE_NORMAL_STROKE;
}

function getContextUsageStatus(percent: number): "normal" | "exception" {
	return percent >= 90 ? "exception" : "normal";
}

function Composer({
	providerModelSelection,
	selectedProviderId,
	selectedModelId,
	reasoningEffort,
	message,
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
	showContextUsage = true,
	onModeChange,
	onApprovalModeChange,
	onProviderModelChange,
	onConfigureProvider,
	onReasoningEffortChange,
	onWorkspaceSelect,
	onWorkspaceAdd,
	onWorkspaceClear,
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
	onCompletionOpen
}: ComposerProps): React.JSX.Element {
	const { t } = useTranslation();
	const rootRef = useRef<HTMLDivElement | null>(null);
	const textAreaRef = useRef<TextAreaRef | null>(null);
	const textAreaSelectionRef = useRef<TextAreaSelection>({ start: 0, end: 0 });
	const imageInputRef = useRef<HTMLInputElement | null>(null);
	const suppressedCompletionValueRef = useRef<string | null>(null);
	const completionStateSignatureRef = useRef<string>("");
	const contextUsageRequestRef = useRef<number>(0);
	const contextUsageParamsRef = useRef<EstimateContextUsageParams>({});
	const [draftMessage, setDraftMessage] = useState<string>(message);
	const [completionToken, setCompletionToken] = useState<ComposerCompletionToken | null>(null);
	const [completionOptions, setCompletionOptions] = useState<ComposerCompletionOption[]>([]);
	const [selectedCompletionIndex, setSelectedCompletionIndex] = useState<number>(0);
	const [isComposing, setIsComposing] = useState<boolean>(false);
	const [contextUsage, setContextUsage] = useState<ContextUsageEstimate | null>(null);
	const [contextUsageError, setContextUsageError] = useState<string | null>(null);
	const [isCompressingContext, setIsCompressingContext] = useState<boolean>(false);

	const handleModeClick: MenuProps["onClick"] = useCallback(({ key }): void => {
		if (isComposerMode(key)) {
			onModeChange?.(key);
		}
	}, [onModeChange]);

	const handleApprovalModeClick: MenuProps["onClick"] = useCallback(({ key }): void => {
		if (isApprovalMode(key)) {
			onApprovalModeChange?.(key);
		}
	}, [onApprovalModeChange]);

	const handleWorkspaceClick: MenuProps["onClick"] = useCallback(({ key }): void => {
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
	}, [onWorkspaceAdd, onWorkspaceClear, onWorkspaceSelect, workspaceFooterDisabled]);

	const handleContextItemClick: MenuProps["onClick"] = useCallback(({ key }): void => {
		const selectedKey: string = String(key);
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
	}, [onAddFiles, onAddFolder]);

	const handleTextAreaContextAction: MenuProps["onClick"] = useCallback(({ key }): void => {
		const nativeTextArea: HTMLTextAreaElement | null = getNativeTextArea(textAreaRef.current);
		if (nativeTextArea === null) {
			return;
		}

		const selection: TextAreaSelection = textAreaSelectionRef.current;
		const value: string = nativeTextArea.value;
		const selectedText: string = value.slice(selection.start, selection.end);
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
						.catch((error: unknown): void => console.error("[Composer] cut failed", error));
				}
				return;
			case "copy":
				if (selectedText.length > 0) {
					void copyTextToClipboard(selectedText).catch((error: unknown): void => console.error("[Composer] copy failed", error));
				}
				return;
			case "paste":
				void readTextFromClipboard()
					.then((text: string): void => {
						if (text.trim().length > 100 && onAddPastedTextAttachment?.(text) === true) {
							return;
						}
						replaceSelection(text);
					})
					.catch((error: unknown): void => console.error("[Composer] paste failed", error));
				return;
			case "select-all":
				nativeTextArea.focus();
				nativeTextArea.select();
				textAreaSelectionRef.current = { start: 0, end: value.length };
				refreshCompletion(value, value.length);
				return;
			default:
				return;
		}
	}, [onAddPastedTextAttachment, onDraftChange]);

	function handleImageInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
		const files: File[] = Array.from(event.currentTarget.files ?? []);
		event.currentTarget.value = "";
		if (files.length === 0) {
			return;
		}
		onAddImages?.(files);
	}

	const providerModelItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return createProviderModelItems(providerModelSelection, t);
	}, [providerModelSelection, t]);
	const hasConfiguredProviders: boolean = providerModelSelection?.providers.some(
		(provider: ProviderModelSelectionProvider): boolean => provider.configured
	) ?? false;
	const workspaceFooterItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return createWorkspaceFooterItems(workspaceOptions, t);
	}, [workspaceOptions, t]);
	const selectedModel: SelectedModel | null = selectedProviderId === null || selectedModelId === null
		? null
		: {
			provider: selectedProviderId,
			model: selectedModelId
		};
	contextUsageParamsRef.current = {
		message: draftMessage,
		mode,
		provider: selectedModel?.provider,
		model: selectedModel?.model,
		additionalContext: composerContextItems
	};
	const selectedModelKey: string | undefined = selectedModel === null
		? undefined
		: createModelKey(selectedModel.provider, selectedModel.model);
	const selectedModelLabel: string = getSelectedModelLabel(providerModelSelection, selectedModel, t);
	const selectedModelInfo: ProviderModelInfo | null = findSelectedModel(providerModelSelection, selectedModel);
	const reasoningEffortOptions: readonly ProviderReasoningEffortOption[] = selectedModelInfo?.capabilities.reasoningEfforts ?? [];
	const displayedReasoningEffort: string | null = resolveDisplayedReasoningEffort(reasoningEffortOptions, reasoningEffort);
	const displayedReasoningEffortLabel: string = displayedReasoningEffort === null ? "" : getReasoningEffortLabel(displayedReasoningEffort, t);
	const selectedWorkspaceKey: string = selectedWorkspace === null ? NO_WORKSPACE_KEY : createWorkspaceKey(selectedWorkspace.id);
	const selectedWorkspaceLabel: string = selectedWorkspace?.name ?? t("composer.workspace.noWorkspace");
	const approvalModeLabel: string = approvalMode === "full-trust"
		? t("composer.approvalMode.fullTrust")
		: approvalMode === "auto-safe"
			? t("composer.approvalMode.autoSafe")
			: t("composer.approvalMode.manual");
	const contextMenu: MenuProps = useMemo((): MenuProps => ({
		items: createContextItems(t),
		onClick: handleContextItemClick
	}), [handleContextItemClick, t]);
	const textAreaContextMenu: MenuProps = useMemo((): MenuProps => ({
		items: [
			{ key: "cut", label: t("composer.textAreaMenu.cut") },
			{ key: "copy", label: t("composer.textAreaMenu.copy") },
			{ key: "paste", label: t("composer.textAreaMenu.paste") },
			{ key: "select-all", label: t("composer.textAreaMenu.selectAll") }
		],
		onClick: handleTextAreaContextAction
	}), [handleTextAreaContextAction, t]);
	const modeMenu: MenuProps = useMemo((): MenuProps => ({
		items: createModeItems(t),
		selectedKeys: [mode],
		onClick: handleModeClick
	}), [handleModeClick, mode, t]);
	const approvalModeMenu: MenuProps = useMemo((): MenuProps => ({
		items: createApprovalModeItems(t),
		selectedKeys: [approvalMode],
		onClick: handleApprovalModeClick
	}), [approvalMode, handleApprovalModeClick, t]);
	const reasoningEffortMenu: MenuProps = useMemo((): MenuProps => ({
		items: reasoningEffortOptions.map((option: ProviderReasoningEffortOption) => ({
			key: option.id,
			label: getReasoningEffortLabel(option.id, t)
		})),
		selectedKeys: displayedReasoningEffort === null ? [] : [displayedReasoningEffort],
		onClick: ({ key }): void => {
			onReasoningEffortChange?.(String(key));
		}
	}), [displayedReasoningEffort, onReasoningEffortChange, reasoningEffortOptions, t]);
	const workspaceFooterMenu: MenuProps = useMemo((): MenuProps => ({
		items: workspaceFooterItems,
		selectedKeys: [selectedWorkspaceKey],
		onClick: handleWorkspaceClick
	}), [handleWorkspaceClick, selectedWorkspaceKey, workspaceFooterItems]);
	const hasCompletion: boolean = completionToken !== null && completionOptions.length > 0;
	const contextUsagePercent: number = contextUsage?.percent ?? 0;
	const contextUsageStrokeColor: ProgressStrokeColor = getContextUsageStrokeColor(contextUsagePercent);
	const contextUsageStatus: "normal" | "exception" = getContextUsageStatus(contextUsagePercent);
	const compressDisabledReason: string | null = isSending
		? t("composer.contextUsage.compressDisabled.sending")
		: contextUsage?.canCompress === false
			? contextUsage.compressReason ?? t("composer.contextUsage.compressDisabled.unavailable")
			: null;

	useEffect((): void => {
		if (selectedCompletionIndex >= completionOptions.length) {
			setSelectedCompletionIndex(Math.max(0, completionOptions.length - 1));
		}
	}, [completionOptions.length, selectedCompletionIndex]);

	useEffect((): void => {
		const nativeTextArea: HTMLTextAreaElement | null = getNativeTextArea(textAreaRef.current);
		if (nativeTextArea === null || document.activeElement !== nativeTextArea) {
			return;
		}

		refreshCompletion(draftMessage, nativeTextArea.selectionStart);
	}, [slashCommands, skills]);

	useEffect((): void => {
		setDraftMessage(message);
		suppressedCompletionValueRef.current = null;
		hideCompletion();
	}, [message]);

	useEffect((): (() => void) => {
		if (!showContextUsage) {
			setContextUsage(null);
			setContextUsageError(null);
			return (): void => { };
		}

		let disposed: boolean = false;
		let inFlight: boolean = false;
		const pollContextUsage = async (): Promise<void> => {
			if (inFlight) return;
			inFlight = true;
			const requestId: number = ++contextUsageRequestRef.current;
			try {
				const usage: ContextUsageEstimate = await estimateContextUsage(contextUsageParamsRef.current);
				if (disposed || requestId !== contextUsageRequestRef.current) return;
				setContextUsage(usage);
				setContextUsageError(null);
			} catch (error: unknown) {
				if (!disposed && requestId === contextUsageRequestRef.current) {
					setContextUsageError(getErrorMessage(error, t));
				}
			} finally {
				inFlight = false;
			}
		};
		setContextUsageError(null);
		void pollContextUsage();
		const timer: number = window.setInterval((): void => void pollContextUsage(), CONTEXT_USAGE_REFRESH_INTERVAL_MS);

		return (): void => {
			disposed = true;
			contextUsageRequestRef.current += 1;
			window.clearInterval(timer);
		};
	}, [mode, selectedModel?.provider, selectedModel?.model, composerContextItems, showContextUsage, t]);

	const handleProviderModelClick: MenuProps["onClick"] = useCallback(({ key }): void => {
		const nextSelectedModel: SelectedModel | null = parseModelKey(String(key));

		if (nextSelectedModel === null) {
			return;
		}

		onProviderModelChange?.(nextSelectedModel.provider, nextSelectedModel.model);
	}, [onProviderModelChange]);
	const providerModelMenu: MenuProps = useMemo((): MenuProps => ({
		items: providerModelItems,
		selectedKeys: selectedModelKey === undefined ? [] : [selectedModelKey],
		onClick: handleProviderModelClick
	}), [handleProviderModelClick, providerModelItems, selectedModelKey]);

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
		const modeCommand = parseComposerModeCommand(draftMessage);
		const trimmedMessage: string = modeCommand?.message ?? draftMessage.trim();
		const hasSubmittableContent: boolean = trimmedMessage.length > 0 || composerContextItems.length > 0;
		if (!hasSubmittableContent && modeCommand !== null) {
			clearDraftMessage();
			onModeChange?.(modeCommand.mode);
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
		onSubmit?.(trimmedMessage, modeCommand?.mode);
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

	function refreshCompletion(nextMessage: string, selectionStart: number): void {
		if (suppressedCompletionValueRef.current !== null && suppressedCompletionValueRef.current === nextMessage) {
			hideCompletion();
			return;
		}

		const nextToken: ComposerCompletionToken | null = getCompletionToken(nextMessage, selectionStart);
		if (nextToken?.trigger === "/" && slashCommands.length === 0) {
			onCompletionOpen?.(nextToken.trigger);
		}
		if (nextToken?.trigger === "@" && skills.length === 0) {
			onCompletionOpen?.(nextToken.trigger);
		}

		const nextOptions: ComposerCompletionOption[] = createCompletionOptions({
			commands: slashCommands,
			skills,
			token: nextToken
		}).slice(0, 7);

		if (nextToken === null || nextOptions.length === 0) {
			hideCompletion();
			return;
		}

		const nextSignature: string = createCompletionSignature(nextToken, nextOptions);
		if (completionStateSignatureRef.current === nextSignature) {
			return;
		}

		completionStateSignatureRef.current = nextSignature;
		setCompletionToken(nextToken);
		setCompletionOptions(nextOptions);
		setSelectedCompletionIndex((currentIndex: number): number => Math.max(0, Math.min(currentIndex, nextOptions.length - 1)));
	}

	function setSelectionAfterRender(caretIndex: number): void {
		window.requestAnimationFrame((): void => {
			const nativeTextArea: HTMLTextAreaElement | null = getNativeTextArea(textAreaRef.current);
			if (nativeTextArea === null) {
				return;
			}

			nativeTextArea.focus();
			nativeTextArea.setSelectionRange(caretIndex, caretIndex);
		});
	}

	function applyCompletion(option: ComposerCompletionOption): void {
		if (completionToken === null) {
			return;
		}

		const replacement = replaceCompletionToken(draftMessage, completionToken, option.insertText);
		suppressedCompletionValueRef.current = option.trigger === "/" ? replacement.value : null;
		hideCompletion();
		setDraftMessage(replacement.value);
		onDraftChange?.(replacement.value);
		setSelectionAfterRender(replacement.caretIndex);
	}

	function handleTextAreaChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
		const nextMessage: string = event.target.value;

		if (suppressedCompletionValueRef.current !== nextMessage) {
			suppressedCompletionValueRef.current = null;
		}

		setDraftMessage(nextMessage);
		onDraftChange?.(nextMessage);
		refreshCompletion(nextMessage, event.target.selectionStart);
	}

	function handleTextAreaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
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
					return (currentIndex - 1 + completionOptions.length) % completionOptions.length;
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

	function handleTextAreaSelection(event: React.SyntheticEvent<HTMLTextAreaElement>): void {
		const textArea: HTMLTextAreaElement = event.currentTarget;
		textAreaSelectionRef.current = {
			start: textArea.selectionStart,
			end: textArea.selectionEnd
		};
		refreshCompletion(textArea.value, textArea.selectionStart);
	}

	function handleTextAreaContextMenu(event: React.MouseEvent<HTMLTextAreaElement>): void {
		textAreaSelectionRef.current = {
			start: event.currentTarget.selectionStart,
			end: event.currentTarget.selectionEnd
		};
	}

	function handleTextAreaCopy(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
		const textArea: HTMLTextAreaElement = event.currentTarget;
		const selectionStart: number = textArea.selectionStart;
		const selectionEnd: number = textArea.selectionEnd;
		const selectedText: string = textArea.value.slice(selectionStart, selectionEnd);
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

	function handleTextAreaPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
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
		if (text.trim().length > 100 && onAddPastedTextAttachment?.(text) === true) {
			event.preventDefault();
			return;
		}

		if (text.length === 0) {
			return;
		}

		event.preventDefault();
		const textArea: HTMLTextAreaElement = event.currentTarget;
		const selectionStart: number = textArea.selectionStart;
		const selectionEnd: number = textArea.selectionEnd;
		const nextMessage: string = `${textArea.value.slice(0, selectionStart)}${text}${textArea.value.slice(selectionEnd)}`;
		suppressedCompletionValueRef.current = null;
		setDraftMessage(nextMessage);
		onDraftChange?.(nextMessage);
		setSelectionAfterRender(selectionStart + text.length);
		refreshCompletion(nextMessage, selectionStart + text.length);
	}

	function handleTextAreaDragOver(event: React.DragEvent<HTMLTextAreaElement>): void {
		if (event.dataTransfer.types.includes("Files")) {
			event.preventDefault();
			event.stopPropagation();
			event.dataTransfer.dropEffect = "copy";
		}
	}

	function handleTextAreaDrop(event: React.DragEvent<HTMLTextAreaElement>): void {
		if (!event.dataTransfer.types.includes("Files")) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		addContextFilesFromList(event.dataTransfer.files);
	}

	async function refreshContextUsage(): Promise<void> {
		setContextUsageError(null);
		const requestId: number = ++contextUsageRequestRef.current;
		try {
			const usage: ContextUsageEstimate = await estimateContextUsage(contextUsageParamsRef.current);
			if (requestId !== contextUsageRequestRef.current) return;
			setContextUsage(usage);
		} catch (error: unknown) {
			if (requestId === contextUsageRequestRef.current) setContextUsageError(getErrorMessage(error, t));
		}
	}

	async function handleCompressContext(): Promise<void> {
		setIsCompressingContext(true);
		setContextUsageError(null);
		try {
			const result = await compressSession(8);
			if (!result.compressed && result.reason !== undefined) {
				setContextUsageError(result.reason);
			}
			await refreshContextUsage();
		} catch (error: unknown) {
			setContextUsageError(getErrorMessage(error, t));
		} finally {
			setIsCompressingContext(false);
		}
	}

	const contextUsageContent: React.ReactNode = contextUsage === null ? (
		<div className={contextUsageError === null ? styles.contextUsageLoading : styles.contextUsageError}>
			{contextUsageError === null ? (
				<>
					<Spin size="small" />
					<Typography.Text type="secondary">{t("composer.contextUsage.estimating")}</Typography.Text>
				</>
			) : (
				<>
					<Typography.Text type="danger">{contextUsageError}</Typography.Text>
					<Button size="small" onClick={(): void => { void refreshContextUsage(); }}>{t("composer.contextUsage.retry")}</Button>
				</>
			)}
		</div>
	) : (
		<div className={styles.contextUsagePanel}>
			<div className={styles.contextUsageHeader}>
				<div className={styles.contextUsageTitleRow}>
					<Typography.Text strong>
						{t("composer.contextUsage.usedTokens", {
							used: formatTokenCount(contextUsage.usedTokens),
							total: formatTokenCount(contextUsage.contextWindowTokens)
						})}
					</Typography.Text>
					<Typography.Text type={contextUsage.percent >= 90 ? "danger" : "secondary"}>
						{contextUsage.percent.toFixed(1)}%
					</Typography.Text>
				</div>
				<Typography.Text type="secondary" className={styles.contextUsageMeta}>
					{t("composer.contextUsage.meta", {
						model: contextUsage.modelLabel,
						available: formatTokenCount(contextUsage.availableTokens),
						source: contextUsage.estimationSource
					})}
				</Typography.Text>
			</div>
			<Progress
				percent={contextUsage.percent}
				showInfo={false}
				status={contextUsageStatus}
				strokeColor={contextUsageStrokeColor}
				className={styles.contextUsage}
			/>
			<div className={styles.contextUsagePressure}>
				<Typography.Text type="secondary">
					{t("composer.contextUsage.pressureLevel", {
						level: t(`composer.contextUsage.pressureLevels.${contextUsage.pressure}`)
					})}
				</Typography.Text>
				<Typography.Text type="secondary" ellipsis>
					{t("composer.contextUsage.largestContributor", {
						largest: contextUsage.largestContributor === null
							? t("composer.contextUsage.none")
							: t(`composer.contextUsage.breakdown.kinds.${contextUsage.largestContributor.kind}`)
					})}
				</Typography.Text>
			</div>
			<div className={styles.contextUsageBreakdown}>
				{contextUsage.breakdown.map((item) => (
					<div className={styles.contextUsageRow} key={item.kind}>
						<span className={styles.contextUsageLabel}>{t(`composer.contextUsage.breakdown.kinds.${item.kind}`)}</span>
						<span className={styles.contextUsageValue}>{formatTokenCount(item.tokens)}</span>
						<span className={styles.contextUsagePercent}>{item.percent.toFixed(1)}%</span>
					</div>
				))}
			</div>
			{contextUsageError === null ? null : (
				<Typography.Text type="danger" className={styles.contextUsageMeta}>{contextUsageError}</Typography.Text>
			)}
			<Tooltip title={compressDisabledReason ?? undefined}>
				<span className={styles.contextUsageCompressWrap}>
					<Button
						block={true}
						loading={isCompressingContext}
						disabled={isCompressingContext || isSending || !contextUsage.canCompress}
						onClick={(): void => { void handleCompressContext(); }}
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
			disabled={providerModelSelection === null}
			onClick={!hasConfiguredProviders ? onConfigureProvider : undefined}
		>
			<span className={styles.modelButtonContent}>
				<span className={styles.modelButtonText}>{selectedModelLabel}</span>
			</span>
		</Button>
	);

	return (
		<div ref={rootRef} className={styles.composerRoot}>
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
						<div className={styles.completionPanel} role="listbox" aria-label="Composer completions">
							{completionOptions.map((option: ComposerCompletionOption, index: number): React.ReactNode => {
								const isSelected: boolean = index === selectedCompletionIndex;

								return (
									<button
										key={`${option.trigger}:${option.key}`}
										type="button"
										className={`${styles.completionItem} ${isSelected ? styles.completionItemSelected : ""}`}
										role="option"
										aria-selected={isSelected}
										onMouseDown={(event: React.MouseEvent<HTMLButtonElement>): void => {
											event.preventDefault();
											applyCompletion(option);
										}}
										onMouseEnter={(): void => {
											setSelectedCompletionIndex(index);
										}}
									>
										<span className={styles.completionLabel}>{option.label}</span>
										<span className={styles.completionDescription}>{option.description}</span>
									</button>
								);
							})}
						</div>
					) : null}
					{composerContextItems.length > 0 ? (
						<div className={styles.contextArea}>
							<AdditionalContextStrip
								items={composerContextItems}
								align="start"
								interactive={true}
								onTogglePin={(contextId: string, pinned: boolean): void => {
									onPinContext?.(contextId, pinned);
								}}
								onRemove={(contextId: string): void => {
									onRemoveContext?.(contextId);
								}}
							/>
						</div>
					) : null}
					<Dropdown menu={textAreaContextMenu} trigger={["contextMenu"]}>
						<div className={styles.composerTextAreaContextTarget} data-studio-input-context-menu="custom">
							<Input.TextArea
								ref={textAreaRef}
								value={draftMessage}
								autoSize={{ minRows: 4, maxRows: 4 }}
								placeholder={mode === "goal" ? t("composer.goalPlaceholder") : t("composer.placeholder")}
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
								onCompositionEnd={(event: React.CompositionEvent<HTMLTextAreaElement>): void => {
									setIsComposing(false);
									refreshCompletion(event.currentTarget.value, event.currentTarget.selectionStart);
								}}
							/>
						</div>
					</Dropdown>
					<div className={styles.composerToolbar}>
						<Tooltip title={t("composer.tooltips.addContext")}>
							<Dropdown
								menu={contextMenu}
								trigger={["click"]}
							>
								<Button
									type="text"
									shape="circle"
									icon={<Icon name="add" className={styles.composerActionIcon} />}
								/>
							</Dropdown>
						</Tooltip>

						<Divider vertical={true} />

						<Tooltip title={t("composer.tooltips.mode")}>
							<Dropdown
								menu={modeMenu}
								trigger={["click"]}
							>
								<Button
									type="text"
									shape="circle"
									icon={<Icon name={mode} />}
								/>
							</Dropdown>
						</Tooltip>
						<Tooltip title={t("composer.tooltips.approvalMode")}>
							<Dropdown
								menu={approvalModeMenu}
								disabled={isApprovalModeSaving}
								trigger={["click"]}
							>
								<Button
									type="text"
									loading={isApprovalModeSaving}
									icon={(
										<Icon
											name={approvalMode === "full-trust" ? "warning" : approvalMode === "auto-safe" ? "shield" : "hand"}
										/>
									)}
									className={styles.approvalModeButton}
								>
									<span className={styles.approvalModeText}>{approvalModeLabel}</span>
								</Button>
							</Dropdown>
						</Tooltip>

						<Divider vertical={true} />

						<Tooltip title={hasConfiguredProviders ? t("composer.tooltips.model") : t("composer.model.configureProvider")}>
							{hasConfiguredProviders ? (
								<Dropdown
									rootClassName={styles.modelDropdown}
									autoAdjustOverflow={true}
									menu={providerModelMenu}
									trigger={["click"]}
								>
									{modelButton}
								</Dropdown>
							) : modelButton}
						</Tooltip>

						{displayedReasoningEffort === null ? null : (
							<Tooltip title={t("composer.tooltips.reasoningEffort")}>
								<Dropdown menu={reasoningEffortMenu} trigger={["click"]}>
									<Button type="text" className={styles.reasoningEffortButton} icon={<Icon name="brain" />}>
										<span>{displayedReasoningEffortLabel}</span>
									</Button>
								</Dropdown>
							</Tooltip>
						)}

						<Tooltip title={
							isCancelling
								? t("composer.send.stopping")
								: isSending && draftMessage.trim().length === 0 && composerContextItems.length === 0
									? t("composer.send.stop")
									: isSending
										? t("composer.send.queue")
										: t("composer.send.send")
						}>
							<Button
								type="text"
								shape="circle"
								icon={<Icon name={isSending && draftMessage.trim().length === 0 && composerContextItems.length === 0 ? "stop" : "send"} />}
								className={styles.composerSendButton}
								disabled={isCancelling || isAddingTextAttachment || (!isSending && draftMessage.trim().length === 0 && composerContextItems.length === 0)}
								onClick={submitMessage}
							/>
						</Tooltip>
					</div>
				</div>
			</div>

			<footer className={styles.footer}>
				<Flex
					align="start"
					justify="space-between"
					gap={8}
					className={styles.workspaceFooterRow}
				>
					<Dropdown
						disabled={workspaceFooterDisabled}
						menu={workspaceFooterMenu}
						trigger={["click"]}
					>
						<Button
							type="text"
							size="small"
							disabled={workspaceFooterDisabled}
							icon={selectedWorkspace === null
								? <Icon name="close" />
								: <WorkspaceIconView workspace={selectedWorkspace} />}
							className={styles.workspaceFooterButton}
						>
							<span className={styles.workspaceFooterText}>{selectedWorkspaceLabel}</span>
						</Button>
					</Dropdown>
					{showContextUsage ? (
						<Popover
							title={t("composer.contextUsage.title")}
							content={contextUsageContent}
							trigger="click"
						>
							<span className={styles.contextUsageAnchor}>
								<button type="button" className={styles.contextUsageButton} aria-label={t("composer.contextUsage.title")}>
									<span className={styles.contextUsageButtonText}>{Math.round(contextUsagePercent)}%</span>
									<Progress
										type="circle"
										percent={contextUsagePercent}
										status={contextUsageStatus}
										strokeColor={contextUsageStrokeColor}
										showInfo={false}
										size={16}
									/>
								</button>
							</span>
						</Popover>
					) : null}
				</Flex>
			</footer>
		</div>
	);
}

export default memo(Composer);
