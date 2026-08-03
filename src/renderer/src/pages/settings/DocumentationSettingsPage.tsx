import {
	Alert,
	App,
	Button,
	Empty,
	Form,
	Input,
	Modal,
	Progress,
	Select,
	Space,
	Spin,
	Switch,
	Tag,
	Typography
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	cancelGodotDocumentationJob,
	fetchGodotDocumentation,
	fetchGodotDocumentationBranches,
	fetchGodotDocumentationJob,
	importLocalGodotDocumentation,
	installGodotDocumentation,
	removeGodotDocumentation,
	setGodotDocumentationEnabled,
	updateGodotDocumentation,
	type GodotDocumentationBranch,
	type GodotDocumentationJob,
	type GodotDocumentationRecord,
	type GodotDocumentationState
} from "@/api/godot-documentation-api";
import { Icon } from "@/assets/icons";
import styles from "./DocumentationSettingsPage.module.css";

type DocumentationFormValues = {
	branch: string;
	sourcePath?: string;
};

type DocumentationModalMode = "select" | "local" | "progress" | null;

const TERMINAL_JOB_STAGES: ReadonlySet<GodotDocumentationJob["stage"]> = new Set([
	"completed",
	"failed",
	"cancelled"
]);

function formatBytes(value: number, locale: string): string {
	if (value < 1024) {
		return `${value} B`;
	}
	const units: string[] = ["KB", "MB", "GB"];
	let amount: number = value;
	let unitIndex: number = -1;
	do {
		amount /= 1024;
		unitIndex += 1;
	} while (amount >= 1024 && unitIndex < units.length - 1);
	return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(amount)} ${units[unitIndex]}`;
}

function isTerminalJob(job: GodotDocumentationJob): boolean {
	return TERMINAL_JOB_STAGES.has(job.stage);
}

function getJobStatus(job: GodotDocumentationJob): "active" | "success" | "exception" | "normal" {
	if (job.stage === "completed") {
		return "success";
	}
	if (job.stage === "failed") {
		return "exception";
	}
	if (job.stage === "cancelled") {
		return "normal";
	}
	return "active";
}

function DocumentationSettingsPage(): React.JSX.Element {
	const { t, i18n } = useTranslation();
	const { message, modal } = App.useApp();
	const [form] = Form.useForm<DocumentationFormValues>();
	const [documentation, setDocumentation] = useState<GodotDocumentationState | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isToggling, setIsToggling] = useState<boolean>(false);
	const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [modalMode, setModalMode] = useState<DocumentationModalMode>(null);
	const [branches, setBranches] = useState<GodotDocumentationBranch[]>([]);
	const [branchesLoading, setBranchesLoading] = useState<boolean>(false);
	const [branchError, setBranchError] = useState<string | null>(null);
	const [job, setJob] = useState<GodotDocumentationJob | null>(null);
	const branchRequestRevision = useRef<number>(0);

	const loadDocumentation = useCallback(async (): Promise<GodotDocumentationState | null> => {
		try {
			setErrorMessage(null);
			const nextState: GodotDocumentationState = await fetchGodotDocumentation();
			setDocumentation(nextState);
			if (nextState.activeJob !== null) {
				setJob(nextState.activeJob);
				setModalMode("progress");
			}
			return nextState;
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.documentation.errors.load"));
			return null;
		}
	}, [t]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		void (async (): Promise<void> => {
			setIsLoading(true);
			const nextState = await loadDocumentation();
			if (!cancelled && nextState === null) {
				setDocumentation(null);
			}
			if (!cancelled) {
				setIsLoading(false);
			}
		})();
		return (): void => {
			cancelled = true;
		};
	}, [loadDocumentation]);

	useEffect((): (() => void) | void => {
		if (job === null || isTerminalJob(job)) {
			return;
		}
		let cancelled: boolean = false;
		const timer = window.setTimeout((): void => {
			void fetchGodotDocumentationJob(job.jobId).then((nextJob: GodotDocumentationJob | null): void => {
				if (cancelled || nextJob === null) {
					return;
				}
				setJob(nextJob);
				if (isTerminalJob(nextJob)) {
					void loadDocumentation();
					if (nextJob.stage === "completed") {
						void message.success(nextJob.unchanged
							? t("settings.documentation.messages.upToDate")
							: t("settings.documentation.messages.ready"));
						setModalMode(null);
						setJob(null);
						form.resetFields();
					}
				}
			}).catch((error: unknown): void => {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.documentation.errors.job"));
				}
			});
		}, 500);
		return (): void => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [form, job, loadDocumentation, message, t]);

	const loadBranches = useCallback(async (refresh: boolean): Promise<void> => {
		const requestRevision: number = branchRequestRevision.current + 1;
		branchRequestRevision.current = requestRevision;
		setBranchesLoading(true);
		setBranchError(null);
		try {
			const result = await fetchGodotDocumentationBranches(refresh);
			if (branchRequestRevision.current !== requestRevision) {
				return;
			}
			setBranches(result.branches);
			setBranchError(result.error ?? null);
			const currentBranch: string | undefined = form.getFieldValue("branch");
			if (!currentBranch) {
				const recommended = result.branches.find((branch: GodotDocumentationBranch): boolean => {
					return branch.name === result.recommendedBranch && !branch.installed;
				});
				const firstAvailable = recommended
					?? result.branches.find((branch: GodotDocumentationBranch): boolean => !branch.installed);
				if (firstAvailable !== undefined) {
					form.setFieldValue("branch", firstAvailable.name);
				}
			}
		} catch (error: unknown) {
			if (branchRequestRevision.current === requestRevision) {
				setBranches([]);
				setBranchError(error instanceof Error ? error.message : t("settings.documentation.errors.branches"));
			}
		} finally {
			if (branchRequestRevision.current === requestRevision) {
				setBranchesLoading(false);
			}
		}
	}, [form, t]);

	function openAddModal(): void {
		form.resetFields();
		setModalMode("select");
		setBranchError(null);
		void loadBranches(false);
	}

	function openLocalImportModal(): void {
		form.resetFields();
		setModalMode("local");
		setBranchError(null);
	}

	function closeModal(): void {
		if (job !== null && !isTerminalJob(job)) {
			return;
		}
		setModalMode(null);
		setJob(null);
		form.resetFields();
	}

	async function startInstall(): Promise<void> {
		try {
			const values: DocumentationFormValues = await form.validateFields();
			const nextJob: GodotDocumentationJob = await installGodotDocumentation(values.branch);
			setJob(nextJob);
			setModalMode("progress");
		} catch (error: unknown) {
			if (error instanceof Error) {
				setBranchError(error.message);
			}
		}
	}

	async function pickLocalSource(kind: "directory" | "zip"): Promise<void> {
		try {
			setBranchError(null);
			const sourcePath: string | null = kind === "directory"
				? await window.electronAPI.godotDocumentationFs.pickDirectory()
				: await window.electronAPI.godotDocumentationFs.pickZip();
			if (sourcePath !== null) {
				form.setFieldValue("sourcePath", sourcePath);
			}
		} catch (error: unknown) {
			setBranchError(error instanceof Error ? error.message : t("settings.documentation.errors.pickLocal"));
		}
	}

	async function startLocalImport(): Promise<void> {
		try {
			const values: DocumentationFormValues = await form.validateFields();
			const sourcePath: string = values.sourcePath?.trim() ?? "";
			const nextJob: GodotDocumentationJob = await importLocalGodotDocumentation(values.branch, sourcePath);
			setJob(nextJob);
			setModalMode("progress");
		} catch (error: unknown) {
			if (error instanceof Error) {
				setBranchError(error.message);
			}
		}
	}

	async function startUpdate(document: GodotDocumentationRecord): Promise<void> {
		try {
			setBusyDocumentId(document.id);
			const nextJob: GodotDocumentationJob = await updateGodotDocumentation(document.id);
			setJob(nextJob);
			setModalMode("progress");
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.documentation.errors.update"));
		} finally {
			setBusyDocumentId(null);
		}
	}

	async function cancelJob(): Promise<void> {
		if (job === null || isTerminalJob(job)) {
			return;
		}
		try {
			const nextJob: GodotDocumentationJob | null = await cancelGodotDocumentationJob(job.jobId);
			if (nextJob !== null) {
				setJob(nextJob);
			}
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.documentation.errors.cancel"));
		}
	}

	async function toggleDocumentation(enabled: boolean): Promise<void> {
		try {
			setIsToggling(true);
			setDocumentation(await setGodotDocumentationEnabled(enabled));
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.documentation.errors.toggle"));
		} finally {
			setIsToggling(false);
		}
	}

	function confirmRemove(document: GodotDocumentationRecord): void {
		modal.confirm({
			title: t("settings.documentation.remove.title"),
			content: t("settings.documentation.remove.description", { branch: document.branch }),
			okText: t("settings.common.delete"),
			okButtonProps: { danger: true },
			async onOk(): Promise<void> {
				try {
					setBusyDocumentId(document.id);
					setDocumentation(await removeGodotDocumentation(document.id));
					void message.success(t("settings.documentation.messages.removed", { branch: document.branch }));
				} catch (error: unknown) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.documentation.errors.remove"));
					throw error;
				} finally {
					setBusyDocumentId(null);
				}
			}
		});
	}

	const documents: GodotDocumentationRecord[] = documentation?.documents ?? [];
	const selectedBranch: string | undefined = Form.useWatch("branch", form);
	const selectedLocalPath: string | undefined = Form.useWatch("sourcePath", form);

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.documentation.title")}
					</Typography.Title>
					<Tag>{documents.length}</Tag>
				</div>
				<div className={styles.headerActions}>
					<Typography.Text>{t("settings.documentation.enabled")}</Typography.Text>
					<Switch
						checked={documentation?.enabled ?? false}
						loading={isToggling}
						disabled={documents.length === 0 || documentation === null}
						onChange={(checked: boolean): void => {
							void toggleDocumentation(checked);
						}}
					/>
					<Button
						icon={<Icon name="folder-open" />}
						disabled={documentation?.activeJob !== null}
						onClick={openLocalImportModal}
					>
						{t("settings.documentation.importLocal")}
					</Button>
					<Button
						type="primary"
						icon={<Icon name="add" />}
						disabled={documentation?.activeJob !== null}
						onClick={openAddModal}
					>
						{t("settings.documentation.add")}
					</Button>
				</div>
			</header>

			<div className={styles.body}>
				{errorMessage !== null ? (
					<Alert
						type="warning"
						showIcon={true}
						description={errorMessage}
						closable={{ onClose: (): void => setErrorMessage(null) }}
					/>
				) : null}
				{isLoading ? (
					<div className={styles.centerState}><Spin /></div>
				) : documents.length === 0 ? (
					<div className={styles.centerState}>
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t("settings.documentation.empty")}
						>
							<Space>
								<Button icon={<Icon name="folder-open" />} onClick={openLocalImportModal}>
									{t("settings.documentation.importLocal")}
								</Button>
								<Button type="primary" icon={<Icon name="download" />} onClick={openAddModal}>
									{t("settings.documentation.add")}
								</Button>
							</Space>
						</Empty>
					</div>
				) : (
					<div className={styles.documentList}>
						{documents.map((document: GodotDocumentationRecord): React.JSX.Element => {
							const busy: boolean = busyDocumentId === document.id;
							return (
								<div className={styles.documentItem} key={document.id}>
									<div className={styles.documentMain}>
										<div className={styles.documentTitleRow}>
											<Typography.Title level={4} className={styles.documentTitle}>
												Godot {document.branch}
											</Typography.Title>
											<Tag color="blue">{document.branch}</Tag>
											<Tag color={document.source === "local" ? "purple" : "default"}>
												{t(`settings.documentation.item.source.${document.source}`)}
											</Tag>
										</div>
										{document.source === "local" && document.sourcePath ? (
											<Typography.Text
												type="secondary"
												className={styles.documentMeta}
												title={document.sourcePath}
											>
												{document.sourcePath}
											</Typography.Text>
										) : null}
										<Typography.Text type="secondary" className={styles.documentMeta}>
											{t("settings.documentation.item.stats", {
												documents: document.documentCount,
												chunks: document.chunkCount,
												classes: document.classCount,
												size: formatBytes(document.sizeBytes, i18n.resolvedLanguage ?? "en-US")
											})}
										</Typography.Text>
										<Typography.Text type="secondary" className={styles.documentMeta}>
											{t("settings.documentation.item.updated", {
												date: new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en-US", {
													dateStyle: "medium",
													timeStyle: "short"
												}).format(new Date(document.updatedAt))
											})}
										</Typography.Text>
									</div>
									<div className={styles.documentActions}>
										<Button
											type="text"
											icon={<Icon name="reload" />}
											loading={busy}
											disabled={busyDocumentId !== null || documentation?.activeJob !== null}
											onClick={(): void => {
												void startUpdate(document);
											}}
										>
											{t("settings.common.update")}
										</Button>
										<Button
											type="text"
											danger={true}
											icon={<Icon name="remove" />}
											loading={busy}
											disabled={busyDocumentId !== null || documentation?.activeJob !== null}
											onClick={(): void => confirmRemove(document)}
										>
											{t("settings.common.delete")}
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<Modal
				title={modalMode === "progress"
					? t("settings.documentation.progress.title", { branch: job?.branch ?? "" })
					: modalMode === "local"
						? t("settings.documentation.local.title")
						: t("settings.documentation.modal.title")}
				className={styles.modal}
				centered={true}
				open={modalMode !== null}
				onCancel={closeModal}
				mask={{ closable: job === null || isTerminalJob(job) }}
				closable={job === null || isTerminalJob(job)}
				destroyOnHidden={true}
				footer={modalMode === "select" ? (
					<Space>
						<Button onClick={closeModal}>{t("settings.common.cancel")}</Button>
						<Button
							type="primary"
							loading={job !== null && !isTerminalJob(job)}
							disabled={!selectedBranch || branchesLoading}
							onClick={(): void => {
								void startInstall();
							}}
						>
							{t("settings.documentation.modal.download")}
						</Button>
					</Space>
				) : modalMode === "local" ? (
					<Space>
						<Button onClick={closeModal}>{t("settings.common.cancel")}</Button>
						<Button
							type="primary"
							disabled={!selectedBranch?.trim() || !selectedLocalPath?.trim()}
							onClick={(): void => {
								void startLocalImport();
							}}
						>
							{t("settings.documentation.local.import")}
						</Button>
					</Space>
				) : job !== null && !isTerminalJob(job) ? (
					<Button danger={true} onClick={(): void => { void cancelJob(); }}>
						{t("settings.documentation.progress.cancel")}
					</Button>
				) : (
					<Button type="primary" onClick={closeModal}>
						{t("settings.common.close")}
					</Button>
				)}
			>
				{modalMode === "select" ? (
					<div className={styles.modalIntro}>
						<Alert
							type="info"
							showIcon={true}
							message={t("settings.documentation.modal.sourceTitle")}
							description={t("settings.documentation.modal.sourceDescription")}
						/>
						<Form<DocumentationFormValues>
							form={form}
							layout="vertical"
							preserve={false}
						>
							<div className={styles.branchRow}>
								<Form.Item
									className={styles.branchField}
									name="branch"
									label={t("settings.documentation.modal.branch")}
									rules={[{ required: true, message: t("settings.documentation.modal.branchRequired") }]}
								>
									<Select
										showSearch={true}
										loading={branchesLoading}
										placeholder={t("settings.documentation.modal.branchPlaceholder")}
										optionFilterProp="label"
										options={branches.map((branch: GodotDocumentationBranch) => ({
											value: branch.name,
											label: branch.installed
												? `${branch.name} · ${t("settings.documentation.modal.installed")}`
												: `${branch.name} · ${branch.commitSha.slice(0, 8)}`,
											disabled: branch.installed
										}))}
										notFoundContent={branchesLoading ? <Spin size="small" /> : null}
									/>
								</Form.Item>
								<Button
									aria-label={t("settings.documentation.modal.refresh")}
									title={t("settings.documentation.modal.refresh")}
									icon={<Icon name="reload" />}
									loading={branchesLoading}
									onClick={(): void => {
										void loadBranches(true);
									}}
								/>
							</div>
						</Form>
						{branchError !== null ? (
							<Alert type="warning" showIcon={true} description={branchError} />
						) : null}
						<Typography.Text type="secondary">
							{t("settings.documentation.modal.notice")}
						</Typography.Text>
					</div>
				) : modalMode === "local" ? (
					<div className={styles.modalIntro}>
						<Alert
							type="info"
							showIcon={true}
							message={t("settings.documentation.local.sourceTitle")}
							description={t("settings.documentation.local.sourceDescription")}
						/>
						<Form<DocumentationFormValues>
							form={form}
							layout="vertical"
							preserve={false}
						>
							<Form.Item
								name="branch"
								label={t("settings.documentation.local.branch")}
								rules={[{ required: true, whitespace: true, message: t("settings.documentation.local.branchRequired") }]}
							>
								<Input placeholder={t("settings.documentation.local.branchPlaceholder")} />
							</Form.Item>
							<Form.Item
								name="sourcePath"
								label={t("settings.documentation.local.source")}
								rules={[{ required: true, whitespace: true, message: t("settings.documentation.local.sourceRequired") }]}
							>
								<Input
									readOnly={true}
									placeholder={t("settings.documentation.local.sourcePlaceholder")}
								/>
							</Form.Item>
							<Space wrap={true}>
								<Button
									icon={<Icon name="folder-open" />}
									onClick={(): void => { void pickLocalSource("directory"); }}
								>
									{t("settings.documentation.local.selectFolder")}
								</Button>
								<Button
									icon={<Icon name="archive" />}
									onClick={(): void => { void pickLocalSource("zip"); }}
								>
									{t("settings.documentation.local.selectZip")}
								</Button>
							</Space>
						</Form>
						{branchError !== null ? (
							<Alert type="warning" showIcon={true} description={branchError} />
						) : null}
					</div>
				) : job !== null ? (
					<div className={styles.progressBody}>
						<div className={styles.progressHeader}>
							<Tag color={job.stage === "failed" ? "error" : job.stage === "completed" ? "success" : "processing"}>
								{t(`settings.documentation.progress.stage.${job.stage}`)}
							</Tag>
							<Typography.Text code={true}>{job.branch}</Typography.Text>
						</div>
						<Progress
							percent={job.progress ?? 0}
							status={getJobStatus(job)}
							showInfo={job.progress !== null}
						/>
						<Typography.Text className={styles.progressMessage}>
							{job.unchanged
								? t("settings.documentation.messages.upToDate")
								: job.message.startsWith("Download interrupted")
									? t("settings.documentation.progress.retrying")
									: t(`settings.documentation.progress.${job.operation === "import" ? "localMessage" : "message"}.${job.stage}`)}
						</Typography.Text>
						{job.error !== null ? (
							<Alert type="error" showIcon={true} description={job.error} />
						) : null}
					</div>
				) : null}
			</Modal>
		</section>
	);
}

export default DocumentationSettingsPage;
