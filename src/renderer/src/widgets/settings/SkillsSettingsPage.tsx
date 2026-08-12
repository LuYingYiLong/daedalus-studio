import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Alert, App as AntdApp, Button, Checkbox, Dropdown, Empty, Flex, Input, MenuProps, Modal, Select, Space, Spin, Switch, Tag, Tooltip, Typography } from "antd";
import { Icon } from "@/assets/icons";
import styles from "./SkillsSettingsPage.module.css";
import {
	fetchSkills,
	fetchSkillContent,
	installSkill,
	removeSkill,
	setSkillEnabled,
	updateSkillContent,
	type SkillInstallKind,
	type SkillInstallSource,
	type SkillListResult,
	type SkillSource,
	type SkillSummary
} from "@/platform/rpc/skill-api";

type SkillScopeFilter = "all" | Exclude<SkillSource, "builtin">;

type PendingInstall = {
	kind: SkillInstallKind;
	path: string;
	source: SkillInstallSource;
};

type NpxSkillCandidate = {
	name: string;
	path: string;
	slug: string;
};

type NpxImportSummary = {
	installed: number;
	skipped: number;
	failed: Array<{ name: string; message: string }>;
};

type SkillEditorState = {
	skill: SkillSummary;
	content: string;
};

function getSourceColor(source: SkillSource): string {
	if (source === "project") {
		return "processing";
	}
	if (source === "personal") {
		return "purple";
	}
	return "default";
}

function getSourceLabel(source: SkillSource, t: (key: string) => string): string {
	switch (source) {
		case "project":
			return t("settings.skills.scope.project");
		case "personal":
			return t("settings.skills.scope.personal");
		default:
			return t("settings.skills.scope.builtin");
	}
}

function applySkillResult(result: SkillListResult, setSkills: (skills: SkillSummary[]) => void): void {
	setSkills(result.skills);
}

function SkillsSettingsPage(): React.JSX.Element | null {
	const { t } = useTranslation();
	const { modal } = AntdApp.useApp();
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [query, setQuery] = useState<string>("");
	const [scopeFilter, setScopeFilter] = useState<SkillScopeFilter>("all");
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [busyRef, setBusyRef] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pendingInstall, setPendingInstall] = useState<PendingInstall | null>(null);
	const [npxImportOpen, setNpxImportOpen] = useState<boolean>(false);
	const [npxCandidates, setNpxCandidates] = useState<NpxSkillCandidate[] | null>(null);
	const [npxSelectedPaths, setNpxSelectedPaths] = useState<string[]>([]);
	const [npxTargetSource, setNpxTargetSource] = useState<SkillInstallSource>("personal");
	const [isNpxLoading, setIsNpxLoading] = useState<boolean>(false);
	const [isNpxImporting, setIsNpxImporting] = useState<boolean>(false);
	const [npxImportError, setNpxImportError] = useState<string | null>(null);
	const [npxImportSummary, setNpxImportSummary] = useState<NpxImportSummary | null>(null);
	const [skillEditor, setSkillEditor] = useState<SkillEditorState | null>(null);
	const [isSkillEditorLoading, setIsSkillEditorLoading] = useState<boolean>(false);
	const [isSkillEditorSaving, setIsSkillEditorSaving] = useState<boolean>(false);
	const [skillEditorError, setSkillEditorError] = useState<string | null>(null);
	const addItems: MenuProps["items"] = useMemo((): MenuProps["items"] => [
		{
			key: "npx",
			label: t("settings.skills.actions.importFromNpx"),
			icon: <Icon name="download" />
		},
		{
			key: "zip",
			label: t("settings.skills.actions.installFromZip"),
			icon: <Icon name="file-zip" />
		},
		{
			key: "folder",
			label: t("settings.skills.actions.installFromFolder"),
			icon: <Icon name="folder" />
		}
	], [t]);
	const scopeOptions: Array<{ value: SkillScopeFilter; label: string }> = useMemo((): Array<{ value: SkillScopeFilter; label: string }> => [
		{ value: "all", label: t("settings.skills.scope.all") },
		{ value: "personal", label: t("settings.skills.scope.personal") },
		{ value: "project", label: t("settings.skills.scope.project") }
	], [t]);
	const installScopeOptions: Array<{ value: SkillInstallSource; label: string }> = useMemo((): Array<{ value: SkillInstallSource; label: string }> => [
		{ value: "personal", label: t("settings.skills.scope.personal") },
		{ value: "project", label: t("settings.skills.scope.project") }
	], [t]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadSkills(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const result: SkillListResult = await fetchSkills();
				if (!cancelled) {
					applySkillResult(result, setSkills);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.skills.errors.load"));
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadSkills();

		return (): void => {
			cancelled = true;
		};
	}, [t]);

	const customSkills: SkillSummary[] = useMemo((): SkillSummary[] => {
		return skills.filter((skill: SkillSummary): boolean => skill.source !== "builtin");
	}, [skills]);

	const filteredSkills: SkillSummary[] = useMemo((): SkillSummary[] => {
		const normalizedQuery: string = query.trim().toLowerCase();
		return customSkills.filter((skill: SkillSummary): boolean => {
			const matchesScope: boolean = scopeFilter === "all" || skill.source === scopeFilter;
			if (!matchesScope) {
				return false;
			}
			if (normalizedQuery.length === 0) {
				return true;
			}
			return skill.name.toLowerCase().includes(normalizedQuery)
				|| skill.description.toLowerCase().includes(normalizedQuery)
				|| skill.ref.toLowerCase().includes(normalizedQuery)
				|| skill.displayPath.toLowerCase().includes(normalizedQuery);
		});
	}, [customSkills, query, scopeFilter]);

	const importableNpxCandidates: NpxSkillCandidate[] = useMemo((): NpxSkillCandidate[] => {
		return (npxCandidates ?? []).filter((candidate: NpxSkillCandidate): boolean => {
			return !skills.some((skill: SkillSummary): boolean => skill.source === npxTargetSource && skill.slug === candidate.slug);
		});
	}, [npxCandidates, npxTargetSource, skills]);
	const selectedNpxCandidates: NpxSkillCandidate[] = useMemo((): NpxSkillCandidate[] => {
		const selectedPaths = new Set<string>(npxSelectedPaths);
		return importableNpxCandidates.filter((candidate: NpxSkillCandidate): boolean => selectedPaths.has(candidate.path));
	}, [importableNpxCandidates, npxSelectedPaths]);

	async function openInstallDialog(kind: SkillInstallKind): Promise<void> {
		try {
			setErrorMessage(null);
			const path: string | null = kind === "zip"
				? await window.electronAPI.skillFs.pickSkillZip()
				: await window.electronAPI.skillFs.pickSkillDirectory();
			if (path === null) {
				return;
			}
			setPendingInstall({ kind, path, source: "personal" });
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.skills.errors.selectSource"));
		}
	}

	async function openNpxImportDialog(): Promise<void> {
		setErrorMessage(null);
		setNpxImportOpen(true);
		setNpxCandidates(null);
		setNpxSelectedPaths([]);
		setNpxTargetSource("personal");
		setNpxImportError(null);
		setNpxImportSummary(null);
		setIsNpxLoading(true);
		try {
			const candidates: NpxSkillCandidate[] = await window.electronAPI.skillCli.listGlobalCodexSkills();
			setNpxCandidates(candidates);
			setNpxSelectedPaths(candidates.filter((candidate: NpxSkillCandidate): boolean => {
				return !skills.some((skill: SkillSummary): boolean => skill.source === "personal" && skill.slug === candidate.slug);
			}).map((candidate: NpxSkillCandidate): string => candidate.path));
		} catch (error: unknown) {
			setNpxImportError(error instanceof Error ? error.message : t("settings.skills.errors.npxDiscover"));
		} finally {
			setIsNpxLoading(false);
		}
	}

	function closeNpxImportDialog(): void {
		if (isNpxLoading || isNpxImporting) {
			return;
		}
		setNpxImportOpen(false);
	}

	function toggleNpxCandidate(path: string, checked: boolean): void {
		setNpxSelectedPaths((current: string[]): string[] => {
			return checked
				? [...new Set([...current, path])]
				: current.filter((candidatePath: string): boolean => candidatePath !== path);
		});
	}

	function toggleAllNpxCandidates(checked: boolean): void {
		setNpxSelectedPaths(checked ? importableNpxCandidates.map((candidate: NpxSkillCandidate): string => candidate.path) : []);
	}

	async function handleConfirmNpxImport(): Promise<void> {
		if (selectedNpxCandidates.length === 0) {
			return;
		}
		setIsNpxImporting(true);
		setNpxImportError(null);
		const summary: NpxImportSummary = {
			installed: 0,
			skipped: (npxCandidates?.length ?? 0) - importableNpxCandidates.length,
			failed: []
		};
		try {
			for (const candidate of selectedNpxCandidates) {
				try {
					const result: SkillListResult = await installSkill({
						source: npxTargetSource,
						kind: "folder",
						path: candidate.path
					});
					applySkillResult(result, setSkills);
					summary.installed += 1;
				} catch (error: unknown) {
					summary.failed.push({
						name: candidate.name,
						message: error instanceof Error ? error.message : t("settings.skills.errors.install")
					});
				}
			}
			setNpxSelectedPaths([]);
			setNpxImportSummary(summary);
		} finally {
			setIsNpxImporting(false);
		}
	}

	async function handleConfirmInstall(): Promise<void> {
		if (pendingInstall === null) {
			return;
		}
		try {
			setIsSaving(true);
			setErrorMessage(null);
			const result: SkillListResult = await installSkill(pendingInstall);
			applySkillResult(result, setSkills);
			setPendingInstall(null);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.skills.errors.install"));
		} finally {
			setIsSaving(false);
		}
	}

	async function handleSetEnabled(skill: SkillSummary, enabled: boolean): Promise<void> {
		try {
			setBusyRef(skill.ref);
			setErrorMessage(null);
			const result: SkillListResult = await setSkillEnabled(skill.ref, enabled);
			applySkillResult(result, setSkills);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.skills.errors.update"));
		} finally {
			setBusyRef(null);
		}
	}

	async function openSkillEditor(skill: SkillSummary): Promise<void> {
		if (!skill.editable || isSkillEditorLoading) {
			return;
		}
		setSkillEditor({ skill, content: "" });
		setSkillEditorError(null);
		setIsSkillEditorLoading(true);
		try {
			const result: { ref: string; content: string } = await fetchSkillContent(skill.ref);
			setSkillEditor((current: SkillEditorState | null): SkillEditorState | null => {
				return current?.skill.ref === result.ref ? { ...current, content: result.content } : current;
			});
		} catch (error: unknown) {
			setSkillEditorError(error instanceof Error ? error.message : t("settings.skills.errors.loadContent"));
		} finally {
			setIsSkillEditorLoading(false);
		}
	}

	async function saveSkillEditor(): Promise<void> {
		if (skillEditor === null || isSkillEditorLoading || isSkillEditorSaving) {
			return;
		}
		setIsSkillEditorSaving(true);
		setSkillEditorError(null);
		try {
			const result: SkillListResult = await updateSkillContent(skillEditor.skill.ref, skillEditor.content);
			applySkillResult(result, setSkills);
			setSkillEditor(null);
		} catch (error: unknown) {
			setSkillEditorError(error instanceof Error ? error.message : t("settings.skills.errors.updateContent"));
		} finally {
			setIsSkillEditorSaving(false);
		}
	}

	function confirmDelete(skill: SkillSummary): void {
		modal.confirm({
			title: t("settings.skills.confirm.delete.title"),
			content: t(skill.source === "project"
				? "settings.skills.confirm.delete.projectDescription"
				: "settings.skills.confirm.delete.description", { name: skill.name }),
			okText: t("settings.common.delete"),
			okButtonProps: { danger: true },
			async onOk(): Promise<void> {
				try {
					setBusyRef(skill.ref);
					setErrorMessage(null);
					const result: SkillListResult = await removeSkill(skill.ref);
					applySkillResult(result, setSkills);
				} catch (error: unknown) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.skills.errors.delete"));
				} finally {
					setBusyRef(null);
				}
			}
		});
	}

	if (isLoading) {
		return null;
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.skills.title")}
					</Typography.Title>
					<Tag>{customSkills.length}</Tag>
				</div>
				<Flex gap="small" className={styles.toolbar}>
					<Space.Compact block={true} className={styles.filtersCompact}>
						<Input
							allowClear={true}
							prefix={<Icon name="search" />}
							placeholder={t("settings.skills.searchPlaceholder")}
							className={styles.searchBox}
							value={query}
							onChange={(event: ChangeEvent<HTMLInputElement>): void => setQuery(event.target.value)}
						/>
						<Select
							value={scopeFilter}
							options={scopeOptions}
							className={styles.selectBox}
							onChange={(value: SkillScopeFilter): void => setScopeFilter(value)}
							suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
						/>
					</Space.Compact>
					<Dropdown
						menu={{
							items: addItems,
							onClick: ({ key }): void => {
								if (key === "npx") {
									void openNpxImportDialog();
									return;
								}
								void openInstallDialog(key as SkillInstallKind);
							}
						}}
						trigger={["click"]}
					>
						<Button
							type="primary"
							icon={<Icon name="add" />}
						>
							{t("settings.common.add")}
						</Button>
					</Dropdown>
				</Flex>
			</header>

			{errorMessage !== null ? (
				<Alert
					type="warning"
					showIcon={true}
					description={errorMessage}
					closable={{
						onClose: (): void => setErrorMessage(null)
					}}
				/>
			) : null}

			<div className={styles.skillList}>
				{filteredSkills.length === 0 ? (
					<Empty
						description={customSkills.length === 0 ? t("settings.skills.empty.none") : t("settings.skills.empty.noMatches")}
					/>
				) : filteredSkills.map((skill: SkillSummary): React.JSX.Element => {
					const isBusy: boolean = busyRef === skill.ref;
					return (
						<div key={skill.ref} className={styles.skillItem}>
							<div className={styles.skillMain}>
								<div className={styles.skillTitleRow}>
									<Typography.Title level={4} className={styles.skillTitle}>{skill.name}</Typography.Title>
									<Tag color={getSourceColor(skill.source)}>{getSourceLabel(skill.source, t)}</Tag>
								</div>
								{skill.description.length > 0 ? (
									<Typography.Text type="secondary" className={styles.skillDescription}>{skill.description}</Typography.Text>
								) : null}
								<Typography.Text className={styles.skillSummary}>{skill.displayPath}</Typography.Text>
								<Typography.Text type="secondary" className={styles.skillMeta}>
									{skill.ref}
									{skill.error !== undefined ? ` - ${skill.error}` : ""}
								</Typography.Text>
							</div>
							<div className={styles.skillActions}>
								<Flex align="center" gap="small" wrap={true} justify="flex-end">
									<Button
										type="text"
										icon={<Icon name="pencil" />}
										disabled={!skill.editable || busyRef !== null || isSkillEditorLoading}
										onClick={(): void => { void openSkillEditor(skill); }}
									>
										{t("settings.common.edit")}
									</Button>
									<Button
										type="text"
										danger={true}
										icon={<Icon name="remove" />}
										loading={isBusy}
										disabled={!skill.removable || (busyRef !== null && !isBusy)}
										onClick={(): void => confirmDelete(skill)}
									>
										{t("settings.common.delete")}
									</Button>
									<Tooltip title={skill.enabled ? t("settings.common.disable") : t("settings.common.enable")}>
										<Switch
											checked={skill.enabled}
											loading={isBusy}
											disabled={!skill.valid || (busyRef !== null && !isBusy)}
											onChange={(checked: boolean): void => {
												void handleSetEnabled(skill, checked);
											}}
										/>
									</Tooltip>
								</Flex>
							</div>
						</div>
					);
				})}
			</div>

			<Modal
				className={styles.modal}
				title={skillEditor === null ? t("settings.skills.editor.title") : t("settings.skills.editor.titleWithName", { name: skillEditor.skill.name })}
				open={skillEditor !== null}
				okText={t("settings.common.save")}
				confirmLoading={isSkillEditorSaving}
				okButtonProps={{ disabled: isSkillEditorLoading || skillEditor?.content.trim().length === 0 }}
				cancelButtonProps={{ disabled: isSkillEditorSaving }}
				destroyOnHidden={true}
				onOk={(): void => { void saveSkillEditor(); }}
				onCancel={(): void => {
					if (!isSkillEditorSaving) {
						setSkillEditor(null);
						setSkillEditorError(null);
					}
				}}
			>
				<div className={styles.skillEditor}>
					{skillEditorError !== null ? <Alert type="error" showIcon={true} description={skillEditorError} /> : null}
					<Typography.Text type="secondary">
						{skillEditor?.skill.displayPath ?? ""}
					</Typography.Text>
					<Spin spinning={isSkillEditorLoading}>
						<Input.TextArea
							className={styles.skillEditorInput}
							value={skillEditor?.content ?? ""}
							autoSize={false}
							rows={18}
							spellCheck={false}
							disabled={isSkillEditorLoading || isSkillEditorSaving}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								const content: string = event.target.value;
								setSkillEditor((current: SkillEditorState | null): SkillEditorState | null => current === null ? null : { ...current, content });
							}}
						/>
					</Spin>
					<Typography.Text type="secondary">{t("settings.skills.editor.description")}</Typography.Text>
				</div>
			</Modal>

			<Modal
				title={pendingInstall === null ? t("settings.skills.install.title") : t(pendingInstall.kind === "zip" ? "settings.skills.install.fromZip" : "settings.skills.install.fromFolder")}
				open={pendingInstall !== null}
				okText={t("settings.skills.actions.install")}
				confirmLoading={isSaving}
				onOk={(): void => {
					void handleConfirmInstall();
				}}
				onCancel={(): void => setPendingInstall(null)}
			>
				{pendingInstall !== null ? (
					<div className={styles.installForm}>
						<Typography.Text className={styles.skillSummary}>{pendingInstall.path}</Typography.Text>
						<Select
							value={pendingInstall.source}
							options={installScopeOptions}
							onChange={(value: SkillInstallSource): void => setPendingInstall({ ...pendingInstall, source: value })}
						/>
						<Typography.Text type="secondary">
							{t("settings.skills.install.description")}
						</Typography.Text>
					</div>
				) : null}
			</Modal>

			<Modal
				title={t("settings.skills.npx.title")}
				open={npxImportOpen}
				okText={t("settings.skills.actions.importSelected")}
				okButtonProps={{ disabled: selectedNpxCandidates.length === 0 || isNpxLoading || npxImportError !== null }}
				confirmLoading={isNpxImporting}
				onOk={(): void => {
					void handleConfirmNpxImport();
				}}
				onCancel={closeNpxImportDialog}
				className={styles.modal}
			>
				<div className={styles.npxImportForm}>
					<Typography.Text type="secondary">{t("settings.skills.npx.description")}</Typography.Text>
					{isNpxLoading ? <Spin /> : null}
					{npxImportError !== null ? <
						Alert type="warning"
						showIcon={true}
						description={npxImportError}
						className={styles.npxError}
					/> : null}
					{npxImportSummary !== null ? (
						<Alert
							type={npxImportSummary.failed.length === 0 ? "success" : "warning"}
							showIcon={true}
							title={t("settings.skills.npx.summary", {
								installed: npxImportSummary.installed,
								skipped: npxImportSummary.skipped,
								failed: npxImportSummary.failed.length
							})}
							description={npxImportSummary.failed.length > 0 ? npxImportSummary.failed.map((failure): string => `${failure.name}: ${failure.message}`).join("\n") : undefined}
							className={styles.npxError}
						/>
					) : null}
					{npxCandidates !== null && npxCandidates.length === 0 ? (
						<Empty image={<Icon name="empty" />} description={t("settings.skills.npx.empty")} />
					) : null}
					{npxCandidates !== null && npxCandidates.length > 0 ? (
						<>
							<Select
								value={npxTargetSource}
								options={installScopeOptions}
								disabled={isNpxImporting}
								onChange={(value: SkillInstallSource): void => {
									setNpxTargetSource(value);
									setNpxImportSummary(null);
								}}
								suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
							/>
							<Checkbox
								checked={importableNpxCandidates.length > 0 && selectedNpxCandidates.length === importableNpxCandidates.length}
								indeterminate={selectedNpxCandidates.length > 0 && selectedNpxCandidates.length < importableNpxCandidates.length}
								disabled={importableNpxCandidates.length === 0 || isNpxImporting}
								onChange={(event): void => toggleAllNpxCandidates(event.target.checked)}
							>
								{t("settings.skills.npx.selectAll")}
							</Checkbox>
							<div className={styles.npxSkillList}>
								{npxCandidates.map((candidate: NpxSkillCandidate): React.JSX.Element => {
									const alreadyInstalled: boolean = !importableNpxCandidates.some((item: NpxSkillCandidate): boolean => item.path === candidate.path);
									return (
										<div key={candidate.path} className={styles.npxSkillItem}>
											<Checkbox
												checked={npxSelectedPaths.includes(candidate.path) && !alreadyInstalled}
												disabled={alreadyInstalled || isNpxImporting}
												onChange={(event): void => toggleNpxCandidate(candidate.path, event.target.checked)}
											/>
											<div className={styles.npxSkillMain}>
												<Typography.Text strong={true}>{candidate.name}</Typography.Text>
												<Typography.Text className={styles.skillSummary}>{candidate.path}</Typography.Text>
											</div>
											{alreadyInstalled ? <Tag>{t("settings.skills.npx.alreadyInstalled")}</Tag> : null}
										</div>
									);
								})}
							</div>
						</>
					) : null}
				</div>
			</Modal>
		</section>
	);
}

export default SkillsSettingsPage;
