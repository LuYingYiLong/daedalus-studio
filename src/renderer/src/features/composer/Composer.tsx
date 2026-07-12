import { useMemo, useState } from "react";
import { Input, Dropdown, Button, MenuProps, Divider } from "antd";
import { Icon } from "@/assets/icons";
import styles from "./Composer.module.css";
import type { ApprovalMode } from "@/api/approval-api";
import type { ChatMode } from "@/api/chat-api";
import type { ProviderModelInfo, ProviderModelSelection, ProviderModelSelectionProvider } from "@/api/provider-api";

export type ComposerProps = {
	providerModelSelection: ProviderModelSelection | null;
	selectedProviderId: string | null;
	selectedModelId: string | null;
	mode: ChatMode;
	approvalMode: ApprovalMode;
	isSending?: boolean;
	onModeChange?: (mode: ChatMode) => void;
	onApprovalModeChange?: (mode: ApprovalMode) => void;
	onProviderModelChange?: (providerId: string, modelId: string) => void;
	onCancel?: () => void;
	onSubmit?: (message: string) => void;
};

type SelectedModel = {
	provider: string;
	model: string;
};

const contextItems: MenuProps["items"] = [
	{
		key: "0",
		label: "Add files",
	},
	{
		key: "1",
		label: "Add folder",
	},
	{
		key: "2",
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

function Composer({
	providerModelSelection,
	selectedProviderId,
	selectedModelId,
	mode,
	approvalMode,
	isSending = false,
	onModeChange,
	onApprovalModeChange,
	onProviderModelChange,
	onCancel,
	onSubmit
}: ComposerProps): React.JSX.Element {
	const [message, setMessage] = useState<string>("");

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

	const providerModelItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return createProviderModelItems(providerModelSelection);
	}, [providerModelSelection]);
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

		const trimmedMessage: string = message.trim();

		if (trimmedMessage.length === 0) {
			return;
		}

		onSubmit?.(trimmedMessage);
		setMessage("");
	}

	return (
		<div className={styles.composerInputWrap}>
			<Input.TextArea
				value={message}
				autoSize={{ minRows: 4, maxRows: 6 }}
				placeholder="What can I say?"
				className={styles.composerTextArea}
				onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => {
					setMessage(event.target.value);
				}}
				onPressEnter={(event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
					if (event.shiftKey) {
						return;
					}

					event.preventDefault();
					submitMessage();
				}}
			/>
			<div className={styles.composerToolbar}>
				<Dropdown
					menu={{ items: contextItems }}
					trigger={["click"]}
				>
					<Button
						type="text"
						icon={<Icon name="add" className={styles.composerActionIcon} />}
						className={styles.composerActionButton}
					/>
				</Dropdown>
				<Divider vertical={true} />
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
						icon={<Icon name={mode} className={styles.composerActionIcon} />}
						className={styles.composerActionButton}
					/>
				</Dropdown>
				<Dropdown
					menu={{
						items: approvalModeItems,
						selectedKeys: [approvalMode],
						onClick: handleApprovalModeClick,
					}}
					trigger={["click"]}
				>
					<Button
						type="text"
						icon={(
							<Icon
								name={approvalMode === "auto-safe" ? "warning" : "shield"}
								className={styles.composerActionIcon}
							/>
						)}
						className={styles.composerActionButton}
					/>
				</Dropdown>
				<Divider vertical={true} />
				<Dropdown
					disabled={providerModelSelection === null}
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
				<Button
					type="text"
					icon={<Icon name={isSending ? "stop" : "send"} className={styles.composerSendIcon} />}
					className={styles.composerSendButton}
					disabled={!isSending && message.trim().length === 0}
					onClick={submitMessage}
				/>
			</div>
		</div>
	);
}

export default Composer;
