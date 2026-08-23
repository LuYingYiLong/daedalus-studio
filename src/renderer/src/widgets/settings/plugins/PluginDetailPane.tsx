import {
	Button,
	Dropdown,
	Empty,
	Flex,
	Space,
	Tabs,
	Tag,
	Typography,
} from "antd";
import type { TabsProps } from "antd";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/assets/icons";
import type {
	PluginDevelopmentStatus,
	PluginRecord,
} from "@/platform/rpc/plugin-api";
import { classificationColor } from "./plugin-formatters";
import { PluginFeaturePane } from "./PluginFeaturePane";
import styles from "./plugins.module.css";

export function PluginDetailPane({
	plugin,
	busy,
	onToggle,
	onRequestTrust,
	onRemove,
	onRestart,
	onClearQuarantine,
	onOpenDirectory,
	onInstallDependencies,
	onPreviewHarness,
	logs,
	developmentStatus,
}: {
	plugin?: PluginRecord;
	busy: boolean;
	onToggle: (plugin: PluginRecord) => void;
	onRequestTrust: (
		plugin: PluginRecord,
		status: "trusted" | "disabled",
	) => void;
	onRemove: (plugin: PluginRecord) => void;
	onRestart: () => void;
	onClearQuarantine: () => void;
	onOpenDirectory: () => void;
	onInstallDependencies: () => void;
	onPreviewHarness: () => void;
	logs: import("@/platform/rpc/plugin-api").PluginRuntimeLog[];
	developmentStatus?: PluginDevelopmentStatus | null;
}): React.JSX.Element {
	const { t } = useTranslation();
	const [activeTabKey, setActiveTabKey] = useState("details");
	if (plugin === undefined) {
		return (
			<div className={styles.emptyDetail}>
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t("settings.plugins.selectPrompt")}
				/>
			</div>
		);
	}

	const presentation = plugin.presentation;
	const description: string | undefined =
		presentation?.description?.trim() || undefined;
	const readme: string | undefined =
		presentation?.readme?.trim() || undefined;
	const changelog: string | undefined =
		presentation?.changelog?.trim() || undefined;
	const runtime = plugin.runtime;

	const featureContent: React.JSX.Element = (
		<PluginFeaturePane
			plugin={plugin}
			busy={busy}
			logs={logs}
			developmentStatus={developmentStatus}
			onInstallDependencies={onInstallDependencies}
		/>
	);

	const detailsContent: React.JSX.Element = (
		<div className={`${styles.tabScroll} ${styles.markdownPane}`}>
			{readme ? (
				<Markdown remarkPlugins={[remarkGfm]}>{readme}</Markdown>
			) : (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t("settings.plugins.noReadme")}
				/>
			)}
		</div>
	);
	const changelogContent: React.JSX.Element = (
		<div className={`${styles.tabScroll} ${styles.markdownPane}`}>
			{changelog ? (
				<Markdown remarkPlugins={[remarkGfm]}>{changelog}</Markdown>
			) : (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t("settings.plugins.noChangelog")}
				/>
			)}
		</div>
	);

	const tabItems: TabsProps["items"] = [
		{
			key: "details",
			label: t("settings.plugins.details"),
			children: null,
		},
		{
			key: "features",
			label: t("settings.plugins.features"),
			children: null,
		},
		{
			key: "changelog",
			label: t("settings.plugins.changelog"),
			children: null,
		},
	];

	return (
		<div className={styles.pluginDetailPane}>
			<div className={styles.detailHeader}>
				<Flex justify="space-between" align="center">
					<Flex
						align="center"
						gap="small"
						className={styles.identity}
					>
						<div className={styles.pluginIcon} aria-hidden="true">
							{presentation?.iconDataUrl ? (
								<img
									src={presentation.iconDataUrl}
									alt=""
									className={styles.pluginIconImage}
								/>
							) : (
								<Icon
									name="plugin-large"
									className={styles.pluginIconFallback}
								/>
							)}
						</div>
						<div className={styles.identityText}>
							<Typography.Title
								level={3}
								className={styles.detailTitle}
							>
								{plugin.packageName}
							</Typography.Title>
							{description ? (
								<Typography.Paragraph type="secondary">
									{description}
								</Typography.Paragraph>
							) : null}
							<Flex align="center" gap="small">
								<Typography.Text type="secondary">
									{plugin.version}
								</Typography.Text>
								<Tag
									color={classificationColor(
										plugin.compatibility.classification,
									)}
								>
									{t(
										`settings.plugins.classification.${plugin.compatibility.classification}`,
									)}
								</Tag>
							</Flex>
						</div>
					</Flex>
				</Flex>
				<Flex gap="small">
					<Space.Compact>
						<Button
							size="small"
							disabled={plugin.trust !== "trusted"}
							loading={busy}
							onClick={(): void => onToggle(plugin)}
						>
							{plugin.enabled
								? t("settings.plugins.actions.stop")
								: t("settings.plugins.actions.start")}
						</Button>
						<Dropdown
							trigger={["click"]}
							menu={{
								items: [
									{
										key: "restart-runtime",
										icon: <Icon name="reload" />,
										label: t(
											"settings.plugins.runtime.restart",
										),
										disabled:
											busy || plugin.trust !== "trusted",
										onClick: onRestart,
									},
									{
										key: "open-plugin-directory",
										icon: <Icon name="folder-open" />,
										label: t("settings.plugins.actions.openDirectory"),
										disabled: busy,
										onClick: onOpenDirectory,
									},
									...(runtime?.isolation?.status ===
									"quarantined"
										? [
												{
													key: "clear-quarantine",
													icon: (
														<Icon name="reload" />
													),
													label: t(
														"settings.plugins.actions.clearQuarantine",
													),
													disabled: busy,
													onClick: onClearQuarantine,
												},
											]
										: []),
									...(plugin.compatibility.harnessBundle
										? [
												{
													key: "preview-harness",
													icon: (
														<Icon name="vision" />
													),
													label: t(
														"settings.plugins.harness.preview",
													),
													disabled: busy,
													onClick: onPreviewHarness,
												},
											]
										: []),
								],
							}}
						>
							<Button
								size="small"
								icon={<Icon name="arrow-down" />}
							/>
						</Dropdown>
					</Space.Compact>
					<Button
						danger
						size="small"
						type="primary"
						icon={<Icon name="remove" />}
						loading={busy}
						onClick={(): void => onRemove(plugin)}
					>
						{t("settings.plugins.actions.remove")}
					</Button>
					<Button
						size="small"
						loading={busy}
						danger={plugin.trust === "trusted"}
						onClick={(): void =>
							onRequestTrust(
								plugin,
								plugin.trust === "trusted"
									? "disabled"
									: "trusted",
							)
						}
					>
						{plugin.trust === "trusted"
							? t("settings.plugins.actions.trusted")
							: t("settings.plugins.actions.untrusted")}
					</Button>
				</Flex>
			</div>

			<Tabs
				className={styles.detailTabs}
				activeKey={activeTabKey}
				animated={false}
				onChange={setActiveTabKey}
				items={tabItems}
			/>
			<div className={styles.tabViewport}>
				{activeTabKey === "features"
					? featureContent
					: activeTabKey === "changelog"
						? changelogContent
						: detailsContent}
			</div>
		</div>
	);
}
