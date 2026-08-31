import {
	Alert,
	App,
	Button,
	Empty,
	Flex,
	List,
	Menu,
	Modal,
	Space,
	Spin,
	Table,
	Tag,
	Tooltip,
	Typography,
} from "antd";
import type { MenuProps } from "antd";
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
import pageMotionStyles from "@/widgets/settings/components/SettingsPageMotion.module.css";
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
	const [editOpen, setEditOpen] = useState<boolean>(false);
	const [reviewOpen, setReviewOpen] = useState<boolean>(false);
	const [runsOpen, setRunsOpen] = useState<boolean>(false);
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
			else setDocument(null);
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
			// 只在编辑器仍打开且存在未保存内容时拦截窗口关闭。关闭编辑器
			// 并选择放弃后，dirty 会被重置，SettingsWindow 不应再被卡住。
			if (!editOpen || !dirty) return;
			event.preventDefault();
		};
		window.addEventListener("beforeunload", listener);
		return (): void => window.removeEventListener("beforeunload", listener);
	}, [dirty, editOpen]);

	async function selectSource(
		sourceDocument: HookConfigDocument,
	): Promise<boolean> {
		if (sourceDocument.source.id === document?.source.id) return true;
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
			if (!confirmed) return false;
		}
		setLoading(true);
		try {
			replaceDocument(await getHookConfig(toTarget(sourceDocument)));
			return true;
		} catch (error: unknown) {
			message.error(
				error instanceof Error
					? error.message
					: t("settings.hooks.errors.load"),
			);
			return false;
		} finally {
			setLoading(false);
		}
	}

	async function editSource(
		sourceDocument: HookConfigDocument,
	): Promise<void> {
		if (sourceDocument.source.id !== document?.source.id) {
			const selected: boolean = await selectSource(sourceDocument);
			if (!selected) return;
		}
		setEditOpen(true);
	}

	function discardEditorChanges(): void {
		if (document !== null) setContent(document.content);
		setEditOpen(false);
	}

	function closeEditor(): void {
		if (saving) return;
		if (!dirty) {
			setEditOpen(false);
			return;
		}
		modal.confirm({
			title: t("settings.hooks.dirty.title"),
			content: t("settings.hooks.dirty.description"),
			okText: t("settings.hooks.dirty.discard"),
			cancelText: t("settings.common.cancel"),
			onOk: discardEditorChanges,
		});
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
			setEditOpen(false);
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

	const sourceMenuItems: MenuProps["items"] = useMemo(
		(): MenuProps["items"] =>
			sources.map(
				(
					sourceDocument: HookConfigDocument,
				): NonNullable<MenuProps["items"]>[number] => {
					const trustedCount: number = sourceDocument.handlers.filter(
						(handler: HookHandlerSummary): boolean =>
							handler.trust === "trusted",
					).length;
					const reviewCount: number = sourceDocument.handlers.filter(
						(handler: HookHandlerSummary): boolean =>
							handler.trust === "review_required",
					).length;
					return {
						key: sourceDocument.source.id,
						label: (
							<div className={styles.sourceMenuItem}>
								<div className={styles.sourceText}>
									<Typography.Text
										strong
										className={styles.sourceTitle}
									>
										{sourceDocument.source.displayName}
									</Typography.Text>
									<Space size={4} wrap>
										<Typography.Text
											type="secondary"
											className={styles.sourceMeta}
										>
											{t(
												"settings.hooks.sources.handlerCount",
												{
													count: sourceDocument
														.handlers.length,
												},
											)}
										</Typography.Text>
										{reviewCount > 0 ? (
											<Tag color="warning">
												{t(
													"settings.hooks.sources.reviewCount",
													{
														count: reviewCount,
													},
												)}
											</Tag>
										) : trustedCount > 0 ? (
											<Tag color="success">
												{t(
													"settings.hooks.sources.trustedCount",
													{
														count: trustedCount,
													},
												)}
											</Tag>
										) : null}
									</Space>
								</div>
								<Tooltip title={t("settings.common.edit")}>
									<Button
										type="text"
										shape="circle"
										icon={<Icon name="edit" />}
										aria-label={t("settings.common.edit")}
										onClick={(event): void => {
											event.preventDefault();
											event.stopPropagation();
											void editSource(sourceDocument);
										}}
									/>
								</Tooltip>
							</div>
						),
					};
				},
			),
		[sources, t, document?.source.id, dirty, saving],
	);

	return (
		<section className={`${styles.page} ${pageMotionStyles.enter}`}>
			<header className={styles.pageHeader}>
				<Flex align="center" gap="small">
					<Typography.Title level={3} className={styles.title}>
						{t("settings.hooks.title")}
					</Typography.Title>
					<Tag>{sources.length}</Tag>
				</Flex>
				<Button onClick={(): void => setRunsOpen(true)}>
					{t("settings.hooks.runs.title")}
				</Button>
			</header>

			<div className={styles.menuScroller}>
				<Spin spinning={loading}>
					{sources.length > 0 ? (
						<Menu
							className={styles.sourceMenu}
							mode="inline"
							selectedKeys={
								document === null ? [] : [document.source.id]
							}
							items={sourceMenuItems}
							onClick={({ key }): void => {
								const nextSource:
									| HookConfigDocument
									| undefined = sources.find(
									(item: HookConfigDocument): boolean =>
										item.source.id === key,
								);
								if (nextSource !== undefined)
									void editSource(nextSource);
							}}
						/>
					) : (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t("settings.hooks.sources.none")}
						/>
					)}
				</Spin>
			</div>

			<Modal
				open={editOpen}
				title={t("settings.hooks.editor.title")}
				width={900}
				mask={{ closable: false }}
				onCancel={closeEditor}
				confirmLoading={saving}
				okText={t("settings.common.save")}
				cancelText={t("settings.common.cancel")}
				onOk={(): void => void save()}
			>
				{document === null ? (
					<div className={styles.emptyState}>
						<Empty description={t("settings.hooks.sources.none")} />
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
									copyable={createStudioCopyableConfig({
										text: document.source.path,
									})}
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
									icon={<Icon name="template" />}
								>
									{t("settings.hooks.actions.template")}
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
									onClick={(): void => setReviewOpen(true)}
									disabled={document.handlers.length === 0}
								>
									{t("settings.hooks.actions.review", {
										count: document.handlers.length,
									})}
								</Button>
							</Space>
						</div>
						{document.errors.length > 0 ? (
							<Alert
								type="error"
								showIcon
								message={document.errors.join("\n")}
								className={styles.editorAlert}
							/>
						) : null}
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
			</Modal>

			<Modal
				open={runsOpen}
				title={t("settings.hooks.runs.title")}
				width={760}
				mask={{ closable: false }}
				onCancel={(): void => setRunsOpen(false)}
				footer={
					<Button onClick={(): void => setRunsOpen(false)}>
						{t("settings.common.close")}
					</Button>
				}
				className={styles.modal}
			>
				<Space
					orientation="vertical"
					size="middle"
					style={{ width: "100%" }}
				>
					<Flex justify="space-between" align="center" gap="small">
						<Typography.Text type="secondary">
							{t("settings.hooks.runs.description")}
						</Typography.Text>
						<Button
							icon={<Icon name="reload" />}
							onClick={(): void => void refreshRuns()}
						>
							{t("settings.hooks.actions.refresh")}
						</Button>
					</Flex>
					<Table<HookRunRecord>
						rowKey="id"
						size="small"
						columns={runColumns}
						dataSource={runs}
						pagination={{ pageSize: 8, hideOnSinglePage: true }}
						locale={{ emptyText: t("settings.hooks.runs.empty") }}
					/>
				</Space>
			</Modal>

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
											copyable={createStudioCopyableConfig(
												{
													text: handler.fingerprint,
												},
											)}
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
