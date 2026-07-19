import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Dropdown, Button, Divider, Collapse, Flex, Steps, Tooltip, Popover, Progress, Typography, Spin } from "antd";
import type { CollapseProps, MenuProps, ProgressProps, StepsProps } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { Icon } from "@/assets/icons";
import styles from "./Composer.module.css";
import type { ApprovalMode } from "@/api/approval-api";
import type { ChatMode } from "@/api/chat-api";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { SkillSummary } from "@/api/skill-api";
import type { AdditionalContextItem, WorkflowTodoSnapshot, WorkflowTodoStep, WorkspaceConfig } from "@/api/types";
import type { ProviderModelInfo, ProviderModelSelection, ProviderModelSelectionProvider } from "@/api/provider-api";
import { compressSession, estimateContextUsage, type ContextUsageEstimate } from "@/api/context-api";
import AdditionalContextStrip from "@/features/bubble/AdditionalContextStrip";
import { getWorkflowTodoSnapshotKey, mapWorkflowTodoStatusToStepStatus } from "./workflow-todo";
import {
	createCompletionOptions,
	getCompletionToken,
	replaceCompletionToken,
	type ComposerCompletionOption,
	type ComposerCompletionToken,
	type ComposerCompletionTrigger
} from "./composer-completion";

export type ComposerProps = {
	providerModelSelection: ProviderModelSelection | null;
	selectedProviderId: string | null;
	selectedModelId: string | null;
	message: string;
	contextItems?: AdditionalContextItem[];
	workflowTodoSnapshot?: WorkflowTodoSnapshot | null;
	workflowTodoCollapsed?: boolean;
	mode: ChatMode;
	approvalMode: ApprovalMode;
	slashCommands?: SlashCommandDefinition[];
	skills?: SkillSummary[];
	isSending?: boolean;
	isApprovalModeSaving?: boolean;
	webSearchEnabled?: boolean;
	workspaceOptions?: WorkspaceConfig[];
	selectedWorkspace?: WorkspaceConfig | null;
	workspaceFooterDisabled?: boolean;
	isWorkspaceAdding?: boolean;
	showContextUsage?: boolean;
	onMessageChange?: (message: string) => void;
	onModeChange?: (mode: ChatMode) => void;
	onApprovalModeChange?: (mode: ApprovalMode) => void;
	onWebSearchEnabledChange?: (enabled: boolean) => void;
	onProviderModelChange?: (providerId: string, modelId: string) => void;
	onWorkspaceSelect?: (workspaceId: string) => void;
	onWorkspaceAdd?: () => void;
	onWorkspaceClear?: () => void;
	onAddFiles?: () => void;
	onAddFolder?: () => void;
	onAddImages?: (files: File[]) => void;
	onAddContextFiles?: (files: File[]) => void;
	onRemoveContext?: (contextId: string) => void;
	onPinContext?: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext?: () => void;
	onCancel?: () => void;
	onSubmit?: (message: string) => void;
	onWorkflowTodoDismiss?: (snapshot: WorkflowTodoSnapshot) => void;
	onWorkflowTodoCollapseChange?: (collapsed: boolean) => void;
	onCompletionOpen?: (trigger: ComposerCompletionTrigger) => void;
};

type SelectedModel = {
	provider: string;
	model: string;
};

type ProgressStrokeColor = NonNullable<ProgressProps["strokeColor"]>;

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

const contextItems: MenuProps["items"] = [
	{
		key: "files",
		label: "Add files",
	},
	{
		key: "folder",
		label: "Add folder",
	},
	{
		key: "images",
		label: "Add images",
	},
];

const approvalModeItems: MenuProps["items"] = [
	{
		key: "manual",
		label: "Manual",
		icon: <Icon name="shield" />,
	},
	{
		key: "auto-safe",
		label: "Auto-safe",
		icon: <Icon name="warning" />,
	},
];

const modeItems: MenuProps["items"] = [
	{
		key: "ask",
		label: "Ask",
		icon: <Icon name="ask" />
	},
	{
		key: "agent",
		label: "Agent",
		icon: <Icon name="agent" />
	},
	{
		key: "plan",
		label: "Plan",
		icon: <Icon name="plan" />
	},
];

const NO_WORKSPACE_KEY: string = "workspace:none";
const ADD_WORKSPACE_KEY: string = "workspace:add";
const EMPTY_CONTEXT_ITEMS: AdditionalContextItem[] = [];

function isComposerMode(value: string): value is ChatMode {
	return value === "ask" || value === "agent" || value === "plan";
}

function isApprovalMode(value: string): value is ApprovalMode {
	return value === "manual" || value === "auto-safe";
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
		return provider.provider === selectedModel.provider;
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

function getSelectedModelLabel(selection: ProviderModelSelection | null, selectedModel: SelectedModel | null): string {
	const selectedProvider: ProviderModelSelectionProvider | null = findSelectedProvider(selection, selectedModel);
	const selectedModelInfo: ProviderModelInfo | null = findSelectedModel(selection, selectedModel);

	if (selectedProvider === null || selectedModel === null) {
		return "Model";
	}

	return `${selectedProvider.displayName} / ${selectedModelInfo?.displayName ?? selectedModel.model}`;
}

function createProviderModelItems(selection: ProviderModelSelection | null): MenuProps["items"] {
	if (selection === null) {
		return [];
	}

	return selection.providers.map((provider: ProviderModelSelectionProvider) => {
		return {
			key: `provider:${provider.provider}`,
			popupClassName: styles.modelSubmenuPopup,
			label: (
				<span className={styles.providerGroupLabel}>
					<span>{provider.displayName}</span>
					{provider.configured ? null : (
						<span className={styles.providerMutedText}>Not configured</span>
					)}
				</span>
			),
			children: provider.models.map((model: ProviderModelInfo) => {
				const modelBadges: string[] = [];

				if (model.capabilities.reasoning) {
					modelBadges.push("Reasoning");
				}

				if (model.capabilities.imageInput) {
					modelBadges.push("Vision");
				}

				if (model.capabilities.webSearch) {
					modelBadges.push("Search");
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

function createWorkspaceFooterItems(workspaces: readonly WorkspaceConfig[]): MenuProps["items"] {
	return [
		...workspaces.map((workspace: WorkspaceConfig) => {
			return {
				key: createWorkspaceKey(workspace.id),
				label: (
					<span className={styles.workspaceMenuItem}>
						<span className={styles.workspaceMenuName}>{workspace.name}</span>
						<span className={styles.workspaceMenuPath}>{workspace.rootPath}</span>
					</span>
				),
				icon: <Icon name="folder" />
			};
		}),
		{
			type: "divider" as const
		},
		{
			key: NO_WORKSPACE_KEY,
			label: "No workspace",
			icon: <Icon name="close" />
		},
		{
			key: ADD_WORKSPACE_KEY,
			label: "Add workspace...",
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

function createWorkflowTodoStepItems(steps: readonly WorkflowTodoStep[]): NonNullable<StepsProps["items"]> {
	return steps.map((step: WorkflowTodoStep, index: number) => {
		const title: string = step.title.trim() || step.text?.trim() || `Step ${index + 1}`;
		const description: string | undefined = step.text !== undefined && step.text !== title ? step.text : undefined;
		const status = mapWorkflowTodoStatusToStepStatus(step.status);

		return {
			key: step.id,
			icon: <Icon name={getWorkflowTodoIconName(step.status)} className={styles.todoStepIcon} />,
			title: (
				<Tooltip title={title}>
					<span className={styles.todoStepTitle}>{title}</span>
				</Tooltip>
			),
			description: description === undefined
				? undefined
				: (
					<Tooltip title={description}>
						<span className={styles.todoStepDescription}>{description}</span>
					</Tooltip>
				),
			status
		};
	});
}

function getWorkflowTodoIconName(status: string): string {
	if (status === "done" || status === "completed" || status === "success") {
		return "todo_checked";
	}

	if (status === "failed" || status === "error" || status === "cancelled") {
		return "todo_failed";
	}

	return "todo_unchecked";
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Context estimate failed";
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
	message,
	contextItems: composerContextItems = EMPTY_CONTEXT_ITEMS,
	workflowTodoSnapshot = null,
	workflowTodoCollapsed = false,
	mode,
	approvalMode,
	slashCommands = [],
	skills = [],
	isSending = false,
	isApprovalModeSaving = false,
	webSearchEnabled = false,
	workspaceOptions = [],
	selectedWorkspace = null,
	workspaceFooterDisabled = false,
	isWorkspaceAdding = false,
	showContextUsage = true,
	onMessageChange,
	onModeChange,
	onApprovalModeChange,
	onWebSearchEnabledChange,
	onProviderModelChange,
	onWorkspaceSelect,
	onWorkspaceAdd,
	onWorkspaceClear,
	onAddFiles,
	onAddFolder,
	onAddImages,
	onAddContextFiles,
	onRemoveContext,
	onPinContext,
	onCancel,
	onSubmit,
	onWorkflowTodoDismiss,
	onWorkflowTodoCollapseChange,
	onCompletionOpen
}: ComposerProps): React.JSX.Element {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const textAreaRef = useRef<TextAreaRef | null>(null);
	const imageInputRef = useRef<HTMLInputElement | null>(null);
	const suppressedCompletionValueRef = useRef<string | null>(null);
	const completionStateSignatureRef = useRef<string>("");
	const lastSyncedMessageRef = useRef<string>(message);
	const lastWorkflowTodoKeyRef = useRef<string>("");
	const dismissedWorkflowTodoKeyRef = useRef<string>("");
	const [draftMessage, setDraftMessage] = useState<string>(message);
	const [completionToken, setCompletionToken] = useState<ComposerCompletionToken | null>(null);
	const [completionOptions, setCompletionOptions] = useState<ComposerCompletionOption[]>([]);
	const [selectedCompletionIndex, setSelectedCompletionIndex] = useState<number>(0);
	const [isComposing, setIsComposing] = useState<boolean>(false);
	const [todoPanelOpen, setTodoPanelOpen] = useState<boolean>(false);
	const [todoCollapsed, setTodoCollapsed] = useState<boolean>(workflowTodoCollapsed);
	const [contextUsage, setContextUsage] = useState<ContextUsageEstimate | null>(null);
	const [isContextUsageLoading, setIsContextUsageLoading] = useState<boolean>(false);
	const [contextUsageError, setContextUsageError] = useState<string | null>(null);
	const [isCompressingContext, setIsCompressingContext] = useState<boolean>(false);

	const handleModeClick: MenuProps["onClick"] = ({ key }): void => {
		if (isComposerMode(key)) {
			onModeChange?.(key);
		}
	};

	const handleApprovalModeClick: MenuProps["onClick"] = ({ key }): void => {
		if (isApprovalMode(key)) {
			onApprovalModeChange?.(key);
		}
	};

	const handleWorkspaceClick: MenuProps["onClick"] = ({ key }): void => {
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
	};

	const handleContextItemClick: MenuProps["onClick"] = ({ key }): void => {
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
	};

	function handleImageInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
		const files: File[] = Array.from(event.currentTarget.files ?? []);
		event.currentTarget.value = "";
		if (files.length === 0) {
			return;
		}
		onAddImages?.(files);
	}

	const providerModelItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return createProviderModelItems(providerModelSelection);
	}, [providerModelSelection]);
	const workspaceFooterItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return createWorkspaceFooterItems(workspaceOptions);
	}, [workspaceOptions]);
	const selectedModel: SelectedModel | null = selectedProviderId === null || selectedModelId === null
		? null
		: {
			provider: selectedProviderId,
			model: selectedModelId
		};
	const selectedModelKey: string | undefined = selectedModel === null
		? undefined
		: createModelKey(selectedModel.provider, selectedModel.model);
	const selectedModelLabel: string = getSelectedModelLabel(providerModelSelection, selectedModel);
	const selectedWorkspaceKey: string = selectedWorkspace === null ? NO_WORKSPACE_KEY : createWorkspaceKey(selectedWorkspace.id);
	const selectedWorkspaceLabel: string = selectedWorkspace?.name ?? "No workspace";
	const approvalModeLabel: string = approvalMode === "auto-safe" ? "Auto Safe" : "Manual";
	const hasCompletion: boolean = completionToken !== null && completionOptions.length > 0;
	const workflowTodoSteps: WorkflowTodoStep[] = workflowTodoSnapshot?.steps ?? [];
	const hasWorkflowTodo: boolean = workflowTodoSteps.length > 0;
	const workflowTodoKey: string = workflowTodoSnapshot === null ? "" : getWorkflowTodoSnapshotKey(workflowTodoSnapshot);
	const workflowTodoStepItems: NonNullable<StepsProps["items"]> = useMemo((): NonNullable<StepsProps["items"]> => {
		return createWorkflowTodoStepItems(workflowTodoSteps);
	}, [workflowTodoSteps]);
	const contextUsagePercent: number = contextUsage?.percent ?? 0;
	const contextUsageStrokeColor: ProgressStrokeColor = getContextUsageStrokeColor(contextUsagePercent);
	const contextUsageStatus: "normal" | "exception" = getContextUsageStatus(contextUsagePercent);
	const compressDisabledReason: string | null = isSending
		? "A message is being sent"
		: contextUsage?.canCompress === false
		? contextUsage.compressReason ?? "Compression unavailable"
		: null;

	function closeTodoPanel(markDismissed: boolean): void {
		setTodoPanelOpen(false);
		if (markDismissed && workflowTodoKey.length > 0) {
			dismissedWorkflowTodoKeyRef.current = workflowTodoKey;
		}
	}

	function dismissTodoPanel(): void {
		if (workflowTodoSnapshot === null) {
			closeTodoPanel(true);
			return;
		}

		closeTodoPanel(true);
		onWorkflowTodoDismiss?.(workflowTodoSnapshot);
	}

	function handleTodoCollapseChange(activeKey: CollapseProps["activeKey"]): void {
		const activeKeys: string[] = Array.isArray(activeKey) ? activeKey.map(String) : [String(activeKey)];
		const nextCollapsed: boolean = !activeKeys.includes("todo");
		setTodoCollapsed(nextCollapsed);
		onWorkflowTodoCollapseChange?.(nextCollapsed);
	}

	useEffect((): void => {
		if (selectedCompletionIndex >= completionOptions.length) {
			setSelectedCompletionIndex(Math.max(0, completionOptions.length - 1));
		}
	}, [completionOptions.length, selectedCompletionIndex]);

	useEffect((): void => {
		setTodoCollapsed(workflowTodoCollapsed);
	}, [workflowTodoCollapsed, workflowTodoKey]);

	useEffect((): void => {
		if (!hasWorkflowTodo) {
			lastWorkflowTodoKeyRef.current = "";
			setTodoPanelOpen(false);
			return;
		}

		if (lastWorkflowTodoKeyRef.current === workflowTodoKey) {
			return;
		}

		lastWorkflowTodoKeyRef.current = workflowTodoKey;
		if (dismissedWorkflowTodoKeyRef.current !== workflowTodoKey) {
			setTodoPanelOpen(true);
		}
	}, [hasWorkflowTodo, workflowTodoKey]);

	useEffect((): void => {
		const nativeTextArea: HTMLTextAreaElement | null = getNativeTextArea(textAreaRef.current);
		if (nativeTextArea === null || document.activeElement !== nativeTextArea) {
			return;
		}

		refreshCompletion(draftMessage, nativeTextArea.selectionStart);
	}, [draftMessage, slashCommands, skills]);

	useEffect((): void => {
		const nativeTextArea: HTMLTextAreaElement | null = getNativeTextArea(textAreaRef.current);
		const isFocused: boolean = nativeTextArea !== null && document.activeElement === nativeTextArea;
		const localMessageIsClean: boolean = draftMessage === lastSyncedMessageRef.current;

		lastSyncedMessageRef.current = message;
		if (!isFocused || localMessageIsClean) {
			setDraftMessage(message);
			suppressedCompletionValueRef.current = null;
			hideCompletion();
		}
	}, [message]);

	useEffect((): (() => void) => {
		if (!showContextUsage) {
			setIsContextUsageLoading(false);
			setContextUsage(null);
			setContextUsageError(null);
			return (): void => {};
		}

		let cancelled: boolean = false;
		const timer: number = window.setTimeout((): void => {
			setIsContextUsageLoading(true);
			setContextUsageError(null);
			void estimateContextUsage({
				message: draftMessage,
				mode,
				provider: selectedModel?.provider,
				model: selectedModel?.model,
				additionalContext: composerContextItems
			}).then((usage: ContextUsageEstimate): void => {
				if (cancelled) {
					return;
				}
				setContextUsage(usage);
			}).catch((error: unknown): void => {
				if (cancelled) {
					return;
				}
				setContextUsageError(getErrorMessage(error));
			}).finally((): void => {
				if (!cancelled) {
					setIsContextUsageLoading(false);
				}
			});
		}, 350);

		return (): void => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [draftMessage, mode, selectedModel?.provider, selectedModel?.model, composerContextItems, showContextUsage]);

	const handleProviderModelClick: MenuProps["onClick"] = ({ key }): void => {
		const nextSelectedModel: SelectedModel | null = parseModelKey(String(key));

		if (nextSelectedModel === null) {
			return;
		}

		onProviderModelChange?.(nextSelectedModel.provider, nextSelectedModel.model);
	};

	function submitMessage(): void {
		if (isSending) {
			onCancel?.();
			return;
		}

		const trimmedMessage: string = draftMessage.trim();

		if (trimmedMessage.length === 0) {
			return;
		}

		setDraftMessage("");
		lastSyncedMessageRef.current = "";
		suppressedCompletionValueRef.current = null;
		hideCompletion();
		setTodoPanelOpen(false);
		onMessageChange?.("");
		onSubmit?.(trimmedMessage);
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
		onMessageChange?.(replacement.value);
		setSelectionAfterRender(replacement.caretIndex);
	}

	function handleTextAreaChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
		const nextMessage: string = event.target.value;

		if (suppressedCompletionValueRef.current !== nextMessage) {
			suppressedCompletionValueRef.current = null;
		}

		setDraftMessage(nextMessage);
		onMessageChange?.(nextMessage);
		refreshCompletion(nextMessage, event.target.selectionStart);
	}

	function handleTextAreaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
		if (isComposing || event.nativeEvent.isComposing) {
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
		refreshCompletion(textArea.value, textArea.selectionStart);
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
		}
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
		setIsContextUsageLoading(true);
		setContextUsageError(null);
		try {
			const usage: ContextUsageEstimate = await estimateContextUsage({
				message: draftMessage,
				mode,
				provider: selectedModel?.provider,
				model: selectedModel?.model,
				additionalContext: composerContextItems
			});
			setContextUsage(usage);
		} catch (error: unknown) {
			setContextUsageError(getErrorMessage(error));
		} finally {
			setIsContextUsageLoading(false);
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
			setContextUsageError(getErrorMessage(error));
		} finally {
			setIsCompressingContext(false);
		}
	}

	const contextUsageContent: React.ReactNode = contextUsage === null ? (
		<div className={contextUsageError === null ? styles.contextUsageLoading : styles.contextUsageError}>
			{contextUsageError === null ? (
				<>
					<Spin size="small" />
					<Typography.Text type="secondary">Estimating context...</Typography.Text>
				</>
			) : (
				<>
					<Typography.Text type="danger">{contextUsageError}</Typography.Text>
					<Button size="small" onClick={(): void => { void refreshContextUsage(); }}>Retry</Button>
				</>
			)}
		</div>
	) : (
		<div className={styles.contextUsagePanel}>
			<div className={styles.contextUsageHeader}>
				<div className={styles.contextUsageTitleRow}>
					<Typography.Text strong>
						{formatTokenCount(contextUsage.usedTokens)} / {formatTokenCount(contextUsage.contextWindowTokens)} tokens
					</Typography.Text>
					<Typography.Text type={contextUsage.percent >= 90 ? "danger" : "secondary"}>
						{contextUsage.percent.toFixed(1)}%
					</Typography.Text>
				</div>
				<Typography.Text type="secondary" className={styles.contextUsageMeta}>
					{contextUsage.modelLabel} · {formatTokenCount(contextUsage.availableTokens)} available · {contextUsage.estimationSource}
				</Typography.Text>
			</div>
			<Progress
				percent={contextUsage.percent}
				showInfo={false}
				status={contextUsageStatus}
				strokeColor={contextUsageStrokeColor}
				className={styles.contextUsage}
			/>
			<div className={styles.contextUsageBreakdown}>
				<div className={styles.contextUsageRow}>
					<span>System & tools</span>
					<span>{formatTokenCount(contextUsage.systemAndContextTokens)}</span>
				</div>
				<div className={styles.contextUsageRow}>
					<span>History{contextUsage.summaryActive ? " (summary)" : ""}</span>
					<span>{formatTokenCount(contextUsage.historyTokens)}</span>
				</div>
				<div className={styles.contextUsageRow}>
					<span>Current message</span>
					<span>{formatTokenCount(contextUsage.currentMessageTokens)}</span>
				</div>
				<div className={styles.contextUsageRow}>
					<span>Reserved output</span>
					<span>{formatTokenCount(contextUsage.outputReserveTokens)}</span>
				</div>
				<div className={styles.contextUsageRow}>
					<span>Safety margin</span>
					<span>{formatTokenCount(contextUsage.safetyMarginTokens)}</span>
				</div>
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
						Compress chat
					</Button>
				</span>
			</Tooltip>
		</div>
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
				{todoPanelOpen && hasWorkflowTodo && !hasCompletion ? (
					<div className={styles.todoPanel}>
						<Collapse
							size="small"
							bordered={false}
							activeKey={todoCollapsed ? [] : ["todo"]}
							onChange={handleTodoCollapseChange}
							className={styles.todoCollapse}
							items={[{
								key: "todo",
								label: workflowTodoSnapshot?.title ?? "Todo",
								children: (
									<Flex vertical={true} gap="small" className={styles.todoPanelBody}>
										<Steps
											orientation="vertical"
											size="small"
											className={styles.todoSteps}
											current={Math.max(0, workflowTodoSteps.findIndex((step: WorkflowTodoStep): boolean => {
												return step.status === "running" || step.status === "in_progress";
											}))}
											items={workflowTodoStepItems}
										/>
									</Flex>
								),
								extra: (
									<Button
										type="text"
										size="small"
										icon={<Icon name="close" />}
										onClick={(event): void => {
											event.preventDefault();
											event.stopPropagation();
											dismissTodoPanel();
										}}
									/>
								),
							}]}
						/>
					</div>
				) : null}
				<div className={`${styles.composerSurface} ${hasWorkflowTodo ? styles.composerSurfaceHasTodo: ""}`}>
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
					<Input.TextArea
						ref={textAreaRef}
						value={draftMessage}
						autoSize={{ minRows: 4, maxRows: 12 }}
						placeholder="What can I say?"
						className={styles.composerTextArea}
						onChange={handleTextAreaChange}
						onKeyDown={handleTextAreaKeyDown}
						onSelect={handleTextAreaSelection}
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
					<div className={styles.composerToolbar}>
					<Tooltip title="Add additional context">
						<Dropdown
							menu={{ items: contextItems, onClick: handleContextItemClick }}
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
					
					<Tooltip title="Search">
						<Button
							type="text"
							shape="circle"
							className={`${styles.searchButton} ${webSearchEnabled ? styles.searchButtonActive : ""}`}
							icon={<Icon name="search" />}
							aria-pressed={webSearchEnabled}
							onClick={(): void => onWebSearchEnabledChange?.(!webSearchEnabled)}
						/>
					</Tooltip>
					<Tooltip title="Mode">
						<Dropdown
							menu={{
								items: modeItems,
								selectedKeys: [mode],
								onClick: handleModeClick,
							}}
							trigger={["click"]}
						>
							<Button
								type="text"
								shape="circle"
								icon={<Icon name={mode} className={styles.composerActionIcon} />}
							/>
						</Dropdown>
					</Tooltip>
					<Tooltip title="Approval mode">
						<Dropdown
							menu={{
								items: approvalModeItems,
								selectedKeys: [approvalMode],
								onClick: handleApprovalModeClick,
							}}
							disabled={isApprovalModeSaving}
							trigger={["click"]}
						>
							<Button
								type="text"
								loading={isApprovalModeSaving}
								icon={(
									<Icon
										name={approvalMode === "auto-safe" ? "warning" : "shield"}
										className={styles.composerActionIcon}
									/>
								)}
								className={styles.approvalModeButton}
							>
								<span className={styles.approvalModeText}>{approvalModeLabel}</span>
							</Button>
						</Dropdown>
					</Tooltip>	

					<Divider vertical={true} />
					
					<Tooltip title="Model">
						<Dropdown
							disabled={providerModelSelection === null}
							rootClassName={styles.modelDropdown}
							autoAdjustOverflow={true}
							menu={{
								items: providerModelItems,
								selectedKeys: selectedModelKey === undefined ? [] : [selectedModelKey],
								onClick: handleProviderModelClick
							}}
							trigger={["click"]}
						>
							<Button
								type="text"
								className={styles.modelButton}
							>
								<span className={styles.modelButtonContent}>
									<span className={styles.modelButtonText}>{selectedModelLabel}</span>
								</span>
							</Button>
						</Dropdown>
					</Tooltip>
					
					<Tooltip title={isSending ? "Stop" : "Send"}>
						<Button
							type="text"
							shape="circle"
							icon={<Icon name={isSending ? "stop" : "send"} className={styles.composerSendIcon} />}
							className={styles.composerSendButton}
							disabled={!isSending && draftMessage.trim().length === 0}
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
						disabled={workspaceFooterDisabled || isWorkspaceAdding}
						menu={{
							items: workspaceFooterItems,
							selectedKeys: [selectedWorkspaceKey],
							onClick: handleWorkspaceClick
						}}
						trigger={["click"]}
					>
						<Button
							type="text"
							size="small"
							loading={isWorkspaceAdding}
							disabled={workspaceFooterDisabled || isWorkspaceAdding}
							icon={<Icon name={selectedWorkspace === null ? "close" : "folder"} />}
							className={styles.workspaceFooterButton}
						>
							<span className={styles.workspaceFooterText}>{selectedWorkspaceLabel}</span>
						</Button>
					</Dropdown>
					{showContextUsage ? (
						<Popover
							title="Context usage"
							content={contextUsageContent}
							trigger="click"
						>
							<span className={styles.contextUsageAnchor}>
								<button type="button" className={styles.contextUsageButton} aria-label="Context usage">
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

export default Composer;
