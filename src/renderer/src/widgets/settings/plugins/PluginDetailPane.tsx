import { Alert, Button, Empty, Flex, Space, Tabs, Tag, Typography } from "antd";
import type { TabsProps } from "antd";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/assets/icons";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import type { PluginRecord } from "@/platform/rpc/plugin-api";
import {
	classificationColor,
	sourceLabel,
	trustColor,
} from "./plugin-formatters";
import { PluginRuntimeSection } from "./PluginRuntimeSection";
import { PluginLogList } from "./PluginLogList";
import styles from "./plugins.module.css";

export function PluginDetailPane({
	plugin,
	busy,
	onToggle,
	onTrust,
	onRequestTrust,
	onRemove,
	onRestart,
	onStop,
	onInstallDependencies,
	logs,
}: {
	plugin?: PluginRecord;
	busy: boolean;
	onToggle: (plugin: PluginRecord) => void;
	onTrust: (plugin: PluginRecord, status: "trusted" | "disabled") => void;
	onRequestTrust: (plugin: PluginRecord) => void;
	onRemove: (plugin: PluginRecord) => void;
	onRestart: () => void;
	onStop: () => void;
	onInstallDependencies: () => void;
	logs: import("@/platform/rpc/plugin-api").PluginRuntimeLog[];
}): React.JSX.Element {
	const { t } = useTranslation();
	if (plugin === undefined) {
		return (
			<div className={styles.emptyDetail}>
				<Typography.Text type="secondary">
					{t("settings.plugins.selectPrompt")}
				</Typography.Text>
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

	const featureContent: React.JSX.Element = (
		<div className={styles.featureContent}>
			<SettingsList title={t("settings.plugins.sections.impact")}>
				<SettingsItem
					title={t("settings.plugins.items.impactCapabilities")}
					description={t(
						"settings.plugins.items.impactCapabilitiesDescription",
					)}
				>
					{plugin.nativePlugin ? (
						<Space>
							{plugin.nativePlugin.capabilities.map(
								(capability): React.JSX.Element => (
									<Tag key={capability}>{capability}</Tag>
								),
							)}
						</Space>
					) : (
						<Typography.Text type="secondary">
							{t("settings.plugins.items.notDeclared")}
						</Typography.Text>
					)}
				</SettingsItem>
			</SettingsList>

			<SettingsList title={t("settings.plugins.sections.status")}>
				<SettingsItem
					title={t("settings.plugins.items.source")}
					description={sourceLabel(plugin.source)}
				>
					<Tag>{plugin.source.type}</Tag>
				</SettingsItem>
				<SettingsItem
					title={t("settings.plugins.items.trust")}
					description={t(`settings.plugins.trust.${plugin.trust}`)}
				>
					<Space>
						<Tag color={trustColor(plugin.trust)}>
							{t(`settings.plugins.trust.${plugin.trust}`)}
						</Tag>
						<Button
							size="small"
							loading={busy}
							onClick={(): void =>
								plugin.trust === "trusted"
									? onTrust(plugin, "disabled")
									: onRequestTrust(plugin)
							}
						>
							{t(
								plugin.trust === "trusted"
									? "settings.plugins.actions.disable"
									: "settings.plugins.actions.trust",
							)}
						</Button>
					</Space>
				</SettingsItem>
				<SettingsItem
					title={t("settings.plugins.items.enabled")}
					description={t("settings.plugins.items.enabledDescription")}
				>
					<Button
						size="small"
						disabled={plugin.trust !== "trusted"}
						loading={busy}
						onClick={(): void => onToggle(plugin)}
					>
						{plugin.enabled
							? t("settings.common.disable")
							: t("settings.common.enable")}
					</Button>
				</SettingsItem>
			</SettingsList>

			<SettingsList title={t("settings.plugins.sections.nativeRuntime")}>
				<SettingsItem
					title={t("settings.plugins.items.nativeEntry")}
					description={
						plugin.nativePlugin?.entry ??
						t("settings.plugins.items.notDeclared")
					}
				>
					<Tag color={plugin.nativePlugin ? "success" : "default"}>
						{plugin.nativePlugin
							? t("settings.plugins.yes")
							: t("settings.plugins.no")}
					</Tag>
				</SettingsItem>
				<SettingsItem
					title={t("settings.plugins.items.capabilities")}
					description={
						plugin.nativePlugin?.capabilities.join(", ") ??
						t("settings.plugins.items.notDeclared")
					}
				>
					<Tag>
						{plugin.nativePlugin?.apiVersion
							? `API ${plugin.nativePlugin.apiVersion}`
							: "—"}
					</Tag>
				</SettingsItem>
			</SettingsList>

			<PluginRuntimeSection
				plugin={plugin}
				busy={busy}
				onRestart={onRestart}
				onStop={onStop}
				onInstallDependencies={onInstallDependencies}
			/>

			<SettingsList title={t("settings.plugins.sections.compatibility")}>
				<SettingsItem
					title={t("settings.plugins.items.harnessBundle")}
					description={
						plugin.compatibility.patchPath ??
						t("settings.plugins.items.notDeclared")
					}
				>
					<Tag
						color={
							plugin.compatibility.harnessBundle
								? "processing"
								: "default"
						}
					>
						{plugin.compatibility.harnessBundle
							? t("settings.plugins.yes")
							: t("settings.plugins.no")}
					</Tag>
				</SettingsItem>
				<SettingsItem
					title={t("settings.plugins.items.harnessClient")}
					description={t(
						"settings.plugins.items.harnessClientDescription",
					)}
				>
					<Tag
						color={
							plugin.compatibility.harnessClient
								? "processing"
								: "default"
						}
					>
						{plugin.compatibility.harnessClient
							? t("settings.plugins.yes")
							: t("settings.plugins.no")}
					</Tag>
				</SettingsItem>
				<SettingsItem
					title={t("settings.plugins.items.entry")}
					description={
						plugin.compatibility.entryPaths.join(", ") ||
						t("settings.plugins.items.notDeclared")
					}
				>
					<Tag color="success">{t("settings.plugins.scanned")}</Tag>
				</SettingsItem>
			</SettingsList>

			{plugin.compatibility.unsupportedFeatures.length > 0 ? (
				<Alert
					type="warning"
					showIcon
					message={t("settings.plugins.unsupported")}
					description={
						<ul className={styles.warningList}>
							{plugin.compatibility.unsupportedFeatures.map(
								(item): React.JSX.Element => (
									<li key={item}>{item}</li>
								),
							)}
						</ul>
					}
				/>
			) : null}
			{plugin.compatibility.warnings.length > 0 ? (
				<Alert
					type="info"
					showIcon
					message={t("settings.plugins.warnings")}
					description={
						<ul className={styles.warningList}>
							{plugin.compatibility.warnings.map(
								(item): React.JSX.Element => (
									<li key={item}>{item}</li>
								),
							)}
						</ul>
					}
				/>
			) : null}

			<SettingsList title={t("settings.plugins.runtime.logs")}>
				<PluginLogList logs={logs} />
			</SettingsList>
			<Flex
				justify="space-between"
				align="center"
				className={styles.footerActions}
			>
				<Typography.Text
					type="secondary"
					copyable={{ text: plugin.fingerprint }}
				>
					{t("settings.plugins.items.fingerprint")}:{" "}
					{plugin.fingerprint.slice(0, 12)}…
				</Typography.Text>
			</Flex>
		</div>
	);

	const tabItems: TabsProps["items"] = [
		{
			key: "details",
			label: t("settings.plugins.details"),
			children: (
				<div className={styles.markdownPane}>
					{description ? (
						<Typography.Paragraph type="secondary">
							{description}
						</Typography.Paragraph>
					) : null}
					{readme ? (
						<Markdown remarkPlugins={[remarkGfm]}>
							{readme}
						</Markdown>
					) : (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t("settings.plugins.noReadme")}
						/>
					)}
				</div>
			),
		},
		{
			key: "features",
			label: t("settings.plugins.features"),
			children: featureContent,
		},
		{
			key: "changelog",
			label: t("settings.plugins.changelog"),
			children: changelog ? (
				<div className={styles.markdownPane}>
					<Markdown remarkPlugins={[remarkGfm]}>{changelog}</Markdown>
				</div>
			) : (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t("settings.plugins.noChangelog")}
				/>
			),
		},
	];

	return (
		<div className={styles.pluginDetailPane}>
			<div className={styles.detailHeader}>
				<Flex justify="space-between" align="center" gap="middle">
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
									name="plugin"
									className={styles.pluginIconFallback}
								/>
							)}
						</div>
						<div className={styles.identityText}>
							<Flex align="center" gap="small">
								<Typography.Title
									level={3}
									className={styles.detailTitle}
								>
									{plugin.packageName}
								</Typography.Title>
							</Flex>
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
							<Space>
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
							</Space>
						</div>
					</Flex>
				</Flex>
			</div>

			<Tabs defaultActiveKey="details" items={tabItems} />
		</div>
	);
}
