import {
	Alert,
	Button,
	Descriptions,
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
import type { PluginRecord } from "@/platform/rpc/plugin-api";
import { classificationColor, sourceLabel } from "./plugin-formatters";
import { PluginLogList } from "./PluginLogList";
import styles from "./plugins.module.css";

export function PluginDetailPane({
	plugin,
	busy,
	onToggle,
	onRequestTrust,
	onRemove,
	onRestart,
	onUpdate,
	onClearQuarantine,
	onRollback,
	onInstallDependencies,
	onPreviewHarness,
	logs,
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
	onUpdate: () => void;
	onClearQuarantine: () => void;
	onRollback: () => void;
	onInstallDependencies: () => void;
	onPreviewHarness: () => void;
	logs: import("@/platform/rpc/plugin-api").PluginRuntimeLog[];
}): React.JSX.Element {
	const { t } = useTranslation();
	const [activeTabKey, setActiveTabKey] = useState("details");
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
	const runtime = plugin.runtime;
	const rssMb = runtime?.resourceUsage?.rssBytes === undefined ? null : (runtime.resourceUsage.rssBytes / (1024 * 1024)).toFixed(1);
	const capabilities = plugin.nativePlugin?.capabilities ?? (plugin.compatibility.harnessBundle ? ["tools", "skills", "hooks", "mcp"] : []);

	const featureContent: React.JSX.Element = (
		<div className={`${styles.tabScroll} ${styles.featureContent}`}>
			<Descriptions
				className={styles.featureDescriptions}
				bordered
				column={1}
				size="small"
			>
				<Descriptions.Item
					label={t("settings.plugins.items.impactCapabilities")}
				>
					<Flex vertical gap="small">
						<Typography.Text type="secondary">
							{t(
								"settings.plugins.items.impactCapabilitiesDescription",
							)}
						</Typography.Text>
						{capabilities.length > 0 ? (
							<Space wrap>
								{capabilities.map(
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
					</Flex>
				</Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.items.source")}>
					<Space>
						<Tag>{plugin.source.type}</Tag>
						<Typography.Text type="secondary">
							{sourceLabel(plugin.source)}
						</Typography.Text>
					</Space>
				</Descriptions.Item>
				<Descriptions.Item
					label={t("settings.plugins.items.nativeEntry")}
				>
					<Space>
						<Tag
							color={plugin.nativePlugin ? "success" : "default"}
						>
							{plugin.nativePlugin
								? t("settings.plugins.yes")
								: t("settings.plugins.no")}
						</Tag>
						<Typography.Text code>
							{plugin.nativePlugin?.entry ??
								t("settings.plugins.items.notDeclared")}
						</Typography.Text>
					</Space>
				</Descriptions.Item>
				<Descriptions.Item
					label={t("settings.plugins.items.capabilities")}
				>
					{capabilities.length > 0
						? capabilities.join(", ")
						: t("settings.plugins.items.notDeclared")}
				</Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.runtime.title")}>
					<Flex vertical gap="small">
						<Space wrap>
							<Tag
								color={
									runtime?.status === "ready"
										? "success"
											: runtime?.status === "failed" || runtime?.status === "quarantined"
											? "error"
											: "default"
								}
							>
								{t(
									`settings.plugins.runtime.status.${runtime?.status ?? "stopped"}`,
								)}
							</Tag>
							<Typography.Text type="secondary">
								{t("settings.plugins.runtime.capabilities", {
									tools: runtime?.registeredTools ?? 0,
									skills: runtime?.registeredSkills ?? 0,
									hooks: runtime?.registeredHooks ?? 0,
									mcp: runtime?.registeredMcpServers ?? 0,
								})}
							</Typography.Text>
						</Space>
						<Space wrap>
							{runtime?.dependencyStatus === "needs_network" ? (
								<Button
									type="primary"
									loading={busy}
									onClick={onInstallDependencies}
								>
									{t(
										"settings.plugins.runtime.installDependencies",
									)}
								</Button>
							) : null}
						</Space>
						{runtime?.lastError ? (
							<Typography.Text type="danger">
								{runtime.lastError}
							</Typography.Text>
						) : null}
					</Flex>
				</Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.runtime.securityTitle")}>
					<Flex vertical gap="small">
						<Descriptions size="small" column={1}>
							<Descriptions.Item label={t("settings.plugins.runtime.sandbox")}>
								<Typography.Text type="secondary">{t("settings.plugins.runtime.sandboxValue")}</Typography.Text>
							</Descriptions.Item>
							<Descriptions.Item label={t("settings.plugins.runtime.network")}>
								<Typography.Text type="secondary">{t("settings.plugins.runtime.networkValue")}</Typography.Text>
							</Descriptions.Item>
							<Descriptions.Item label={t("settings.plugins.runtime.resource")}>
								<Typography.Text type="secondary">{t("settings.plugins.runtime.resourceValue", { active: runtime?.resourceUsage?.activeCalls ?? 0, pending: runtime?.resourceUsage?.pendingCalls ?? 0, rss: rssMb ?? "—" })}</Typography.Text>
							</Descriptions.Item>
						</Descriptions>
						{runtime?.isolation?.status === "quarantined" ? <Alert type="warning" showIcon message={t("settings.plugins.runtime.quarantineReason", { reason: runtime.isolation.reason ?? t("settings.plugins.runtime.status.quarantined") })} /> : null}
					</Flex>
				</Descriptions.Item>
				<Descriptions.Item
					label={t("settings.plugins.items.harnessBundle")}
				>
					<Space>
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
						<Typography.Text type="secondary">
							{plugin.compatibility.patchPath ??
								t("settings.plugins.items.notDeclared")}
						</Typography.Text>
					</Space>
				</Descriptions.Item>
				<Descriptions.Item
					label={t("settings.plugins.items.harnessClient")}
				>
					<Space>
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
						<Typography.Text type="secondary">
							{t(
								"settings.plugins.items.harnessClientDescription",
							)}
						</Typography.Text>
					</Space>
				</Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.items.entry")}>
					<Flex vertical gap="small">
						<Tag color="success">
							{t("settings.plugins.scanned")}
						</Tag>
						<Typography.Text code>
							{plugin.compatibility.entryPaths.join(", ") ||
								t("settings.plugins.items.notDeclared")}
						</Typography.Text>
					</Flex>
				</Descriptions.Item>
				{plugin.compatibility.unsupportedFeatures.length > 0 ? (
					<Descriptions.Item
						label={t("settings.plugins.unsupported")}
					>
						<ul className={styles.warningList}>
							{plugin.compatibility.unsupportedFeatures.map(
								(item): React.JSX.Element => (
									<li key={item}>{item}</li>
								),
							)}
						</ul>
					</Descriptions.Item>
				) : null}
				{plugin.compatibility.warnings.length > 0 ? (
					<Descriptions.Item label={t("settings.plugins.warnings")}>
						<ul className={styles.warningList}>
							{plugin.compatibility.warnings.map(
								(item): React.JSX.Element => (
									<li key={item}>{item}</li>
								),
							)}
						</ul>
					</Descriptions.Item>
				) : null}
				<Descriptions.Item label={t("settings.plugins.runtime.logs")}>
					<PluginLogList logs={logs} />
				</Descriptions.Item>
				<Descriptions.Item
					label={t("settings.plugins.items.fingerprint")}
				>
						<Typography.Text
							className={styles.fingerprintValue}
							type="secondary"
							copyable={{ text: plugin.fingerprint }}
						>
							{plugin.fingerprint}
						</Typography.Text>
				</Descriptions.Item>
			</Descriptions>
		</div>
	);

	const detailsContent: React.JSX.Element = (
		<div className={`${styles.tabScroll} ${styles.markdownPane}`}>
			{description ? (
				<Typography.Paragraph type="secondary">
					{description}
				</Typography.Paragraph>
			) : null}
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
									name="plugin-large"
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
							<Space size="small" wrap>
								<Space.Compact>
									<Button
										size="small"
										disabled={plugin.trust !== "trusted"}
										loading={busy}
										onClick={(): void => onToggle(plugin)}
									>
										{plugin.enabled
											? t("settings.plugins.actions.stop")
											: t(
													"settings.plugins.actions.start",
												)}
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
																				disabled: busy || plugin.trust !== "trusted",
																onClick: onRestart,
															},
															{
																key: "update-plugin",
																icon: <Icon name="download" />,
																label: t("settings.plugins.actions.update"),
																				disabled: busy || plugin.trust !== "trusted",
																onClick: onUpdate,
															},
															...(runtime?.isolation?.status === "quarantined" ? [{
																key: "clear-quarantine",
																icon: <Icon name="reload" />,
																label: t("settings.plugins.actions.clearQuarantine"),
																				disabled: busy,
																				onClick: onClearQuarantine,
															}] : []),
															{
																key: "rollback-plugin",
																icon: <Icon name="reload" />,
																label: t("settings.plugins.actions.rollback"),
																				disabled: busy,
																				onClick: onRollback,
															},
											...(plugin.compatibility.harnessBundle ? [{
												key: "preview-harness",
												icon: <Icon name="search" />,
												label: t("settings.plugins.harness.preview"),
																				disabled: busy,
																				onClick: onPreviewHarness,
											}] : []),
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
										: t(
												"settings.plugins.actions.untrusted",
											)}
								</Button>
							</Space>
						</div>
					</Flex>
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
