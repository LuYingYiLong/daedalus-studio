import type { MenuProps } from "antd";
import type { TFunction } from "i18next";
import { Icon } from "@/assets/icons";
import type { ApprovalMode } from "@/platform/rpc/approval-api";
import type { ChatMode } from "@/platform/rpc/chat-api";
import type {
	ProviderModelInfo,
	ProviderModelSelection,
	ProviderModelSelectionProvider,
	ProviderReasoningEffortOption,
} from "@/platform/rpc/provider-api";
import type { WorkspaceConfig } from "@/platform/rpc/types";
import { WorkspaceIconView } from "@/widgets/workspace/workspace-appearance";
import styles from "./Composer.module.css";

export type SelectedModel = {
	provider: string;
	model: string;
};

export type ComposerPlaceholderKey =
	| "composer.placeholders.ask"
	| "composer.placeholders.agent"
	| "composer.placeholders.plan"
	| "composer.placeholders.goal";

export const COMPOSER_PLACEHOLDER_KEYS: Record<
	ChatMode,
	ComposerPlaceholderKey
> = {
	ask: "composer.placeholders.ask",
	agent: "composer.placeholders.agent",
	plan: "composer.placeholders.plan",
	goal: "composer.placeholders.goal",
};

export const NO_WORKSPACE_KEY: string = "workspace:none";
export const ADD_WORKSPACE_KEY: string = "workspace:add";

export function createContextItems(t: TFunction<"common">): MenuProps["items"] {
	return [
		{ key: "files", label: t("composer.context.addFiles") },
		{ key: "folder", label: t("composer.context.addFolder") },
		{ key: "images", label: t("composer.context.addImages") },
	];
}

export type ComposerOptionsMenuOptions = {
	includeContext: boolean;
	includeMode: boolean;
	allowedModes?: readonly ChatMode[];
};

export function createComposerOptionsItems(
	t: TFunction<"common">,
	options: ComposerOptionsMenuOptions,
): MenuProps["items"] {
	const items: NonNullable<MenuProps["items"]> = [];
	if (options.includeContext) {
		items.push({
			type: "group",
			key: "context",
			label: t("composer.menu.context"),
			children: createContextItems(t),
		});
	}
	if (options.includeMode) {
		const modeItems: MenuProps["items"] = createModeItems(
			t,
			options.allowedModes,
		);
		if (modeItems !== undefined && modeItems.length > 0) {
			items.push({
				type: "group",
				key: "mode",
				label: t("composer.menu.mode"),
				children: modeItems,
			});
		}
	}
	return items;
}

export function createApprovalModeItems(
	t: TFunction<"common">,
): MenuProps["items"] {
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

export function createModeItems(
	t: TFunction<"common">,
	allowedModes?: readonly ChatMode[],
): MenuProps["items"] {
	const items: NonNullable<MenuProps["items"]> = [
		{
			key: "ask",
			label: t("composer.mode.ask"),
			icon: <Icon name="ask" />,
		},
		{
			key: "agent",
			label: t("composer.mode.agent"),
			icon: <Icon name="agent" />,
		},
		{
			key: "plan",
			label: t("composer.mode.plan"),
			icon: <Icon name="plan" />,
		},
		{
			key: "goal",
			label: t("composer.mode.goal"),
			icon: <Icon name="goal" />,
		},
	];
	if (allowedModes === undefined) return items;
	return items.filter((item): boolean => (
		item !== null
		&& typeof item === "object"
		&& "key" in item
		&& allowedModes.includes(String(item.key) as ChatMode)
	));
}

export function isComposerMode(value: string): value is ChatMode {
	return (
		value === "ask" ||
		value === "agent" ||
		value === "plan" ||
		value === "goal"
	);
}

export function isApprovalMode(value: string): value is ApprovalMode {
	return (
		value === "manual" || value === "auto-safe" || value === "full-trust"
	);
}

export function createModelKey(provider: string, model: string): string {
	return `model:${provider}:${model}`;
}

export function parseModelKey(key: string): SelectedModel | null {
	const prefix: string = "model:";
	if (!key.startsWith(prefix)) return null;
	const value: string = key.slice(prefix.length);
	const separatorIndex: number = value.indexOf(":");
	if (separatorIndex < 0) return null;
	return {
		provider: value.slice(0, separatorIndex),
		model: value.slice(separatorIndex + 1),
	};
}

export function findSelectedProvider(
	selection: ProviderModelSelection | null,
	selectedModel: SelectedModel | null,
): ProviderModelSelectionProvider | null {
	if (selection === null || selectedModel === null) return null;
	return (
		selection.providers.find(
			(provider: ProviderModelSelectionProvider): boolean =>
				provider.configured &&
				provider.enabled !== false &&
				provider.provider === selectedModel.provider,
		) ?? null
	);
}

export function findSelectedModel(
	selection: ProviderModelSelection | null,
	selectedModel: SelectedModel | null,
): ProviderModelInfo | null {
	const selectedProvider: ProviderModelSelectionProvider | null =
		findSelectedProvider(selection, selectedModel);
	if (selectedProvider === null || selectedModel === null) return null;
	return (
		selectedProvider.models.find(
			(model: ProviderModelInfo): boolean =>
				model.id === selectedModel.model,
		) ?? null
	);
}

export function getSelectedModelLabel(
	selection: ProviderModelSelection | null,
	selectedModel: SelectedModel | null,
	t: TFunction<"common">,
): string {
	const selectedProvider: ProviderModelSelectionProvider | null =
		findSelectedProvider(selection, selectedModel);
	const selectedModelInfo: ProviderModelInfo | null = findSelectedModel(
		selection,
		selectedModel,
	);
	if (
		selection !== null &&
		!selection.providers.some(
			(provider: ProviderModelSelectionProvider): boolean =>
				provider.configured && provider.enabled !== false,
		)
	) {
		return t("composer.model.configureProvider");
	}
	if (selectedProvider === null || selectedModel === null)
		return t("composer.model.fallback");
	return `${selectedProvider.displayName}/${selectedModelInfo?.displayName ?? selectedModel.model}`;
}

export function getReasoningEffortLabel(
	effort: string,
	t: TFunction<"common">,
): string {
	return t(`composer.reasoning.efforts.${effort}`, { defaultValue: effort });
}

export function createReasoningEffortKey(effort: string): string {
	return `reasoning:${effort}`;
}

export function parseReasoningEffortKey(key: string): string | null {
	const prefix: string = "reasoning:";
	if (!key.startsWith(prefix)) return null;
	const effort: string = key.slice(prefix.length);
	return effort.length > 0 ? effort : null;
}

export function createReasoningEffortItems(
	options: readonly ProviderReasoningEffortOption[],
	t: TFunction<"common">,
): MenuProps["items"] {
	return options.map((option: ProviderReasoningEffortOption) => ({
		key: createReasoningEffortKey(option.id),
		label: getReasoningEffortLabel(option.id, t),
	}));
}

export function resolveDisplayedReasoningEffort(
	options: readonly ProviderReasoningEffortOption[],
	requested: string | null | undefined,
): string | null {
	if (options.length === 0) return null;
	if (
		requested !== undefined &&
		requested !== null &&
		options.some(
			(option: ProviderReasoningEffortOption): boolean =>
				option.id === requested,
		)
	) {
		return requested;
	}
	return (
		options.find(
			(option: ProviderReasoningEffortOption): boolean =>
				option.id === "medium",
		)?.id ??
		options[0]?.id ??
		null
	);
}

export type ProviderModelMenuOptions = {
	flattenProviders?: boolean;
};

export function createProviderModelItems(
	selection: ProviderModelSelection | null,
	t: TFunction<"common">,
	options: ProviderModelMenuOptions = {},
): MenuProps["items"] {
	if (selection === null) return [];
	return selection.providers
		.filter(
			(provider: ProviderModelSelectionProvider): boolean =>
				provider.configured && provider.enabled !== false,
		)
		.map((provider: ProviderModelSelectionProvider) => {
			const modelItems = provider.models.map((model: ProviderModelInfo) => {
				const modelBadges: string[] = [];
				if (model.capabilities.reasoning)
					modelBadges.push(
						t("composer.model.capabilities.reasoning"),
					);
				if (model.capabilities.imageInput)
					modelBadges.push(t("composer.model.capabilities.vision"));
				if (model.capabilities.webSearch)
					modelBadges.push(t("composer.model.capabilities.search"));
				return {
					key: createModelKey(provider.provider, model.id),
					label: (
						<span className={styles.modelMenuItem}>
							<span className={styles.modelMenuName}>
								{model.displayName}
							</span>
							<span className={styles.modelMenuMeta}>
								{modelBadges.length > 0
									? modelBadges.join(" · ")
									: model.id}
							</span>
						</span>
					),
				};
			});
			const providerLabel = (
				<span className={styles.providerGroupLabel}>
					{provider.displayName}
				</span>
			);

			if (options.flattenProviders) {
				return {
					type: "group",
					key: `provider-group:${provider.provider}`,
					label: providerLabel,
					children: modelItems,
				};
			}

			return {
				key: `provider:${provider.provider}`,
				popupClassName: styles.modelSubmenuPopup,
				label: providerLabel,
				children: modelItems,
			};
		});
}

export function createProviderModelAndReasoningItems(
	selection: ProviderModelSelection | null,
	reasoningEffortOptions: readonly ProviderReasoningEffortOption[],
	t: TFunction<"common">,
	options: ProviderModelMenuOptions = {},
): MenuProps["items"] {
	const items: NonNullable<MenuProps["items"]> = [
		...(createProviderModelItems(selection, t, options) ?? []),
	];
	const reasoningItems: MenuProps["items"] = createReasoningEffortItems(
		reasoningEffortOptions,
		t,
	);
	if (reasoningItems !== undefined && reasoningItems.length > 0) {
		if (items.length > 0) {
			items.push({ type: "divider" });
		}
		items.push({
			type: "group",
			key: "reasoning-effort",
			label: t("composer.menu.reasoningEffort"),
			children: reasoningItems,
		});
	}
	return items;
}

export function createWorkspaceKey(workspaceId: string): string {
	return `workspace:${workspaceId}`;
}

export function parseWorkspaceKey(key: string): string | null {
	if (
		!key.startsWith("workspace:") ||
		key === NO_WORKSPACE_KEY ||
		key === ADD_WORKSPACE_KEY
	)
		return null;
	return key.slice("workspace:".length);
}

export function createWorkspaceFooterItems(
	workspaces: readonly WorkspaceConfig[],
	t: TFunction<"common">,
): MenuProps["items"] {
	const workspaceItems: MenuProps["items"] = workspaces.map(
		(workspace: WorkspaceConfig) => ({
			key: createWorkspaceKey(workspace.id),
			label: (
				<span className={styles.workspaceMenuItem}>
					<span className={styles.workspaceMenuName}>
						{workspace.name}
					</span>
				</span>
			),
			icon: <WorkspaceIconView workspace={workspace} />,
		}),
	);
	return [
		...workspaceItems,
		...(workspaces.length > 0 ? [{ type: "divider" as const }] : []),
		{
			key: NO_WORKSPACE_KEY,
			label: t("composer.workspace.noWorkspace"),
			icon: <Icon name="close" />,
		},
		{
			key: ADD_WORKSPACE_KEY,
			label: t("composer.workspace.addWorkspace"),
			icon: <Icon name="add" />,
		},
	];
}
