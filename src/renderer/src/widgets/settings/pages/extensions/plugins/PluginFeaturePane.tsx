import {
	Alert,
	Button,
	Descriptions,
	Empty,
	Flex,
	Space,
	Tag,
	Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type {
	PluginDevelopmentStatus,
	PluginRecord,
	PluginRuntimeLog,
	PluginRuntimeSnapshot,
} from "@/platform/rpc/plugin-api";
import { sourceLabel } from "./plugin-formatters";
import { PluginLogList } from "./PluginLogList";
import styles from "./plugins.module.css";

const capabilityIcons: Record<string, string> = {
	tools: "repair",
	skills: "skill",
	hooks: "hook",
	mcp: "mcp",
};

function runtimeTagColor(status: PluginRuntimeSnapshot["status"]): string {
	if (status === "ready") return "success";
	if (status === "failed" || status === "quarantined") return "error";
	if (status === "starting") return "processing";
	return "default";
}

export function PluginFeaturePane({
	plugin,
	busy,
	logs,
	developmentStatus,
	onInstallDependencies,
}: {
	plugin: PluginRecord;
	busy: boolean;
	logs: PluginRuntimeLog[];
	developmentStatus?: PluginDevelopmentStatus | null;
	onInstallDependencies: () => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const runtime = plugin.runtime;
	const capabilities =
		plugin.nativePlugin?.capabilities ??
		(plugin.compatibility.harnessBundle
			? ["tools", "skills", "hooks", "mcp"]
			: []);
	const p2Declarations = plugin.p2?.declarations ?? {};
	const runtimeStatus = runtime?.status ?? "stopped";
	const rssMb =
		runtime?.resourceUsage?.rssBytes === undefined
			? "—"
			: (runtime.resourceUsage.rssBytes / (1024 * 1024)).toFixed(1);

	return (
		<div className={`${styles.tabScroll} ${styles.featureContent}`}>
			<section className={styles.featureSection}>
				<div className={styles.featureSectionHeader}>
					<div>
						<Typography.Title
							level={5}
							className={styles.featureSectionTitle}
						>
							{t("settings.plugins.sections.impact")}
						</Typography.Title>
						<Typography.Text type="secondary">
							{t(
								"settings.plugins.items.impactCapabilitiesDescription",
							)}
						</Typography.Text>
					</div>
					<Tag>{capabilities.length}</Tag>
				</div>
				{capabilities.length === 0 ? (
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={t("settings.plugins.items.notDeclared")}
					/>
				) : (
					<div className={styles.capabilityGrid}>
						{capabilities.map(
							(capability): React.JSX.Element => (
								<div
									className={styles.capabilityItem}
									key={capability}
								>
									<Icon
										name={
											capabilityIcons[capability] ??
											"plugin"
										}
										className={styles.capabilityIcon}
										aria-hidden="true"
									/>
									<Typography.Text strong>
										{capability}
									</Typography.Text>
								</div>
							),
						)}
					</div>
				)}
			</section>

			<section className={styles.featureSection}>
				<Typography.Title
					level={5}
					className={styles.featureSectionTitle}
				>
					{t("settings.plugins.sections.status")}
				</Typography.Title>
				<Descriptions
					className={styles.featureDescriptions}
					bordered
					column={2}
					size="small"
				>
					<Descriptions.Item
						label={t("settings.plugins.sections.status")}
					>
						<Tag color={runtimeTagColor(runtimeStatus)}>
							{t(
								`settings.plugins.runtime.status.${runtimeStatus}`,
							)}
						</Tag>
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.items.enabled")}
					>
						<Tag color={plugin.enabled ? "success" : "default"}>
							{plugin.enabled
								? t("settings.plugins.actions.stop")
								: t("settings.plugins.actions.start")}
						</Tag>
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.runtime.capabilities")}
					>
						<Typography.Text type="secondary">
							{t("settings.plugins.runtime.capabilities", {
								tools: runtime?.registeredTools ?? 0,
								skills: runtime?.registeredSkills ?? 0,
								hooks: runtime?.registeredHooks ?? 0,
								mcp: runtime?.registeredMcpServers ?? 0,
							})}
						</Typography.Text>
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.items.trust")}
					>
						<Tag
							color={
								plugin.trust === "trusted"
									? "success"
									: "warning"
							}
						>
							{t(`settings.plugins.trust.${plugin.trust}`)}
						</Tag>
					</Descriptions.Item>
				</Descriptions>
				{runtime?.dependencyStatus === "needs_network" ? (
					<Button
						type="link"
						loading={busy}
						onClick={onInstallDependencies}
						className={styles.featureAction}
					>
						{t("settings.plugins.runtime.installDependencies")}
					</Button>
				) : null}
				{runtime?.lastError ? (
					<Alert
						className={styles.featureAlert}
						type="error"
						showIcon
						message={runtime.lastError}
					/>
				) : null}
			</section>

			<section className={styles.featureSection}>
				<Typography.Title
					level={5}
					className={styles.featureSectionTitle}
				>
					{t("settings.plugins.runtime.securityTitle")}
				</Typography.Title>
				<Descriptions
					className={styles.featureDescriptions}
					bordered
					column={2}
					size="small"
				>
					<Descriptions.Item
						label={t("settings.plugins.runtime.sandbox")}
					>
						<Typography.Text type="secondary">
							{t("settings.plugins.runtime.sandboxValue")}
						</Typography.Text>
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.runtime.network")}
					>
						<Tag>{t("settings.plugins.runtime.networkValue")}</Tag>
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.runtime.resource")}
					>
						<Typography.Text type="secondary">
							{t("settings.plugins.runtime.resourceValue", {
								active:
									runtime?.resourceUsage?.activeCalls ?? 0,
								pending:
									runtime?.resourceUsage?.pendingCalls ?? 0,
								rss: rssMb,
							})}
						</Typography.Text>
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.runtime.logs")}
					>
						{logs.length}
					</Descriptions.Item>
				</Descriptions>
				{runtime?.isolation?.status === "quarantined" ? (
					<Alert
						className={styles.featureAlert}
						type="warning"
						showIcon
						message={t(
							"settings.plugins.runtime.quarantineReason",
							{
								reason:
									runtime.isolation.reason ??
									t(
										"settings.plugins.runtime.status.quarantined",
									),
							},
						)}
					/>
				) : null}
			</section>

			<section className={styles.featureSection}>
				<Typography.Title
					level={5}
					className={styles.featureSectionTitle}
				>
					{t("settings.plugins.sections.compatibility")}
				</Typography.Title>
				<Descriptions
					className={styles.featureDescriptions}
					bordered
					column={2}
					size="small"
				>
					<Descriptions.Item
						label={t("settings.plugins.items.nativeEntry")}
					>
						{plugin.nativePlugin?.entry ? (
							<Space>
								<Tag color="success">
									{t("settings.plugins.yes")}
								</Tag>
								<Typography.Text code>
									{plugin.nativePlugin.entry}
								</Typography.Text>
							</Space>
						) : (
							t("settings.plugins.items.notDeclared")
						)}
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
							{plugin.compatibility.patchPath ? (
								<Typography.Text code>
									{plugin.compatibility.patchPath}
								</Typography.Text>
							) : null}
						</Space>
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.items.harnessClient")}
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
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.items.p2Capabilities")}
					>
						{Object.keys(p2Declarations).length === 0 ? (
							t("settings.plugins.items.notDeclared")
						) : (
							<Space wrap>
								{Object.entries(p2Declarations).map(
									([key, value]) => (
										<Tag key={key}>
											{key}:{" "}
											{Array.isArray(value)
												? value.length
												: value === undefined
													? 0
													: 1}
										</Tag>
									),
								)}
							</Space>
						)}
					</Descriptions.Item>
				</Descriptions>
				{plugin.compatibility.unsupportedFeatures.length > 0 ? (
					<Alert
						className={styles.featureAlert}
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
						className={styles.featureAlert}
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
			</section>

			<section className={styles.featureSection}>
				<Typography.Title
					level={5}
					className={styles.featureSectionTitle}
				>
					{t("settings.plugins.sections.nativeRuntime")}
				</Typography.Title>
				<Descriptions
					className={styles.featureDescriptions}
					bordered
					column={2}
					size="small"
				>
					<Descriptions.Item
						label={t("settings.plugins.items.source")}
					>
						<Space>
							<Tag>{plugin.source.type}</Tag>
							<Typography.Text type="secondary">
								{sourceLabel(plugin.source)}
							</Typography.Text>
						</Space>
					</Descriptions.Item>
					<Descriptions.Item
						label={t("settings.plugins.items.entry")}
					>
						<Typography.Text code>
							{plugin.compatibility.entryPaths.join(", ") ||
								t("settings.plugins.items.notDeclared")}
						</Typography.Text>
					</Descriptions.Item>
				</Descriptions>
			</section>

			<section className={styles.featureSection}>
				<Typography.Title
					level={5}
					className={styles.featureSectionTitle}
				>
					{t("settings.plugins.runtime.logs")}
				</Typography.Title>
				<PluginLogList logs={logs} />
			</section>

			<section className={styles.featureSection}>
				<Typography.Title
					level={5}
					className={styles.featureSectionTitle}
				>
					{t("settings.plugins.development.title")}
				</Typography.Title>
				{developmentStatus === undefined ||
				developmentStatus === null ? (
					<Typography.Text type="secondary">
						{t("settings.plugins.development.noDiagnostics")}
					</Typography.Text>
				) : (
					<Flex vertical gap="small">
						<Space wrap>
							<Tag
								color={
									developmentStatus.phase === "passed"
										? "success"
										: developmentStatus.phase ===
													"failed" ||
											  developmentStatus.phase ===
													"exhausted"
											? "error"
											: "processing"
								}
							>
								{t(
									`settings.plugins.development.phases.${developmentStatus.phase}`,
								)}
							</Tag>
							<Typography.Text type="secondary">
								{t("settings.plugins.development.attempts", {
									static: developmentStatus.staticAttempt,
									runtime: developmentStatus.runtimeAttempt,
								})}
							</Typography.Text>
							{developmentStatus.lastTest ? (
								<Typography.Text>
									{t("settings.plugins.development.passed", {
										count: developmentStatus.lastTest
											.passed,
									})}{" "}
									·{" "}
									{t("settings.plugins.development.failed", {
										count: developmentStatus.lastTest
											.failed,
									})}
								</Typography.Text>
							) : null}
						</Space>
						{developmentStatus.lastDiagnostics.length > 0 ? (
							<Alert
								type="error"
								showIcon
								message={t(
									"settings.plugins.development.diagnostics",
								)}
								description={
									<ul className={styles.warningList}>
										{developmentStatus.lastDiagnostics
											.slice(-8)
											.map(
												(
													diagnostic,
												): React.JSX.Element => (
													<li
														key={`${diagnostic.code}-${diagnostic.caseId ?? ""}`}
													>
														{diagnostic.message} ·{" "}
														{diagnostic.retryable
															? t(
																	"settings.plugins.development.retryable",
																)
															: t(
																	"settings.plugins.development.notRetryable",
																)}
													</li>
												),
											)}
									</ul>
								}
							/>
						) : null}
					</Flex>
				)}
			</section>

			<section className={styles.featureSection}>
				<Typography.Title
					level={5}
					className={styles.featureSectionTitle}
				>
					{t("settings.plugins.items.fingerprint")}
				</Typography.Title>
				<Typography.Text
					className={styles.fingerprintValue}
					type="secondary"
					copyable={{ text: plugin.fingerprint }}
				>
					{plugin.fingerprint}
				</Typography.Text>
			</section>
		</div>
	);
}
