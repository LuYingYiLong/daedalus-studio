import { useEffect, useState } from "react";
import {
	Alert,
	App,
	Button,
	Checkbox,
	Empty,
	Flex,
	Form,
	Modal,
	Progress,
	Select,
	Space,
	Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type {
	BrowserClearDataOptions,
	BrowserCredentialSummary,
	BrowserDownloadRecord,
	BrowserHistoryEntry,
	BrowserImportProfile,
	BrowserPermissionRequest,
} from "../../../../contracts/browser";
import styles from "./BrowserPanel.module.css";

type OpenProps = { open: boolean; onClose: () => void };

export function BrowserHistoryModal({
	open,
	onClose,
	onNavigate,
}: OpenProps & { onNavigate: (url: string) => void }): React.JSX.Element {
	const { t } = useTranslation();
	const [entries, setEntries] = useState<BrowserHistoryEntry[]>([]);
	useEffect((): void => {
		if (open)
			void window.electronAPI.browser.history.list().then(setEntries);
	}, [open]);
	return (
		<Modal
			title={t("browser.history.title")}
			open={open}
			onCancel={onClose}
			onOk={onClose}
			mask={{ closable: false }}
			footer={(_, { OkBtn }) => (
				<Flex justify="space-between">
					<Button
						danger
						type="text"
						disabled={entries.length === 0}
						onClick={(): void => {
							void window.electronAPI.browser.history
								.clear()
								.then((): void => setEntries([]));
						}}
						icon={<Icon name="remove" />}
					>
						{t("browser.history.clear")}
					</Button>
					<OkBtn />
				</Flex>
			)}
			className={styles.modal}
		>
			<div className={styles.managerList}>
				{entries.length === 0 ? (
					<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
				) : (
					entries.map((entry: BrowserHistoryEntry) => (
						<div className={styles.managerRow} key={entry.id}>
							<div className={styles.managerMeta}>
								<Typography.Text
									className={styles.managerTitle}
								>
									{entry.title || entry.url}
								</Typography.Text>
								<Typography.Text
									type="secondary"
									className={styles.managerSubtitle}
								>
									{entry.url}
								</Typography.Text>
							</div>
							<Button
								type="text"
								shape="circle"
								icon={<Icon name="external-link" />}
								onClick={(): void => {
									onNavigate(entry.url);
									onClose();
								}}
							/>
						</div>
					))
				)}
			</div>
		</Modal>
	);
}

export function BrowserDownloadsModal({
	open,
	onClose,
}: OpenProps): React.JSX.Element {
	const { t } = useTranslation();
	const [records, setRecords] = useState<BrowserDownloadRecord[]>([]);
	useEffect((): (() => void) => {
		if (!open) return (): void => {};
		void window.electronAPI.browser.downloads.list().then(setRecords);
		return window.electronAPI.browser.downloads.onChanged(
			(record: BrowserDownloadRecord): void => {
				setRecords(
					(
						current: BrowserDownloadRecord[],
					): BrowserDownloadRecord[] => [
						record,
						...current.filter(
							(item: BrowserDownloadRecord): boolean =>
								item.id !== record.id,
						),
					],
				);
			},
		);
	}, [open]);
	return (
		<Modal
			title={t("browser.downloads.title")}
			open={open}
			onCancel={onClose}
			mask={{ closable: false }}
			footer={(_, { OkBtn }) => (
				<Flex justify="space-between">
					<Button
						danger
						type="text"
						disabled={records.length === 0}
						onClick={(): void => {
							void window.electronAPI.browser.downloads
								.clear()
								.then((): void => setRecords([]));
						}}
						icon={<Icon name="remove" />}
					>
						{t("browser.downloads.clear")}
					</Button>
					<OkBtn />
				</Flex>
			)}
			className={styles.modal}
		>
			<div className={styles.managerList}>
				{records.length === 0 ? (
					<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
				) : (
					records.map((record: BrowserDownloadRecord) => {
						const percent: number =
							record.totalBytes > 0
								? Math.min(
										100,
										Math.round(
											(record.receivedBytes /
												record.totalBytes) *
												100,
										),
									)
								: 0;
						return (
							<div className={styles.managerRow} key={record.id}>
								<div className={styles.managerMeta}>
									<Typography.Text
										className={styles.managerTitle}
									>
										{record.fileName}
									</Typography.Text>
									{record.state === "progressing" ? (
										<Progress
											percent={percent}
											size="small"
										/>
									) : (
										<Typography.Text type="secondary">
											{t(
												`browser.downloads.state.${record.state}`,
											)}
										</Typography.Text>
									)}
								</div>
								<Space.Compact>
									{record.state === "progressing" ? (
										<Button
											type="text"
											icon={<Icon name="stop" />}
											onClick={(): void => {
												void window.electronAPI.browser.downloads.cancel(
													record.id,
												);
											}}
										/>
									) : record.state === "completed" ? (
										<>
											<Button
												type="text"
												icon={
													<Icon name="external-link" />
												}
												onClick={(): void => {
													void window.electronAPI.browser.downloads.open(
														record.id,
													);
												}}
											/>
											<Button
												type="text"
												icon={
													<Icon name="folder-open" />
												}
												onClick={(): void => {
													void window.electronAPI.browser.downloads.reveal(
														record.id,
													);
												}}
											/>
										</>
									) : null}
									<Button
										type="text"
										icon={<Icon name="remove" />}
										onClick={(): void => {
											void window.electronAPI.browser.downloads
												.remove(record.id)
												.then((): void =>
													setRecords(
														(
															items: BrowserDownloadRecord[],
														): BrowserDownloadRecord[] =>
															items.filter(
																(
																	item: BrowserDownloadRecord,
																): boolean =>
																	item.id !==
																	record.id,
															),
													),
												);
										}}
									/>
								</Space.Compact>
							</div>
						);
					})
				)}
			</div>
		</Modal>
	);
}

export function BrowserImportModal({
	open,
	onClose,
}: OpenProps): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const [profiles, setProfiles] = useState<BrowserImportProfile[]>([]);
	const [profileKey, setProfileKey] = useState<string>();
	const [includeCookies, setIncludeCookies] = useState<boolean>(true);
	const [includePasswords, setIncludePasswords] = useState<boolean>(true);
	const [allowPasswords, setAllowPasswords] = useState<boolean>(true);
	const [loading, setLoading] = useState<boolean>(false);
	useEffect((): void => {
		if (!open) return;
		void window.electronAPI.browser.import
			.listProfiles()
			.then((items: BrowserImportProfile[]): void => {
				setProfiles(items);
				setProfileKey(
					items[0] === undefined
						? undefined
						: `${items[0].source}:${items[0].profileId}`,
				);
			});
		void window.electronAPI.browser.settings
			.get()
			.then((settings): void => {
				setAllowPasswords(settings.savePasswordsEnabled);
				setIncludePasswords(settings.savePasswordsEnabled);
			});
	}, [open]);
	async function runImport(): Promise<void> {
		const profile: BrowserImportProfile | undefined = profiles.find(
			(item: BrowserImportProfile): boolean =>
				`${item.source}:${item.profileId}` === profileKey,
		);
		if (profile === undefined) return;
		setLoading(true);
		try {
			const result = await window.electronAPI.browser.import.run({
				source: profile.source,
				profileId: profile.profileId,
				includeCookies,
				includePasswords,
			});
			void message.success(
				t("browser.import.completed", {
					cookies: result.cookiesImported,
					passwords: result.passwordsImported,
					skipped: result.skipped + result.unsupported,
					unsupported: result.unsupported,
				}),
			);
			onClose();
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("browser.import.failed"),
			);
		} finally {
			setLoading(false);
		}
	}
	return (
		<Modal
			title={t("browser.import.title")}
			open={open}
			onCancel={onClose}
			onOk={(): void => {
				void runImport();
			}}
			confirmLoading={loading}
			okButtonProps={{
				disabled:
					profileKey === undefined ||
					(!includeCookies && !includePasswords),
			}}
			mask={{ closable: false }}
			className={styles.modal}
		>
			<Form layout="vertical">
				<Form.Item label={t("browser.import.profile")}>
					<Select
						value={profileKey}
						options={profiles.map((item: BrowserImportProfile) => ({
							value: `${item.source}:${item.profileId}`,
							label: `${item.source === "chrome" ? "Chrome" : "Edge"} · ${item.name}`,
						}))}
						onChange={setProfileKey}
						placeholder={t("browser.import.noProfiles")}
					/>
				</Form.Item>
				<Space orientation="vertical">
					<Checkbox
						checked={includeCookies}
						onChange={(event): void =>
							setIncludeCookies(event.target.checked)
						}
					>
						{t("browser.import.cookies")}
					</Checkbox>
					<Checkbox
						checked={includePasswords}
						disabled={!allowPasswords}
						onChange={(event): void =>
							setIncludePasswords(event.target.checked)
						}
					>
						{t("browser.import.passwords")}
					</Checkbox>
				</Space>
			</Form>
		</Modal>
	);
}

export function BrowserClearDataModal({
	open,
	onClose,
}: OpenProps): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [options, setOptions] = useState<BrowserClearDataOptions>({
		timeRange: "allTime",
		history: true,
		downloads: true,
		cookiesAndStorage: true,
		cache: true,
		passwords: false,
	});
	const [loading, setLoading] = useState<boolean>(false);
	async function performClear(): Promise<void> {
		setLoading(true);
		try {
			await window.electronAPI.browser.data.clear(options);
			void message.success(t("browser.clear.completed"));
			onClose();
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("browser.clear.failed"),
			);
		} finally {
			setLoading(false);
		}
	}
	function clear(): void {
		if (!options.passwords) {
			void performClear();
			return;
		}
		modal.confirm({
			title: t("browser.clear.passwordWarningTitle"),
			content: t("browser.clear.passwordWarningDescription"),
			okText: t("browser.clear.deletePasswords"),
			okButtonProps: { danger: true },
			onOk: performClear,
		});
	}
	const hasSelection: boolean =
		options.history ||
		options.downloads ||
		options.cookiesAndStorage ||
		options.cache ||
		options.passwords;
	return (
		<Modal
			title={t("browser.clear.title")}
			open={open}
			onCancel={onClose}
			okText={t("browser.clear.action")}
			okButtonProps={{
				danger: options.passwords,
				disabled: !hasSelection,
			}}
			confirmLoading={loading}
			onOk={clear}
			mask={{ closable: false }}
			className={styles.modal}
		>
			<Space orientation="vertical" style={{ width: "100%" }}>
				<Select
					value={options.timeRange}
					aria-label={t("browser.clear.timeRange")}
					options={(
						[
							"lastHour",
							"last24Hours",
							"last7Days",
							"last4Weeks",
							"allTime",
						] as const
					).map((value) => ({
						value,
						label: t(`browser.clear.timeRanges.${value}`),
					}))}
					onChange={(
						timeRange: BrowserClearDataOptions["timeRange"],
					): void =>
						setOptions(
							(
								current: BrowserClearDataOptions,
							): BrowserClearDataOptions => ({
								...current,
								timeRange,
							}),
						)
					}
				/>
				{(
					[
						"history",
						"downloads",
						"cookiesAndStorage",
						"cache",
						"passwords",
					] as const
				).map((key) => (
					<Checkbox
						key={key}
						checked={options[key]}
						onChange={(event): void =>
							setOptions(
								(
									current: BrowserClearDataOptions,
								): BrowserClearDataOptions => ({
									...current,
									[key]: event.target.checked,
								}),
							)
						}
					>
						{t(`browser.clear.${key}`)}
					</Checkbox>
				))}
				{options.timeRange !== "allTime" &&
				(options.cookiesAndStorage || options.cache) ? (
					<Alert
						type="info"
						showIcon
						message={t("browser.clear.siteDataAllTime")}
					/>
				) : null}
			</Space>
		</Modal>
	);
}

export function BrowserCredentialModal({
	open,
	onClose,
	browserId,
	url,
}: OpenProps & { browserId: string; url: string | null }): React.JSX.Element {
	const { t } = useTranslation();
	const [items, setItems] = useState<BrowserCredentialSummary[]>([]);
	useEffect((): void => {
		if (open && url !== null)
			void window.electronAPI.browser.passwords
				.forUrl(url)
				.then(setItems);
	}, [open, url]);
	return (
		<Modal
			title={t("browser.passwords.choose")}
			open={open}
			footer={null}
			onCancel={onClose}
			mask={{ closable: false }}
			className={styles.modal}
		>
			<div className={styles.managerList}>
				{items.length === 0 ? (
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={t("browser.passwords.noMatch")}
					/>
				) : (
					items.map((item: BrowserCredentialSummary) => (
						<div className={styles.managerRow} key={item.id}>
							<div>
								<Typography.Text>
									{item.username}
								</Typography.Text>
								<Typography.Text
									type="secondary"
									className={styles.managerSubtitle}
								>
									{item.origin}
								</Typography.Text>
							</div>
							<Button
								type="primary"
								onClick={(): void => {
									void window.electronAPI.browser.passwords
										.fill(browserId, item.id)
										.then(onClose);
								}}
							>
								{t("browser.passwords.fill")}
							</Button>
						</div>
					))
				)}
			</div>
		</Modal>
	);
}

export function BrowserPermissionModal({
	request,
	onClose,
}: {
	request: BrowserPermissionRequest | null;
	onClose: () => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	function respond(decision: "allow_once" | "allow_always" | "block"): void {
		if (request !== null)
			void window.electronAPI.browser.permissions
				.respond(request, decision)
				.finally(onClose);
	}
	return (
		<Modal
			title={t("browser.permissions.requestTitle")}
			open={request !== null}
			onCancel={(): void => respond("block")}
			footer={
				<Space>
					<Button danger onClick={(): void => respond("block")}>
						{t("browser.permissions.block")}
					</Button>
					<Button onClick={(): void => respond("allow_once")}>
						{t("browser.permissions.allowOnce")}
					</Button>
					<Button
						type="primary"
						onClick={(): void => respond("allow_always")}
					>
						{t("browser.permissions.allowAlways")}
					</Button>
				</Space>
			}
			mask={{ closable: false }}
			className={styles.modal}
		>
			<Typography.Paragraph>
				{t("browser.permissions.requestDescription", {
					origin: request?.origin,
					permission: request?.permission,
				})}
			</Typography.Paragraph>
		</Modal>
	);
}
