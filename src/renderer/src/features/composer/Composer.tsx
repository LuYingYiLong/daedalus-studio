import { useEffect, useMemo, useState } from "react";
import { Input, Dropdown, Button, MenuProps, Divider } from "antd";
import { Icon } from "@/assets/icons";
import styles from "./Composer.module.css";
import type { ChatMode } from "@/api/chat-api";
import type { ProviderModelInfo, ProviderModelSelection, ProviderModelSelectionProvider } from "@/api/provider-api";

export type ComposerProps = {
	providerModelSelection: ProviderModelSelection | null;
	isSending?: boolean;
	onSubmit?: (message: string, mode: ChatMode) => void;
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
	}
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

function getInitialSelectedModel(selection: ProviderModelSelection | null): SelectedModel | null {
	if (selection === null) {
		return null;
	}

	return {
		provider: selection.activeModel.providerId,
		model: selection.activeModel.modelId
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

function Composer({ providerModelSelection, isSending = false, onSubmit }: ComposerProps): React.JSX.Element {
	const [message, setMessage] = useState<string>("");
	const [mode, setMode] = useState<ChatMode>("ask");
	const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(() => {
		return getInitialSelectedModel(providerModelSelection);
	});

	useEffect((): void => {
		setSelectedModel(getInitialSelectedModel(providerModelSelection));
	}, [providerModelSelection]);

	const handleModeClick: MenuProps["onClick"] = ({ key }): void => {
		if (isComposerMode(key)) {
			setMode(key);
		}
	};

	const providerModelItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return createProviderModelItems(providerModelSelection);
	}, [providerModelSelection]);
	const selectedModelKey: string | undefined = selectedModel === null
		? undefined
		: createModelKey(selectedModel.provider, selectedModel.model);
	const selectedModelLabel: string = getSelectedModelLabel(providerModelSelection, selectedModel);

	const handleProviderModelClick: MenuProps["onClick"] = ({ key }): void => {
		const nextSelectedModel: SelectedModel | null = parseModelKey(String(key));

		if (nextSelectedModel === null) {
			return;
		}

		setSelectedModel(nextSelectedModel);
	};

	function submitMessage(): void {
		const trimmedMessage: string = message.trim();

		if (trimmedMessage.length === 0 || isSending) {
			return;
		}

		onSubmit?.(trimmedMessage, mode);
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
						onClick: handleModeClick
					}}
					trigger={["click"]}
				>
					<Button
						type="text"
						icon={<Icon name={mode} className={styles.composerActionIcon} />}
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
					icon={<Icon name="send" className={styles.composerSendIcon} />}
					className={styles.composerSendButton}
					disabled={message.trim().length === 0 || isSending}
					loading={isSending}
					onClick={submitMessage}
				/>
			</div>
		</div>
	);
}

export default Composer;
