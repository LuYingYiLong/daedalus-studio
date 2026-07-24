import { Alert, Button, Select, Spin, Typography } from "antd";
import type { SelectProps } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
	titleKey: string;
	descriptionKey: string;
	filterModel?: (model: ProviderModelInfo) => boolean;
	placeholderKey?: string;
};

const ROUTING_OPTIONS: RoutingOption[] = [
	{
		key: "sessionTitle",
		titleKey: "settings.defaultModel.routing.sessionTitle.title",
		descriptionKey: "settings.defaultModel.routing.sessionTitle.description"
	},
	{
		key: "workflowPlanner",
		titleKey: "settings.defaultModel.routing.workflowPlanner.title",
		descriptionKey: "settings.defaultModel.routing.workflowPlanner.description"
	},
	{
		key: "imageRecognition",
		titleKey: "settings.defaultModel.routing.imageRecognition.title",
		descriptionKey: "settings.defaultModel.routing.imageRecognition.description"
	},
	{
		key: "imageGeneration",
		titleKey: "settings.defaultModel.routing.imageGeneration.title",
		descriptionKey: "settings.defaultModel.routing.imageGeneration.description",
		filterModel: isImageTaskModel
	},
	{
		key: "gitCommit",
		titleKey: "settings.defaultModel.routing.gitCommit.title",
		descriptionKey: "settings.defaultModel.routing.gitCommit.description"
	},
	{
		key: "commandReview",
		titleKey: "settings.defaultModel.routing.commandReview.title",
		descriptionKey: "settings.defaultModel.routing.commandReview.description",
		filterModel: (model: ProviderModelInfo): boolean => !isImageTaskModel(model),
		placeholderKey: "settings.defaultModel.notConfigured"
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
	const { t } = useTranslation();
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
					setErrorMessage(error instanceof Error ? error.message : t("settings.defaultModel.errors.load"));
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
	}, [onSelectionChange, t]);

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
			setErrorMessage(error instanceof Error ? error.message : t("settings.defaultModel.errors.save"));
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
				<Alert type="error" description={errorMessage ?? t("settings.defaultModel.errors.noSelection")} />
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
									{t(option.titleKey)}
								</Typography.Title>
								<Typography.Text type="secondary" className={styles.description}>
									{t(option.descriptionKey)}
								</Typography.Text>
							</div>
							<div className={styles.controlRow}>
								<Select
									className={styles.modelSelect}
									options={createModelSelectOptions(selection, option.filterModel)}
									value={value}
									allowClear={{ clearIcon: <Icon name="clear" /> }}
									placeholder={option.placeholderKey === undefined ? t("settings.defaultModel.selectModel") : t(option.placeholderKey)}
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
