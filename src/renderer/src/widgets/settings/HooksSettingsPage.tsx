import {
	Alert,
	App,
	Button,
	Empty,
	List,
	Modal,
	Select,
	Space,
	Spin,
	Table,
	Tag,
	Tooltip,
	Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { fetchWorkspaces } from "@/platform/rpc/workspace-api";
import type { WorkspaceListResult } from "@/platform/rpc/types";
import {
	getHookConfig,
	listHookConfigSources,
	listHookRuns,
	updateHookConfig,
	updateHookTrust,
	type HookConfigDocument,
	type HookConfigTarget,
	type HookHandlerSummary,
	type HookRunRecord,
} from "@/platform/rpc/hooks-api";
import HooksJsonEditor, { type HooksJsonEditorHandle } from "./HooksJsonEditor";
import styles from "./HooksSettingsPage.module.css";
import pageMotionStyles from "./SettingsPageMotion.module.css";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import { createStudioCopyableConfig } from "@/ui/typography-copyable";

const HOOK_TEMPLATE: string = `${JSON.stringify(
	{
		description: "Daedalus lifecycle hooks",
		hooks: {
			UserPromptSubmit: [
				{
					matcher: "*",
					hooks: [
						{
							type: "command",
							command: "node .daedalus/hooks/validate-prompt.mjs",
							commandWindows:
								"node .daedalus\\hooks\\validate-prompt.mjs",
							timeout: 10,
							failurePolicy: "continue",
						},
					],
				},
			],
		},
	},
	null,
	"\t",
)}\n`;

function toTarget(document: HookConfigDocument): HookConfigTarget {
	return {
		scope: document.source.scope,
		workspaceId: document.source.workspaceId,
		sourceFolderId: document.source.sourceFolderId,
	};
}

function trustColor(value: HookHandlerSummary["trust"]): string {
	if (value === "trusted") return "success";
	if (value === "disabled") return "default";
	return "warning";
}

function runColor(value: HookRunRecord["status"]): string {
	if (value === "completed") return "success";
	if (value === "queued") return "processing";
	if (value === "blocked") return "warning";
	return "error";
}

function HooksSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const editorRef = useRef<HooksJsonEditorHandle | null>(null);
	const [sources, setSources] = useState<HookConfigDocument[]>([]);
	const [document, setDocument] = useState<HookConfigDocument | null>(null);
	const [content, setContent] = useState<string>("");
	const [runs, setRuns] = useState<HookRunRecord[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [saving, setSaving] = useState<boolean>(false);
	const [trustingFingerprint, setTrustingFingerprint] = useState<
		string | null
	>(null);
	const [reviewOpen, setReviewOpen] = useState<boolean>(false);
	const dirty: boolean = document !== null && content !== document.content;

	const replaceDocument = useCallback(
		(nextDocument: HookConfigDocument): void => {
			setDocument(nextDocument);
			setContent(nextDocument.content);
			setSources((current: HookConfigDocument[]): HookConfigDocument[] =>
				current.map(
					(item: HookConfigDocument): HookConfigDocument =>
						item.source.id === nextDocument.source.id
							? nextDocument
							: item,
				),
			);
		},
		[],
	);

	const refreshRuns = useCallback(async (): Promise<void> => {
		try {
			setRuns(await listHookRuns());
		} catch (error: unknown) {
			console.error("[HooksSettingsPage] load runs failed", error);
		}
	}, []);

	const loadSources = useCallback(async (): Promise<void> => {
		setLoading(true);
		try {
			const workspaceResult: WorkspaceListResult =
				await fetchWorkspaces();
			const nextSources: HookConfigDocument[] =
				await listHookConfigSources(
					workspaceResult.active ?? undefined,
				);
			setSources(nextSources);
			if (nextSources.length > 0) replaceDocument(nextSources[0]);
			await refreshRuns();
		} catch (error: unknown) {
			message.error(
				error instanceof Error
					? error.message
					: t("settings.hooks.errors.load"),
			);
		} finally {
			setLoading(false);
		}
	}, [message, refreshRuns, replaceDocument, t]);

	useEffect((): void => {
		void loadSources();
	}, [loadSources]);

	useEffect((): (() => void) => {
		const listener = (event: BeforeUnloadEvent): void => {
			if (!dirty) return;
			event.preventDefault();
		};
		window.addEventListener("beforeunload", listener);
		return (): void => window.removeEventListener("beforeunload", listener);
	}, [dirty]);

	async function selectSource(
		sourceDocument: HookConfigDocument,
	): Promise<void> {
		if (sourceDocument.source.id === document?.source.id) return;
		if (dirty) {
			const confirmed: boolean = await new Promise<boolean>(
				(resolve): void => {
					modal.confirm({
						title: t("settings.hooks.dirty.title"),
						content: t("settings.hooks.dirty.description"),
						okText: t("settings.hooks.dirty.discard"),
						cancelText: t("settings.common.cancel"),
						onOk: (): void => resolve(true),
						onCancel: (): void => resolve(false),
					});
				},
			);
			if (!confirmed) return;
		}
		setLoading(true);
		try {
			replaceDocument(await getHookConfig(toTarget(sourceDocument)));
		} catch (error: unknown) {
			message.error(
				error instanceof Error
					? error.message
					: t("settings.hooks.errors.load"),
			);
		} finally {
			setLoading(false);
		}
	}

	async function reload(): Promise<void> {
		if (document === null) return;
		setLoading(true);
		try {
			replaceDocument(await getHookConfig(toTarget(document)));
			message.success(t("settings.hooks.messages.reloaded"));
		} catch (error: unknown) {
			message.error(
				error instanceof Error
					? error.message
					: t("settings.hooks.errors.load"),
			);
		} finally {
			setLoading(false);
		}
	}

	async function save(): Promise<void> {
		if (document === null) return;
		try {
			JSON.parse(content);
		} catch (error: unknown) {
			message.error(
				error instanceof Error
					? error.message
					: t("settings.hooks.errors.invalidJson"),
			);
			return;
		}
		setSaving(true);
		try {
			const updated: HookConfigDocument = await updateHookConfig(
				toTarget(document),
				content,
				document.revision,
			);
			replaceDocument(updated);
			message.success(t("settings.hooks.messages.saved"));
			if (updated.handlers.length > 0) setReviewOpen(true);
		} catch (error: unknown) {
			message.error(
				error instanceof Error
					? error.message
					: t("settings.hooks.errors.save"),
			);
		} finally {
			setSaving(false);
		}
	}

	async function setTrust(
		handler: HookHandlerSummary,
		status: "trusted" | "disabled",
	): Promise<void> {
		if (document === null) return;
		setTrustingFingerprint(handler.fingerprint);
		try {
			const updated: HookConfigDocument = await updateHookTrust(
				toTarget(document),
				handler.fingerprint,
				status,
			);
			replaceDocument(updated);
			message.success(
				t(
					status === "trusted"
						? "settings.hooks.messages.trusted"
						: "settings.hooks.messages.disabled",
				),
			);
		} catch (error: unknown) {
			message.error(
				error instanceof Error
					? error.message
					: t("settings.hooks.errors.trust"),
			);
		} finally {
			setTrustingFingerprint(null);
		}
	}

	const runColumns: ColumnsType<HookRunRecord> = useMemo(
		(): ColumnsType<HookRunRecord> => [
			{
				title: t("settings.hooks.runs.event"),
				dataIndex: "event",
				width: 150,
			},
			{
				title: t("settings.hooks.runs.status"),
				dataIndex: "status",
				width: 110,
				render: (
					status: HookRunRecord["status"],
				): React.JSX.Element => (
					<Tag color={runColor(status)}>{status}</Tag>
				),
			},
			{
				title: t("settings.hooks.runs.duration"),
				dataIndex: "durationMs",
				width: 100,
				render: (durationMs: number): string => `${durationMs} ms`,
			},
			{
				title: t("settings.hooks.runs.detail"),
				render: (
					_value: unknown,
					run: HookRunRecord,
				): React.JSX.Element => (
					<Tooltip title={run.stderr ?? run.message}>
						<Typography.Text ellipsis>
							{run.stderr ?? run.message ?? "—"}
						</Typography.Text>
					</Tooltip>
				),
			},
		],
		[t],
	);

	const sourceOptions = useMemo(
		(): Array<{ label: string; value: string }> =>
			sources.map(
				(
					item: HookConfigDocument,
				): { label: string; value: string } => ({
					label: item.source.displayName,
					value: item.source.id,
				}),
			),
		[sources],
	);
	const trustedHandlerCount: number =
		document?.handlers.filter(
			(handler: HookHandlerSummary): boolean =>
				handler.trust === "trusted",
		).length ?? 0;
	const reviewHandlerCount: number =
		document?.handlers.filter(
			(handler: HookHandlerSummary): boolean =>
				handler.trust === "review_required",
		).length ?? 0;

	return (
		<section className={`${styles.page} ${pageMotionStyles.enter}`}>
			<header className={styles.pageHeader}>
				<div>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.hooks.title")}
					</Typography.Title>
				</div>
				<Button
					icon={<Icon name="reload" />}
					onClick={(): void => void loadSources()}
					loading={loading}
				>
					{t("settings.hooks.actions.refresh")}
				</Button>
			</header>

			<div className={styles.settingsStack}>
				<SettingsList title={t("settings.hooks.sources.title")}>
					<SettingsItem
						title={t("settings.hooks.sources.select")}
						description={
							document?.source.path ??
							t("settings.hooks.sources.none")
						}
					>
						<Select
							className={styles.sourceSelect}
							value={document?.source.id}
							options={sourceOptions}
							loading={loading && sources.length === 0}
							disabled={loading || sources.length === 0}
							placeholder={t("settings.hooks.sources.none")}
							onChange={(sourceId: string): void => {
								const nextSource:
									| HookConfigDocument
									| undefined = sources.find(
									(item: HookConfigDocument): boolean =>
										item.source.id === sourceId,
								);
								if (nextSource !== undefined)
									void selectSource(nextSource);
							}}
						/>
					</SettingsItem>
					{document === null ? (
						<div className={styles.emptyState}>
							<Empty
								image={Empty.PRESENTED_IMAGE_SIMPLE}
								description={t("settings.hooks.sources.none")}
							/>
						</div>
					) : null}
				</SettingsList>

				<SettingsList title={t("settings.hooks.editor.title")}>
					<Spin spinning={loading}>
						{document === null ? (
							<div className={styles.emptyState}>
								<Empty
									image={Empty.PRESENTED_IMAGE_SIMPLE}
									description={t(
										"settings.hooks.sources.none",
									)}
								/>
							</div>
						) : (
							<div className={styles.editorSection}>
								<div className={styles.editorHeader}>
									<div className={styles.pathBlock}>
										<Typography.Text strong>
											{document.source.displayName}
										</Typography.Text>
											<Typography.Text
												type="secondary"
												copyable={createStudioCopyableConfig({ text: document.source.path })}
											ellipsis
										>
											{document.source.path}
										</Typography.Text>
									</div>
									<Space wrap>
										<Button
											onClick={(): void =>
												setContent(HOOK_TEMPLATE)
											}
											disabled={saving}
										>
											{t(
												"settings.hooks.actions.template",
											)}
										</Button>
										<Button
											icon={<Icon name="format" />}
											onClick={(): void =>
												void editorRef.current?.format()
											}
											disabled={saving}
										>
											{t("settings.hooks.actions.format")}
										</Button>
										<Button
											icon={<Icon name="reload" />}
											onClick={(): void => void reload()}
											disabled={saving}
										>
											{t("settings.hooks.actions.reload")}
										</Button>
										<Button
											type="primary"
											onClick={(): void => void save()}
											loading={saving}
											disabled={!dirty}
										>
											{t("settings.common.save")}
										</Button>
									</Space>
								</div>
								{document.errors.length > 0 && (
									<Alert
										type="error"
										showIcon
										message={document.errors.join("\n")}
										className={styles.editorAlert}
									/>
								)}
								<div className={styles.editorFrame}>
									<HooksJsonEditor
										value={content}
										readOnly={saving}
										onChange={setContent}
										editorRef={editorRef}
									/>
								</div>
							</div>
						)}
					</Spin>
				</SettingsList>

				<SettingsList title={t("settings.hooks.review.title")}>
					<SettingsItem
						title={t("settings.hooks.review.summaryTitle")}
						description={t("settings.hooks.review.warning")}
					>
						<Button
							onClick={(): void => setReviewOpen(true)}
							disabled={
								document === null ||
								document.handlers.length === 0
							}
						>
							{t("settings.hooks.actions.review", {
								count: document?.handlers.length ?? 0,
							})}
						</Button>
					</SettingsItem>
				</SettingsList>

				<SettingsList title={t("settings.hooks.runs.title")}>
					<div className={styles.runsContent}>
						<div className={styles.sectionHeader}>
							<Typography.Text type="secondary">
								{t("settings.hooks.runs.description")}
							</Typography.Text>
							<Button
								icon={<Icon name="reload" />}
								onClick={(): void => void refreshRuns()}
							>
								{t("settings.hooks.actions.refresh")}
							</Button>
						</div>
						<Table<HookRunRecord>
							rowKey="id"
							size="small"
							columns={runColumns}
							dataSource={runs}
							pagination={{ pageSize: 8, hideOnSinglePage: true }}
							locale={{
								emptyText: t("settings.hooks.runs.empty"),
							}}
						/>
					</div>
				</SettingsList>
			</div>

			<Modal
				open={reviewOpen}
				title={t("settings.hooks.review.title")}
				width={760}
				mask={{ closable: false }}
				footer={
					<Button onClick={(): void => setReviewOpen(false)}>
						{t("settings.common.close")}
					</Button>
				}
				onCancel={(): void => setReviewOpen(false)}
			>
				<Alert
					type="warning"
					showIcon
					message={t("settings.hooks.review.warning")}
					className={styles.reviewAlert}
				/>
				<List
					dataSource={document?.handlers ?? []}
					renderItem={(
						handler: HookHandlerSummary,
					): React.JSX.Element => (
						<List.Item
							actions={[
								<Button
									key="disable"
									onClick={(): void =>
										void setTrust(handler, "disabled")
									}
									loading={
										trustingFingerprint ===
										handler.fingerprint
									}
								>
									{t("settings.common.disable")}
								</Button>,
								<Button
									key="trust"
									type="primary"
									onClick={(): void =>
										void setTrust(handler, "trusted")
									}
									loading={
										trustingFingerprint ===
										handler.fingerprint
									}
								>
									{t("settings.hooks.review.trust")}
								</Button>,
							]}
						>
							<List.Item.Meta
								title={
									<Space>
										<Tag>{handler.event}</Tag>
										<Tag color={trustColor(handler.trust)}>
											{handler.trust}
										</Tag>
									</Space>
								}
								description={
									<div className={styles.handlerDescription}>
										<Typography.Text code>
											{handler.commandWindows ??
												handler.command}
										</Typography.Text>
										<Typography.Text type="secondary">
											{t(
												"settings.hooks.review.permissions",
												{
													matcher: handler.matcher,
													policy: handler.failurePolicy,
												},
											)}
										</Typography.Text>
										<Typography.Text type="secondary">
											{t("settings.hooks.review.sandbox")}
										</Typography.Text>
										<Typography.Text
											type="secondary"
												copyable={createStudioCopyableConfig({ text: handler.fingerprint })}
										>
											{t(
												"settings.hooks.review.fingerprint",
												{
													fingerprint:
														handler.fingerprint.slice(
															0,
															12,
														),
												},
											)}
										</Typography.Text>
									</div>
								}
							/>
						</List.Item>
					)}
				/>
			</Modal>
		</section>
	);
}

export default HooksSettingsPage;
