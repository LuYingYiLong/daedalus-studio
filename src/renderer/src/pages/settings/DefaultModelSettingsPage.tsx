import { Alert, Button, Select, Spin, Typography } from "antd";
import type { SelectProps } from "antd";
import { useEffect, useState } from "react";
import { Icon } from "@/assets/icons";
import {
	fetchProviderModelSelection,
	saveProviderConfig,
	type ProviderModelInfo,
	type ProviderModelRouting,
	type ProviderModelSelection,
	type ProviderModelSelectionProvider,
	type ProviderTaskModelRef
} from "@/api/provider-api";
import { isImageTaskModel } from "./provider-model-filters";
import styles from "./DefaultModelSettingsPage.module.css";

type RoutingKey = keyof ProviderModelRouting;

type DefaultModelSettingsPageProps = {
	onSelectionChange?: (selection: ProviderModelSelection) => void;
};

type RoutingOption = {
	key: RoutingKey;
	title: string;
	description: string;
	filterModel?: (model: ProviderModelInfo) => boolean;
};

const ROUTING_OPTIONS: RoutingOption[] = [
	{
		key: "sessionTitle",
		title: "Session title model",
		description: "Used for automatic session renaming and lightweight title generation."
	},
	{
		key: "workflowPlanner",
		title: "Workflow planner model",
		description: "Used for planning agent workflows before execution."
	},
	{
		key: "imageRecognition",
		title: "Image recognition model",
		description: "Used when the active chat model cannot consume image context directly."
	},
	{
		key: "imageGeneration",
		title: "Image generation/edit model",
		description: "Used by @image-gen and mcp_image_generate for text-to-image or image-to-image tasks. This must be configured explicitly.",
		filterModel: isImageTaskModel
	}
];

function encodeModelRef(ref: ProviderTaskModelRef): string {
	return `${ref.provider}:${ref.model}`;
}

function decodeModelRef(value: string): ProviderTaskModelRef | null {
	const separatorIndex: number = value.indexOf(":");
	if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
		return null;
	}

	return {
		provider: value.slice(0, separatorIndex),
		model: value.slice(separatorIndex + 1)
	};
}

function createModelSelectOptions(selection: ProviderModelSelection | null, filterModel?: (model: ProviderModelInfo) => boolean): SelectProps["options"] {
	if (selection === null) {
		return [];
	}

	return selection.providers.map((provider: ProviderModelSelectionProvider) => {
		const models: ProviderModelInfo[] = filterModel === undefined
			? provider.models
			: provider.models.filter(filterModel);
		return {
			label: provider.displayName,
			options: models.map((model: ProviderModelInfo) => {
				return {
					label: `${model.displayName} / ${provider.displayName}`,
					value: encodeModelRef({
						provider: provider.provider,
						model: model.id
					})
				};
			})
		};
	}).filter((group): boolean => Array.isArray(group.options) && group.options.length > 0);
}

function DefaultModelSettingsPage({ onSelectionChange }: DefaultModelSettingsPageProps): React.JSX.Element {
	const [selection, setSelection] = useState<ProviderModelSelection | null>(null);
	const [savingKey, setSavingKey] = useState<RoutingKey | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadSelection(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const result: ProviderModelSelection = await fetchProviderModelSelection();

				if (cancelled) {
					return;
				}

				setSelection(result);
				onSelectionChange?.(result);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to load default model settings");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadSelection();

		return (): void => {
			cancelled = true;
		};
	}, [onSelectionChange]);

	async function handleRoutingChange(key: RoutingKey, value: string | undefined): Promise<void> {
		if (selection === null) {
			return;
		}

		const modelRouting: Partial<ProviderModelRouting> = {
			[key]: value === undefined ? null : decodeModelRef(value)
		};
		const activeModel: ProviderTaskModelRef = {
			provider: selection.activeModel.providerId,
			model: selection.activeModel.modelId
		};

		try {
			setSavingKey(key);
			setErrorMessage(null);
			const nextSelection: ProviderModelSelection = await saveProviderConfig({
				provider: activeModel.provider,
				model: activeModel.model,
				activate: true,
				modelRouting
			});
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to save model routing");
		} finally {
			setSavingKey(null);
		}
	}

	if (isLoading && selection === null) {
		return (
			<section className={styles.loading}>
				<Spin />
			</section>
		);
	}

	if (selection === null) {
		return (
			<section className={styles.page}>
				<Alert type="error" description={errorMessage ?? "No provider model selection available"} />
			</section>
		);
	}

	return (
		<section className={styles.page}>
			<div className={styles.cards}>
				{errorMessage !== null ? (
					<Alert
						type="warning"
						showIcon={true}
						description={errorMessage}
						action={(
							<Button
								size="small"
								type="text"
								icon={<Icon name="close" />}
								onClick={(): void => setErrorMessage(null)}
							/>
						)}
					/>
				) : null}

				{ROUTING_OPTIONS.map((option: RoutingOption): React.JSX.Element => {
					const routedModel: ProviderTaskModelRef | null = selection.modelRouting[option.key];
					const value: string | undefined = routedModel === null
						? undefined
						: encodeModelRef(routedModel);

					return (
						<article key={option.key} className={styles.card}>
							<div className={styles.cardHeader}>
								<Typography.Title level={4} className={styles.cardTitle}>
									{option.title}
								</Typography.Title>
								<Typography.Text type="secondary" className={styles.description}>
									{option.description}
								</Typography.Text>
							</div>
							<div className={styles.controlRow}>
								<Select
									className={styles.modelSelect}
									options={createModelSelectOptions(selection, option.filterModel)}
									value={value}
									allowClear={{ clearIcon: <Icon name="clear" /> }}
									placeholder="Select a model"
									showSearch={{
										optionFilterProp: "label"
									}}
									loading={savingKey === option.key}
									onChange={(nextValue: string | undefined): void => {
										void handleRoutingChange(option.key, nextValue);
									}}
									suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
								/>
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}

export default DefaultModelSettingsPage;
