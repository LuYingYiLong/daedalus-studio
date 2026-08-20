import {
	App,
	Alert,
	Button,
	Empty,
	Flex,
	Form,
	Input,
	Menu,
	Modal,
	Select,
	Space,
	Spin,
	Tag,
	Typography,
} from "antd";
import type { MenuProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	fetchPluginCatalog,
	installPlugin,
	removePlugin,
	updatePluginProfile,
	updatePluginTrust,
	type PluginCatalogResult,
	type PluginRecord,
	type PluginSource,
} from "@/platform/rpc/plugin-api";
import styles from "./PluginsSettingsPage.module.css";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";

type InstallSourceType = PluginSource["type"];
type PluginMenuItem = NonNullable<MenuProps["items"]>[number];

function classificationColor(
	classification: PluginRecord["compatibility"]["classification"],
): string {
	if (classification === "native" || classification === "both")
		return "success";
	if (classification === "unsupported") return "error";
	if (
		classification === "harness-bundle" ||
		classification === "harness-client"
	)
		return "processing";
	return "default";
}

function trustColor(trust: PluginRecord["trust"]): string {
	if (trust === "trusted") return "success";
	if (trust === "disabled") return "default";
	return "warning";
}

function sourceLabel(source: PluginSource): string {
	if (source.type === "npm") return `${source.packageName}@${source.version}`;
	if (source.type === "git")
		return `${source.url}#${source.commit.slice(0, 8)}`;
	return source.path;
}

function PluginsSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [catalog, setCatalog] = useState<PluginCatalogResult | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [installOpen, setInstallOpen] = useState<boolean>(false);
	const [sourceType, setSourceType] = useState<InstallSourceType>("local");
	const [installing, setInstalling] = useState<boolean>(false);
	const [busyPluginId, setBusyPluginId] = useState<string | null>(null);
	const [form] = Form.useForm<Record<string, string>>();

	const selectedPlugin: PluginRecord | undefined = catalog?.plugins.find(
		(plugin): boolean => plugin.id === selectedId,
	);

	async function refresh(): Promise<void> {
		try {
			setError(null);
			setCatalog(await fetchPluginCatalog());
		} catch (caught: unknown) {
			setError(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.errors.load"),
			);
		} finally {
			setLoading(false);
		}
	}

	useEffect((): void => {
		void refresh();
	}, []);

	useEffect((): void => {
		if (
			selectedId !== null &&
			catalog?.plugins.some((plugin): boolean => plugin.id === selectedId)
		)
			return;
		setSelectedId(catalog?.plugins[0]?.id ?? null);
	}, [catalog, selectedId]);

	const menuItems: PluginMenuItem[] = useMemo((): PluginMenuItem[] => {
		if (catalog === null) return [];
		return catalog.plugins.map(
			(plugin): PluginMenuItem => ({
				key: plugin.id,
				label: (
					<div className={styles.menuItem}>
						<div className={styles.menuText}>
							<Typography.Text strong ellipsis>
								{plugin.packageName}
							</Typography.Text>
							<Typography.Text type="secondary" ellipsis>
								{plugin.version}
							</Typography.Text>
						</div>
						<Tag
							color={classificationColor(
								plugin.compatibility.classification,
							)}
						>
							{t(
								`settings.plugins.classification.${plugin.compatibility.classification}`,
							)}
						</Tag>
					</div>
				),
			}),
		);
	}, [catalog, t]);

	async function handleInstall(
		values: Record<string, string>,
	): Promise<void> {
		let source: PluginSource;
		if (sourceType === "local")
			source = { type: "local", path: values.path!.trim() };
		else if (sourceType === "tarball")
			source = {
				type: "tarball",
				path: values.path!.trim(),
				sha256: values.sha256!.trim(),
			};
		else if (sourceType === "npm")
			source = {
				type: "npm",
				packageName: values.packageName!.trim(),
				version: values.version!.trim(),
			};
		else
			source = {
				type: "git",
				url: values.url!.trim(),
				commit: values.commit!.trim(),
			};
		try {
			setInstalling(true);
			const result = await installPlugin(source);
			setCatalog(result.catalog);
			setSelectedId(result.plugin.id);
			setInstallOpen(false);
			form.resetFields();
			message.success(t("settings.plugins.messages.installed"));
		} catch (caught: unknown) {
			message.error(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.errors.install"),
			);
		} finally {
			setInstalling(false);
		}
	}

	async function togglePlugin(plugin: PluginRecord): Promise<void> {
		if (catalog === null) return;
		if (plugin.trust !== "trusted") {
			message.warning(t("settings.plugins.messages.trustRequired"));
			return;
		}
		const activeIds: string[] = catalog.activeProfile.pluginIds;
		const nextIds: string[] = activeIds.includes(plugin.id)
			? activeIds.filter((id): boolean => id !== plugin.id)
			: [...activeIds, plugin.id];
		try {
			setBusyPluginId(plugin.id);
			setCatalog(await updatePluginProfile(nextIds));
		} catch (caught: unknown) {
			message.error(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.errors.profile"),
			);
		} finally {
			setBusyPluginId(null);
		}
	}

	function confirmRemove(plugin: PluginRecord): void {
		modal.confirm({
			title: t("settings.plugins.confirm.removeTitle"),
			content: t("settings.plugins.confirm.removeDescription", {
				name: plugin.packageName,
			}),
			okText: t("settings.common.delete"),
			okButtonProps: { danger: true },
			onOk: async (): Promise<void> => {
				try {
					setBusyPluginId(plugin.id);
					setCatalog(await removePlugin(plugin.id));
					message.success(t("settings.plugins.messages.removed"));
				} catch (caught: unknown) {
					message.error(
						caught instanceof Error
							? caught.message
							: t("settings.plugins.errors.remove"),
					);
				} finally {
					setBusyPluginId(null);
				}
			},
		});
	}

	async function trust(
		plugin: PluginRecord,
		status: "trusted" | "disabled",
	): Promise<void> {
		try {
			setBusyPluginId(plugin.id);
			const result = await updatePluginTrust(
				plugin.id,
				plugin.fingerprint,
				status,
			);
			setCatalog((current): PluginCatalogResult | null =>
				current === null
					? null
					: {
							...current,
							plugins: current.plugins.map(
								(candidate): PluginRecord =>
									candidate.id === result.plugin.id
										? result.plugin
										: candidate,
							),
						},
			);
			message.success(
				t(
					status === "trusted"
						? "settings.plugins.messages.trusted"
						: "settings.plugins.messages.disabled",
				),
			);
		} catch (caught: unknown) {
			message.error(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.errors.trust"),
			);
		} finally {
			setBusyPluginId(null);
		}
	}

	async function browsePath(): Promise<void> {
		const path: string | null =
			sourceType === "local"
				? await window.electronAPI.workspaceFs.pickWorkspaceDirectory()
				: await window.electronAPI.sessionFs.pickImportSource({
						dialogTitle: t("settings.plugins.actions.chooseFile"),
						buttonLabel: t("settings.plugins.actions.choose"),
					});
		if (path !== null) form.setFieldValue("path", path);
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Flex justify="space-between" align="flex-start" gap={16}>
					<div>
						<Typography.Title level={3} className={styles.title}>
							{t("settings.plugins.title")}
						</Typography.Title>
					</div>
					<Space>
						<Button
							icon={<Icon name="reload" />}
							onClick={(): void => {
								setLoading(true);
								void refresh();
							}}
						>
							{t("settings.plugins.actions.refresh")}
						</Button>
						<Button
							type="primary"
							icon={<Icon name="add" />}
							onClick={(): void => setInstallOpen(true)}
						>
							{t("settings.plugins.actions.add")}
						</Button>
					</Space>
				</Flex>
			</header>
			{error !== null ? (
				<Alert
					type="error"
					showIcon
					message={error}
					className={styles.alert}
				/>
			) : null}
			<div className={styles.content}>
				<div className={styles.listPane}>
					{loading ? (
						<div className={styles.center}>
							<Spin />
						</div>
					) : menuItems.length === 0 ? (
						<Empty description={t("settings.plugins.empty")} />
					) : (
						<Menu
							className={styles.menu}
							mode="inline"
							items={menuItems}
							selectedKeys={
								selectedId === null ? [] : [selectedId]
							}
							onClick={({ key }): void => setSelectedId(key)}
						/>
					)}
				</div>
				<div className={styles.detailPane}>
					{selectedPlugin === undefined ? (
						<Empty
							description={t("settings.plugins.selectPrompt")}
						/>
					) : (
						<>
							<div className={styles.detailHeader}>
								<div>
									<Typography.Title
										level={4}
										className={styles.detailTitle}
									>
										{selectedPlugin.packageName}
									</Typography.Title>
									<Typography.Text type="secondary">
										{selectedPlugin.version}
									</Typography.Text>
								</div>
								<Tag
									color={classificationColor(
										selectedPlugin.compatibility
											.classification,
									)}
								>
									{t(
										`settings.plugins.classification.${selectedPlugin.compatibility.classification}`,
									)}
								</Tag>
							</div>
							<SettingsList
								title={t("settings.plugins.sections.status")}
							>
								<SettingsItem
									title={t("settings.plugins.items.source")}
									description={sourceLabel(
										selectedPlugin.source,
									)}
								>
									<Tag>{selectedPlugin.source.type}</Tag>
								</SettingsItem>
								<SettingsItem
									title={t("settings.plugins.items.trust")}
									description={t(
										`settings.plugins.trust.${selectedPlugin.trust}`,
									)}
								>
									<Space>
										<Tag
											color={trustColor(
												selectedPlugin.trust,
											)}
										>
											{t(
												`settings.plugins.trust.${selectedPlugin.trust}`,
											)}
										</Tag>
										{selectedPlugin.trust === "trusted" ? (
											<Button
												size="small"
												loading={
													busyPluginId ===
													selectedPlugin.id
												}
												onClick={(): void => {
													void trust(
														selectedPlugin,
														"disabled",
													);
												}}
											>
												{t(
													"settings.plugins.actions.disable",
												)}
											</Button>
										) : (
											<Button
												size="small"
												loading={
													busyPluginId ===
													selectedPlugin.id
												}
												onClick={(): void => {
													void trust(
														selectedPlugin,
														"trusted",
													);
												}}
											>
												{t(
													"settings.plugins.actions.trust",
												)}
											</Button>
										)}
									</Space>
								</SettingsItem>
								<SettingsItem
									title={t("settings.plugins.items.enabled")}
									description={t(
										"settings.plugins.items.enabledDescription",
									)}
								>
									<Button
										size="small"
										disabled={
											selectedPlugin.trust !== "trusted"
										}
										loading={
											busyPluginId === selectedPlugin.id
										}
										onClick={(): void => {
											void togglePlugin(selectedPlugin);
										}}
									>
										{selectedPlugin.enabled
											? t("settings.common.disable")
											: t("settings.common.enable")}
									</Button>
								</SettingsItem>
							</SettingsList>
							<SettingsList
								title={t(
									"settings.plugins.sections.compatibility",
								)}
							>
								<SettingsItem
									title={t(
										"settings.plugins.items.harnessBundle",
									)}
									description={
										selectedPlugin.compatibility
											.patchPath ??
										t("settings.plugins.items.notDeclared")
									}
								>
									<Tag
										color={
											selectedPlugin.compatibility
												.harnessBundle
												? "processing"
												: "default"
										}
									>
										{selectedPlugin.compatibility
											.harnessBundle
											? t("settings.plugins.yes")
											: t("settings.plugins.no")}
									</Tag>
								</SettingsItem>
								<SettingsItem
									title={t(
										"settings.plugins.items.harnessClient",
									)}
									description={t(
										"settings.plugins.items.harnessClientDescription",
									)}
								>
									<Tag
										color={
											selectedPlugin.compatibility
												.harnessClient
												? "processing"
												: "default"
										}
									>
										{selectedPlugin.compatibility
											.harnessClient
											? t("settings.plugins.yes")
											: t("settings.plugins.no")}
									</Tag>
								</SettingsItem>
								<SettingsItem
									title={t("settings.plugins.items.entry")}
									description={
										selectedPlugin.compatibility.entryPaths.join(
											", ",
										) ||
										t("settings.plugins.items.notDeclared")
									}
								>
									<Tag
										color={
											selectedPlugin.compatibility.entryPaths.every(
												(entry): boolean =>
													entry.length > 0,
											)
												? "success"
												: "warning"
										}
									>
										{t("settings.plugins.scanned")}
									</Tag>
								</SettingsItem>
							</SettingsList>
							{selectedPlugin.compatibility.unsupportedFeatures
								.length > 0 ? (
								<Alert
									type="warning"
									showIcon
									message={t("settings.plugins.unsupported")}
									description={
										<ul className={styles.warningList}>
											{selectedPlugin.compatibility.unsupportedFeatures.map(
												(item): React.JSX.Element => (
													<li key={item}>{item}</li>
												),
											)}
										</ul>
									}
								/>
							) : null}
							{selectedPlugin.compatibility.warnings.length >
							0 ? (
								<Alert
									type="info"
									showIcon
									message={t("settings.plugins.warnings")}
									description={
										<ul className={styles.warningList}>
											{selectedPlugin.compatibility.warnings.map(
												(item): React.JSX.Element => (
													<li key={item}>{item}</li>
												),
											)}
										</ul>
									}
								/>
							) : null}
							<Flex
								justify="space-between"
								align="center"
								className={styles.footerActions}
							>
								<Typography.Text
									type="secondary"
									copyable={{
										text: selectedPlugin.fingerprint,
									}}
								>
									{t("settings.plugins.items.fingerprint")}:{" "}
									{selectedPlugin.fingerprint.slice(0, 12)}…
								</Typography.Text>
								<Button
									danger
									onClick={(): void =>
										confirmRemove(selectedPlugin)
									}
									loading={busyPluginId === selectedPlugin.id}
								>
									{t("settings.plugins.actions.remove")}
								</Button>
							</Flex>
						</>
					)}
				</div>
			</div>
			<Modal
				title={t("settings.plugins.install.title")}
				open={installOpen}
				okText={t("settings.plugins.actions.install")}
				confirmLoading={installing}
				onCancel={(): void => {
					setInstallOpen(false);
					form.resetFields();
				}}
				onOk={(): void => {
					void form.validateFields().then(handleInstall);
				}}
			>
				<Form form={form} layout="vertical">
					<Form.Item label={t("settings.plugins.install.sourceType")}>
						<Select
							value={sourceType}
							onChange={(value: InstallSourceType): void => {
								setSourceType(value);
								form.resetFields();
							}}
							options={[
								{
									value: "local",
									label: t("settings.plugins.install.local"),
								},
								{
									value: "tarball",
									label: t(
										"settings.plugins.install.tarball",
									),
								},
								{
									value: "npm",
									label: t("settings.plugins.install.npm"),
								},
								{
									value: "git",
									label: t("settings.plugins.install.git"),
								},
							]}
						/>
					</Form.Item>
					{sourceType === "local" || sourceType === "tarball" ? (
						<Form.Item
							name="path"
							label={t("settings.plugins.install.path")}
							rules={[{ required: true }]}
						>
							<Space.Compact className={styles.fullWidth}>
								<Input
									placeholder={t(
										"settings.plugins.install.pathPlaceholder",
									)}
								/>
								<Button
									onClick={(): void => {
										void browsePath();
									}}
								>
									{t("settings.plugins.actions.choose")}
								</Button>
							</Space.Compact>
						</Form.Item>
					) : null}
					{sourceType === "tarball" ? (
						<Form.Item
							name="sha256"
							label={t("settings.plugins.install.sha256")}
							rules={[{ required: true, len: 64 }]}
						>
							<Input placeholder="sha256" />
						</Form.Item>
					) : null}
					{sourceType === "npm" ? (
						<>
							<Form.Item
								name="packageName"
								label={t(
									"settings.plugins.install.packageName",
								)}
								rules={[{ required: true }]}
							>
								<Input placeholder="example-plugin" />
							</Form.Item>
							<Form.Item
								name="version"
								label={t("settings.plugins.install.version")}
								rules={[{ required: true }]}
							>
								<Input placeholder="1.0.0" />
							</Form.Item>
						</>
					) : null}
					{sourceType === "git" ? (
						<>
							<Form.Item
								name="url"
								label={t("settings.plugins.install.url")}
								rules={[{ required: true }]}
							>
								<Input placeholder="https://github.com/example/plugin.git" />
							</Form.Item>
							<Form.Item
								name="commit"
								label={t("settings.plugins.install.commit")}
								rules={[{ required: true, min: 7 }]}
							>
								<Input placeholder="40-character commit SHA" />
							</Form.Item>
						</>
					) : null}
					<Alert
						type="info"
						showIcon
						message={t("settings.plugins.install.noExecution")}
					/>
				</Form>
			</Modal>
		</section>
	);
}

export default PluginsSettingsPage;
