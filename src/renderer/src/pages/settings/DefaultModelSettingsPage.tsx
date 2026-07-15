import { Alert, Button, Select, Spin, Typography } from "antd";
import type { SelectProps } from "antd";
import { useEffect, useMemo, useState } from "react";
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
import styles from "./DefaultModelSettingsPage.module.css";

type RoutingKey = keyof ProviderModelRouting;

type DefaultModelSettingsPageProps = {
	onSelectionChange?: (selection: ProviderModelSelection) => void;
};

type RoutingOption = {
	key: RoutingKey;
	title: string;
	description: string;
	fallbackLabel: string;
};

const ROUTING_OPTIONS: RoutingOption[] = [
	{
		key: "sessionTitle",
		title: "Session title model",
		description: "Used for automatic session renaming and lightweight title generation.",
		fallbackLabel: "Use active chat model"
	},
	{
		key: "workflowPlanner",
		title: "Workflow planner model",
		description: "Used for planning agent workflows before execution.",
		fallbackLabel: "Use active chat model"
	},
	{
		key: "imageRecognition",
		title: "Image recognition model",
		description: "Used when the active chat model cannot consume image context directly.",
		fallbackLabel: "Use active chat model"
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

function createModelSelectOptions(selection: ProviderModelSelection | null, fallbackLabel: string): SelectProps["options"] {
	if (selection === null) {
		return [];
	}

	return [
		{
			label: fallbackLabel,
			value: "__default__"
		},
		...selection.providers.map((provider: ProviderModelSelectionProvider) => {
			return {
				label: provider.displayName,
				options: provider.models.map((model: ProviderModelInfo) => {
					return {
						label: `${model.displayName} / ${provider.displayName}`,
						value: encodeModelRef({
							provider: provider.provider,
							model: model.id
						})
					};
				})
			};
		})
	];
}

function getActiveProvider(selection: ProviderModelSelection): ProviderModelSelectionProvider | null {
	return selection.providers.find((provider: ProviderModelSelectionProvider): boolean => {
		return provider.provider === selection.activeModel.providerId;
	}) ?? null;
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

	const activeProvider: ProviderModelSelectionProvider | null = useMemo((): ProviderModelSelectionProvider | null => {
		return selection === null ? null : getActiveProvider(selection);
	}, [selection]);

	async function handleRoutingChange(key: RoutingKey, value: string): Promise<void> {
		if (selection === null) {
			return;
		}

		const modelRouting: Partial<ProviderModelRouting> = {
			[key]: value === "__default__" ? null : decodeModelRef(value)
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
					const value: string = routedModel === null
						? "__default__"
						: encodeModelRef(routedModel);
					const activeLabel: string = activeProvider === null
						? selection.activeModel.modelId
						: `${selection.activeModel.modelId} / ${activeProvider.displayName}`;

					return (
						<article key={option.key} className={styles.card}>
							<div className={styles.cardHeader}>
								<Typography.Title level={4} className={styles.cardTitle}>
									{option.title}
								</Typography.Title>
							</div>
							<div className={styles.controlRow}>
								<Select
									className={styles.modelSelect}
									options={createModelSelectOptions(selection, `${option.fallbackLabel}: ${activeLabel}`)}
									value={value}
									showSearch={true}
									optionFilterProp="label"
									loading={savingKey === option.key}
									onChange={(nextValue: string): void => {
										void handleRoutingChange(option.key, nextValue);
									}}
								/>
							</div>
							<Typography.Text type="secondary" className={styles.description}>
								{option.description}
							</Typography.Text>
						</article>
					);
				})}
			</div>
		</section>
	);
}

export default DefaultModelSettingsPage;
