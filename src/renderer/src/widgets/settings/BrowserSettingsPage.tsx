import { useEffect, useMemo, useState } from "react";
import {
	App,
	Button,
	Empty,
	Form,
	Input,
	Modal,
	Segmented,
	Space,
	Switch,
	Tooltip,
	Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import type {
	BrowserCredentialSummary,
	BrowserPermissionRule,
	BrowserSettings,
} from "../../../../contracts/browser";
import {
	fetchClientPreferences,
	getCachedClientPreferences,
	updateClientPreferences,
	type ClientPreferences,
} from "@/platform/rpc/client-preferences-api";
import {
	BrowserClearDataModal,
	BrowserDownloadsModal,
	BrowserHistoryModal,
	BrowserImportModal,
} from "@/widgets/browser/BrowserManagerModals";
import styles from "./BrowserSettingsPage.module.css";

type ManagerKind =
	| "history"
	| "downloads"
	| "import"
	| "clear"
	| "passwords"
	| "permissions"
	| null;
type CredentialForm = { origin: string; username: string; password: string };

const EMPTY_SETTINGS: BrowserSettings = {
	downloadDirectory: null,
	askWhereToSave: false,
	savePasswordsEnabled: true,
	aiCdpEnabled: false,
	permissionRules: [],
};

function BrowserSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [settings, setSettings] = useState<BrowserSettings>(EMPTY_SETTINGS);
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(
		getCachedClientPreferences(),
	);
	const [defaultDownloadDirectory, setDefaultDownloadDirectory] =
		useState<string>("");
	const [manager, setManager] = useState<ManagerKind>(null);
	const [credentials, setCredentials] = useState<BrowserCredentialSummary[]>(
		[],
	);
	const [search, setSearch] = useState<string>("");
	const [revealed, setRevealed] = useState<Record<string, string>>({});
	const [form] = Form.useForm<CredentialForm>();
	const [credentialEditorOpen, setCredentialEditorOpen] =
		useState<boolean>(false);
	const [editingCredentialId, setEditingCredentialId] = useState<
		string | null
	>(null);

	useEffect((): void => {
		void Promise.all([
			window.electronAPI.browser.settings.get(),
			window.electronAPI.browser.settings.getDefaultDownloadDirectory(),
		])
			.then(([nextSettings, nextDefaultDownloadDirectory]): void => {
				setSettings(nextSettings);
				setDefaultDownloadDirectory(nextDefaultDownloadDirectory);
			})
			.catch((error: unknown): void => {
				void message.error(
					error instanceof Error
						? error.message
						: t("settings.browser.errors.load"),
				);
			});
	}, [message, t]);

	useEffect((): void => {
		void fetchClientPreferences()
			.then(setClientPreferences)
			.catch((error: unknown): void => {
				void message.error(
					error instanceof Error
						? error.message
						: t("settings.browser.errors.load"),
				);
			});
	}, [message, t]);

	useEffect((): void => {
		if (manager === "passwords")
			void window.electronAPI.browser.passwords
				.list()
				.then(setCredentials);
	}, [manager]);

	useEffect((): (() => void) => {
		if (Object.keys(revealed).length === 0) return (): void => {};
		const timer = window.setTimeout((): void => setRevealed({}), 10_000);
		return (): void => window.clearTimeout(timer);
	}, [revealed]);

	async function updateSettings(
		patch: Partial<Omit<BrowserSettings, "permissionRules">>,
	): Promise<void> {
		try {
			setSettings(
				await window.electronAPI.browser.settings.update(patch),
			);
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.browser.errors.save"),
			);
		}
	}

	async function updateWebLinkOpenMode(
		webLinkOpenMode: ClientPreferences["webLinkOpenMode"],
	): Promise<void> {
		try {
			setClientPreferences(await updateClientPreferences({ webLinkOpenMode }));
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.browser.errors.save"),
			);
		}
	}

	const filteredCredentials = useMemo((): BrowserCredentialSummary[] => {
		const query = search.trim().toLocaleLowerCase();
		return query === ""
			? credentials
			: credentials.filter((item) =>
					`${item.origin} ${item.username}`
						.toLocaleLowerCase()
						.includes(query),
				);
	}, [credentials, search]);

	async function saveCredential(): Promise<void> {
		const value = await form.validateFields();
		const saved = await window.electronAPI.browser.passwords.save(value);
		if (editingCredentialId !== null && saved.id !== editingCredentialId) {
			await window.electronAPI.browser.passwords.remove(
				editingCredentialId,
			);
		}
		setCredentials(await window.electronAPI.browser.passwords.list());
		setCredentialEditorOpen(false);
		setEditingCredentialId(null);
		form.resetFields();
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>
					{t("settings.browser.title")}
				</Typography.Title>
			</header>
			<div className={styles.content}>
				<SettingsList title={t("settings.browser.downloads.title")}>
					<SettingsItem
						searchKey="item:browser.downloadDirectory"
						title={t("settings.browser.downloads.directory")}
						description={
							settings.downloadDirectory ??
							(defaultDownloadDirectory ||
								t("settings.browser.downloads.systemDefault"))
						}
					>
						<Space.Compact>
							<Button
								icon={<Icon name="folder-open" />}
								onClick={(): void => {
									void window.electronAPI.browser.settings
										.pickDownloadDirectory()
										.then(
											(
												directory: string | null,
											): void => {
												if (directory !== null)
													void updateSettings({
														downloadDirectory:
															directory,
													});
											},
										);
								}}
							>
								{t("settings.browser.actions.choose")}
							</Button>
							<Tooltip
								title={t(
									"settings.browser.downloads.resetDirectory",
								)}
							>
								<Button
									aria-label={t(
										"settings.browser.downloads.resetDirectory",
									)}
									icon={<Icon name="reload" />}
									disabled={
										settings.downloadDirectory === null
									}
									onClick={(): void => {
										void updateSettings({
											downloadDirectory: null,
										});
									}}
								/>
							</Tooltip>
						</Space.Compact>
					</SettingsItem>
					<SettingsItem
						searchKey="item:browser.askEveryTime"
						title={t("settings.browser.downloads.askEveryTime")}
						description={t(
							"settings.browser.downloads.askEveryTimeDescription",
						)}
					>
						<Switch
							checked={settings.askWhereToSave}
							onChange={(checked: boolean): void => {
								void updateSettings({
									askWhereToSave: checked,
								});
							}}
						/>
					</SettingsItem>
					<SettingsItem
						searchKey="item:browser.manageDownloads"
						title={t("settings.browser.downloads.manage")}
						description={t(
							"settings.browser.downloads.manageDescription",
						)}
					>
						<Button onClick={(): void => setManager("downloads")}>
							{t("settings.browser.actions.openDownloads")}
						</Button>
					</SettingsItem>
				</SettingsList>

				<SettingsList title={t("settings.browser.links.title")}>
					<SettingsItem
						searchKey="item:browser.openMode"
						title={t("settings.browser.links.openMode")}
						description={t(
							"settings.browser.links.openModeDescription",
						)}
					>
						<Segmented<ClientPreferences["webLinkOpenMode"]>
							value={clientPreferences.webLinkOpenMode}
							options={[
								{
									label: t("settings.browser.links.external"),
									value: "external",
								},
								{
									label: t("settings.browser.links.integrated"),
									value: "integrated",
								},
							]}
							onChange={(value): void => {
								void updateWebLinkOpenMode(value);
							}}
						/>
					</SettingsItem>
				</SettingsList>

				<SettingsList title={t("settings.browser.privacy.title")}>
					<SettingsItem
						searchKey="item:browser.history"
						title={t("settings.browser.privacy.history")}
						description={t(
							"settings.browser.privacy.historyDescription",
						)}
					>
						<Button onClick={(): void => setManager("history")}>
							{t("settings.browser.actions.openHistory")}
						</Button>
					</SettingsItem>
					<SettingsItem
						searchKey="item:browser.permissions"
						title={t("settings.browser.privacy.permissions")}
						description={t(
							"settings.browser.privacy.permissionsDescription",
						)}
					>
						<Button onClick={(): void => setManager("permissions")}>
							{t("settings.browser.actions.managePermissions")}
						</Button>
					</SettingsItem>
					<SettingsItem
						searchKey="item:browser.clearData"
						title={t("settings.browser.privacy.clearData")}
						description={t(
							"settings.browser.privacy.clearDataDescription",
						)}
					>
						<Button
							danger
							onClick={(): void => setManager("clear")}
						>
							{t("settings.browser.actions.clearData")}
						</Button>
					</SettingsItem>
				</SettingsList>

				<SettingsList title={t("settings.browser.passwords.title")}>
					<SettingsItem
						searchKey="item:browser.savePasswords"
						title={t("settings.browser.passwords.save")}
						description={t(
							"settings.browser.passwords.saveDescription",
						)}
					>
						<Switch
							checked={settings.savePasswordsEnabled}
							onChange={(checked: boolean): void => {
								void updateSettings({
									savePasswordsEnabled: checked,
								});
							}}
						/>
					</SettingsItem>
					<SettingsItem
						searchKey="item:browser.managePasswords"
						title={t("settings.browser.passwords.manage")}
						description={t(
							"settings.browser.passwords.manageDescription",
						)}
					>
						<div className={styles.managerActions}>
							<Button onClick={(): void => setManager("import")}>
								{t("settings.browser.actions.import")}
							</Button>
							<Button
								onClick={(): void => setManager("passwords")}
							>
								{t("settings.browser.actions.managePasswords")}
							</Button>
						</div>
					</SettingsItem>
				</SettingsList>

				<SettingsList title={t("settings.browser.aiControl.title")}>
					<SettingsItem
						searchKey="item:browser.aiCdp"
						title={t("settings.browser.aiControl.enable")}
						description={t(
							"settings.browser.aiControl.description",
						)}
					>
						<Switch
							checked={settings.aiCdpEnabled}
							onChange={(checked: boolean): void => {
								void (async (): Promise<void> => {
									if (checked) {
										const confirmed =
											await new Promise<boolean>(
												(resolve): void => {
													modal.confirm({
														title: t(
															"settings.browser.aiControl.confirmTitle",
														),
														content: t(
															"settings.browser.aiControl.confirmDescription",
														),
														okText: t(
															"settings.browser.aiControl.confirm",
														),
														cancelText:
															t("settings.common.cancel"),
														onOk: (): void =>
															resolve(true),
														onCancel: (): void =>
															resolve(false),
													});
												},
											);
										if (!confirmed) return;
									}
									await updateSettings({
										aiCdpEnabled: checked,
									});
								})();
							}}
						/>
					</SettingsItem>
				</SettingsList>
			</div>

			<BrowserHistoryModal
				open={manager === "history"}
				onClose={(): void => setManager(null)}
				onNavigate={(url: string): void => {
					void window.electronAPI.windowControl.openExternal(url);
				}}
			/>
			<BrowserDownloadsModal
				open={manager === "downloads"}
				onClose={(): void => setManager(null)}
			/>
			<BrowserImportModal
				open={manager === "import"}
				onClose={(): void => setManager(null)}
			/>
			<BrowserClearDataModal
				open={manager === "clear"}
				onClose={(): void => setManager(null)}
			/>

			<Modal
				title={t("settings.browser.passwords.managerTitle")}
				open={manager === "passwords"}
				footer={null}
				onCancel={(): void => setManager(null)}
				mask={{ closable: false }}
			>
				<Space orientation="vertical" style={{ width: "100%" }}>
					<Space.Compact style={{ width: "100%" }}>
						<Input
							allowClear
							value={search}
							placeholder={t("settings.browser.passwords.search")}
							prefix={<Icon name="search" />}
							onChange={(event): void =>
								setSearch(event.target.value)
							}
						/>
						<Button
							type="primary"
							icon={<Icon name="add" />}
							disabled={!settings.savePasswordsEnabled}
							onClick={(): void => setCredentialEditorOpen(true)}
						>
							{t("settings.common.add")}
						</Button>
					</Space.Compact>
					<div className={styles.passwordList}>
						{filteredCredentials.length === 0 ? (
							<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
						) : (
							filteredCredentials.map((item) => (
								<div
									className={styles.managerRow}
									key={item.id}
								>
									<div className={styles.managerMeta}>
										<Typography.Text>
											{item.username}
										</Typography.Text>
										<Typography.Text type="secondary">
											{item.origin}
										</Typography.Text>
										<Typography.Text code>
											{revealed[item.id] ??
												"••••••••••••"}
										</Typography.Text>
									</div>
									<Space.Compact>
										<Button
											type="text"
											onClick={(): void => {
												if (
													revealed[item.id] !==
													undefined
												)
													setRevealed((current) => {
														const next = {
															...current,
														};
														delete next[item.id];
														return next;
													});
												else
													void window.electronAPI.browser.passwords
														.reveal(item.id)
														.then(
															({
																password,
															}): void =>
																setRevealed(
																	(
																		current,
																	) => ({
																		...current,
																		[item.id]:
																			password,
																	}),
																),
														);
											}}
										>
											{t(
												revealed[item.id] === undefined
													? "settings.browser.passwords.reveal"
													: "settings.browser.passwords.hide",
											)}
										</Button>
										<Button
											type="text"
											icon={<Icon name="copy" />}
											onClick={(): void => {
												void window.electronAPI.browser.passwords
													.reveal(item.id)
													.then(
														async ({
															password,
														}): Promise<void> => {
															await window.electronAPI.clipboard.writeText(
																password,
															);
															void message.success(
																t(
																	"settings.browser.passwords.copied",
																),
															);
														},
													);
											}}
										/>
										<Button
											type="text"
											icon={<Icon name="pencil" />}
											disabled={
												!settings.savePasswordsEnabled
											}
											onClick={(): void => {
												void window.electronAPI.browser.passwords
													.reveal(item.id)
													.then(
														({
															password,
														}): void => {
															setEditingCredentialId(
																item.id,
															);
															form.setFieldsValue(
																{
																	origin: item.origin,
																	username:
																		item.username,
																	password,
																},
															);
															setCredentialEditorOpen(
																true,
															);
														},
													);
											}}
										/>
										<Button
											danger
											type="text"
											icon={<Icon name="remove" />}
											onClick={(): void => {
												void window.electronAPI.browser.passwords
													.remove(item.id)
													.then((): void =>
														setCredentials(
															(current) =>
																current.filter(
																	(
																		candidate,
																	) =>
																		candidate.id !==
																		item.id,
																),
														),
													);
											}}
										/>
									</Space.Compact>
								</div>
							))
						)}
					</div>
				</Space>
			</Modal>

			<Modal
				title={t(
					editingCredentialId === null
						? "settings.browser.passwords.addTitle"
						: "settings.browser.passwords.editTitle",
				)}
				open={credentialEditorOpen}
				onCancel={(): void => {
					setCredentialEditorOpen(false);
					setEditingCredentialId(null);
					form.resetFields();
				}}
				onOk={(): void => {
					void saveCredential();
				}}
				mask={{ closable: false }}
			>
				<Form form={form} layout="vertical">
					<Form.Item
						name="origin"
						label={t("settings.browser.passwords.origin")}
						rules={[{ required: true }, { type: "url" }]}
					>
						<Input placeholder="https://example.com" />
					</Form.Item>
					<Form.Item
						name="username"
						label={t("settings.browser.passwords.username")}
						rules={[{ required: true }]}
					>
						<Input />
					</Form.Item>
					<Form.Item
						name="password"
						label={t("settings.browser.passwords.password")}
						rules={[{ required: true }]}
					>
						<Input.Password />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t("settings.browser.privacy.permissions")}
				open={manager === "permissions"}
				footer={null}
				onCancel={(): void => setManager(null)}
				mask={{ closable: false }}
			>
				<div className={styles.permissionList}>
					{settings.permissionRules.length === 0 ? (
						<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
					) : (
						settings.permissionRules.map(
							(rule: BrowserPermissionRule) => (
								<div
									className={styles.managerRow}
									key={`${rule.origin}:${rule.permission}`}
								>
									<div className={styles.managerMeta}>
										<Typography.Text>
											{rule.origin}
										</Typography.Text>
										<Typography.Text type="secondary">
											{rule.permission} · {rule.decision}
										</Typography.Text>
									</div>
									<Button
										danger
										type="text"
										icon={<Icon name="remove" />}
										onClick={(): void => {
											void window.electronAPI.browser.permissions
												.remove(
													rule.origin,
													rule.permission,
												)
												.then((permissionRules): void =>
													setSettings((current) => ({
														...current,
														permissionRules,
													})),
												);
										}}
									/>
								</div>
							),
						)
					)}
				</div>
			</Modal>
		</section>
	);
}

export default BrowserSettingsPage;
