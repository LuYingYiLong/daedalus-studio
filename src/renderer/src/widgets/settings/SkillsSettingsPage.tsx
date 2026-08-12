import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Alert, App as AntdApp, Button, Checkbox, Dropdown, Empty, Flex, Input, MenuProps, Modal, Select, Space, Spin, Switch, Tag, Tooltip, Typography, type SelectProps } from "antd";
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
	type SkillSummary,
	type SkillTarget
} from "@/platform/rpc/skill-api";
import { fetchWorkspaces } from "@/platform/rpc/workspace-api";
import type { WorkspaceConfig, WorkspaceSourceFolder } from "@/platform/rpc/types";

type SkillViewSelection = "all" | "personal" | `workspace:${string}`;

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

function getSourceFolderLabel(sourceFolder: WorkspaceSourceFolder): string {
	const normalizedPath: string = sourceFolder.path.replaceAll("\\", "/").replace(/\/$/u, "");
	const directoryName: string = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1) || sourceFolder.path;
	return `[${sourceFolder.id}] ${directoryName}`;
}

function getSkillIdentity(skill: SkillSummary): string {
	return `${skill.workspaceId ?? "global"}\u0000${skill.ref}`;
}

function SkillsSettingsPage(): React.JSX.Element | null {
	const { t } = useTranslation();
	const { modal } = AntdApp.useApp();
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [selectedSourceFolderId, setSelectedSourceFolderId] = useState<string | null>(null);
	const [areWorkspacesLoading, setAreWorkspacesLoading] = useState<boolean>(true);
	const [query, setQuery] = useState<string>("");
	const [viewSelection, setViewSelection] = useState<SkillViewSelection>("all");
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
	const installScopeOptions: Array<{ value: SkillInstallSource; label: string }> = useMemo((): Array<{ value: SkillInstallSource; label: string }> => [
		{ value: "personal", label: t("settings.skills.scope.personal") },
		{ value: "project", label: t("settings.skills.scope.project") }
	], [t]);
	const selectedWorkspace: WorkspaceConfig | null = useMemo((): WorkspaceConfig | null => {
		return workspaces.find((workspace: WorkspaceConfig): boolean => workspace.id === selectedWorkspaceId) ?? null;
	}, [selectedWorkspaceId, workspaces]);
	const workspaceOptions: Array<{ value: string; label: string }> = useMemo((): Array<{ value: string; label: string }> => {
		return workspaces.map((workspace: WorkspaceConfig): { value: string; label: string } => ({ value: workspace.id, label: workspace.name }));
	}, [workspaces]);
	const viewSelectionOptions = useMemo((): SelectProps["options"] => [
		{ value: "all", label: t("settings.skills.scope.all") },
		{ value: "personal", label: t("settings.skills.scope.personal") },
		...workspaces.map((workspace: WorkspaceConfig): { value: string; label: string } => ({
			value: `workspace:${workspace.id}`,
			label: workspace.name
		}))
	], [t, workspaces]);
	const sourceFolderOptions: Array<{ value: string; label: string }> = useMemo((): Array<{ value: string; label: string }> => {
		return (selectedWorkspace?.sourceFolders ?? []).map((sourceFolder: WorkspaceSourceFolder): { value: string; label: string } => ({
			value: sourceFolder.id,
			label: getSourceFolderLabel(sourceFolder)
		}));
	}, [selectedWorkspace]);

	function selectedCatalogTarget(): SkillTarget {
		return selectedWorkspaceId === null ? {} : { workspaceId: selectedWorkspaceId };
	}

	function selectedProjectTarget(): SkillTarget | null {
		return selectedWorkspaceId === null || selectedSourceFolderId === null
			? null
			: { workspaceId: selectedWorkspaceId, sourceFolderId: selectedSourceFolderId };
	}

	function handleViewSelectionChange(value: string): void {
		if (value === "all" || value === "personal") {
			setViewSelection(value);
			return;
		}
		if (!value.startsWith("workspace:")) {
			return;
		}
		const workspaceId: string = value.slice("workspace:".length);
		const workspace: WorkspaceConfig | undefined = workspaces.find((candidate: WorkspaceConfig): boolean => candidate.id === workspaceId);
		setViewSelection(value as SkillViewSelection);
		setSelectedWorkspaceId(workspaceId);
		setSelectedSourceFolderId(workspace?.primarySourceFolderId ?? null);
	}

	function targetForSkill(skill: SkillSummary): SkillTarget {
		if (skill.source !== "project") {
			return selectedCatalogTarget();
		}
		return {
			...(skill.workspaceId === undefined ? selectedCatalogTarget() : { workspaceId: skill.workspaceId }),
			...(skill.sourceFolderId === undefined ? {} : { sourceFolderId: skill.sourceFolderId })
		};
	}

	function sourceFolderLabel(sourceFolderId: string | undefined, workspaceId?: string): string | null {
		if (sourceFolderId === undefined) {
			return null;
		}
		const sourceWorkspace: WorkspaceConfig | null = workspaceId === undefined
			? selectedWorkspace
			: workspaces.find((workspace: WorkspaceConfig): boolean => workspace.id === workspaceId) ?? null;
		const sourceFolder: WorkspaceSourceFolder | undefined = sourceWorkspace?.sourceFolders.find(
			(candidate: WorkspaceSourceFolder): boolean => candidate.id === sourceFolderId
		);
		return sourceFolder === undefined ? sourceFolderId : getSourceFolderLabel(sourceFolder);
	}

	function handleWorkspaceTargetChange(workspaceId: string | null): void {
		setSelectedWorkspaceId(workspaceId);
		const workspace: WorkspaceConfig | undefined = workspaces.find((candidate: WorkspaceConfig): boolean => candidate.id === workspaceId);
		setSelectedSourceFolderId(workspace?.primarySourceFolderId ?? null);
		setNpxImportSummary(null);
	}

	const loadSkillsForView = useCallback(async (selection: SkillViewSelection, availableWorkspaces: WorkspaceConfig[]): Promise<SkillSummary[]> => {
		if (selection === "personal") {
			return (await fetchSkills()).skills.filter((skill: SkillSummary): boolean => skill.source === "personal");
		}
		if (selection === "all") {
			const results: SkillListResult[] = await Promise.all([
				fetchSkills(),
				...availableWorkspaces.map((workspace: WorkspaceConfig): Promise<SkillListResult> => fetchSkills({ workspaceId: workspace.id }))
			]);
			const skillsByIdentity: Map<string, SkillSummary> = new Map();
			for (const skill of results[0]!.skills.filter((candidate: SkillSummary): boolean => candidate.source === "personal")) {
				skillsByIdentity.set(`${skill.workspaceId ?? "global"}\u0000${skill.ref}`, skill);
			}
			for (const result of results.slice(1)) {
				for (const skill of result.skills.filter((candidate: SkillSummary): boolean => candidate.source === "project")) {
					skillsByIdentity.set(`${skill.workspaceId ?? "unknown"}\u0000${skill.ref}`, skill);
				}
			}
			return [...skillsByIdentity.values()];
		}
		const workspaceId: string = selection.slice("workspace:".length);
		return (await fetchSkills({ workspaceId })).skills.filter((skill: SkillSummary): boolean => skill.source === "project");
	}, []);

	async function refreshVisibleSkills(): Promise<void> {
		setSkills(await loadSkillsForView(viewSelection, workspaces));
	}

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		async function loadWorkspaces(): Promise<void> {
			try {
				const result = await fetchWorkspaces();
				if (cancelled) {
					return;
				}
				setWorkspaces(result.workspaces);
				setSelectedWorkspaceId(null);
				setSelectedSourceFolderId(null);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.skills.errors.loadWorkspaces"));
				}
			} finally {
				if (!cancelled) {
					setAreWorkspacesLoading(false);
				}
			}
		}
		void loadWorkspaces();
		return (): void => {
			cancelled = true;
		};
	}, [t]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		if (areWorkspacesLoading) {
			return (): void => {
				cancelled = true;
			};
		}

		async function loadSkills(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const nextSkills: SkillSummary[] = await loadSkillsForView(viewSelection, workspaces);
				if (!cancelled) {
					setSkills(nextSkills);
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
	}, [areWorkspacesLoading, loadSkillsForView, t, viewSelection, workspaces]);

	const customSkills: SkillSummary[] = useMemo((): SkillSummary[] => {
		return skills.filter((skill: SkillSummary): boolean => skill.source !== "builtin");
	}, [skills]);

	const filteredSkills: SkillSummary[] = useMemo((): SkillSummary[] => {
		const normalizedQuery: string = query.trim().toLowerCase();
		return customSkills.filter((skill: SkillSummary): boolean => {
			if (normalizedQuery.length === 0) {
				return true;
			}
			return skill.name.toLowerCase().includes(normalizedQuery)
				|| skill.description.toLowerCase().includes(normalizedQuery)
				|| skill.ref.toLowerCase().includes(normalizedQuery)
				|| skill.displayPath.toLowerCase().includes(normalizedQuery);
		});
	}, [customSkills, query]);

	const importableNpxCandidates: NpxSkillCandidate[] = useMemo((): NpxSkillCandidate[] => {
		return (npxCandidates ?? []).filter((candidate: NpxSkillCandidate): boolean => {
			return !skills.some((skill: SkillSummary): boolean => {
				return skill.source === npxTargetSource
					&& skill.slug === candidate.slug
					&& (npxTargetSource !== "project" || skill.sourceFolderId === selectedSourceFolderId);
			});
		});
	}, [npxCandidates, npxTargetSource, selectedSourceFolderId, skills]);
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
		const projectTarget: SkillTarget | null = npxTargetSource === "project" ? selectedProjectTarget() : null;
		if (npxTargetSource === "project" && projectTarget === null) {
			setNpxImportError(t("settings.skills.errors.projectTargetRequired"));
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
					await installSkill({
						source: npxTargetSource,
						kind: "folder",
						path: candidate.path,
						...(npxTargetSource === "project" ? projectTarget! : selectedCatalogTarget())
					});
					summary.installed += 1;
				} catch (error: unknown) {
					summary.failed.push({
						name: candidate.name,
						message: error instanceof Error ? error.message : t("settings.skills.errors.install")
					});
				}
			}
			await refreshVisibleSkills();
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
			const projectTarget: SkillTarget | null = pendingInstall.source === "project" ? selectedProjectTarget() : null;
			if (pendingInstall.source === "project" && projectTarget === null) {
				setErrorMessage(t("settings.skills.errors.projectTargetRequired"));
				return;
			}
			setIsSaving(true);
			setErrorMessage(null);
			await installSkill({
				...pendingInstall,
				...(pendingInstall.source === "project" ? projectTarget! : selectedCatalogTarget())
			});
			await refreshVisibleSkills();
			setPendingInstall(null);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.skills.errors.install"));
		} finally {
			setIsSaving(false);
		}
	}

	async function handleSetEnabled(skill: SkillSummary, enabled: boolean): Promise<void> {
		try {
			setBusyRef(getSkillIdentity(skill));
			setErrorMessage(null);
			await setSkillEnabled(skill.ref, enabled, targetForSkill(skill));
			await refreshVisibleSkills();
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
			const result: { ref: string; content: string } = await fetchSkillContent(skill.ref, targetForSkill(skill));
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
			await updateSkillContent(skillEditor.skill.ref, skillEditor.content, targetForSkill(skillEditor.skill));
			await refreshVisibleSkills();
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
					setBusyRef(getSkillIdentity(skill));
					setErrorMessage(null);
					await removeSkill(skill.ref, targetForSkill(skill));
					await refreshVisibleSkills();
				} catch (error: unknown) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.skills.errors.delete"));
				} finally {
					setBusyRef(null);
				}
			}
		});
	}

	if (isLoading || areWorkspacesLoading) {
		return null;
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Space>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.skills.title")}
					</Typography.Title>
					<Tag>{customSkills.length}</Tag>
				</Space>
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
					</Space.Compact>
					<Select
						value={viewSelection}
						options={viewSelectionOptions}
						className={styles.scopeWorkspaceSelect}
						onChange={(value: string): void => handleViewSelectionChange(value)}
						suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
					/>
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
					const isBusy: boolean = busyRef === getSkillIdentity(skill);
					return (
						<div key={skill.ref} className={styles.skillItem}>
							<div className={styles.skillMain}>
								<div className={styles.skillTitleRow}>
									<Typography.Title level={4} className={styles.skillTitle}>{skill.name}</Typography.Title>
									<Tag color={getSourceColor(skill.source)}>{getSourceLabel(skill.source, t)}</Tag>
									{skill.source === "project" && sourceFolderLabel(skill.sourceFolderId, skill.workspaceId) !== null ? (
										<Tag>{sourceFolderLabel(skill.sourceFolderId, skill.workspaceId)}</Tag>
									) : null}
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
				okButtonProps={{ disabled: pendingInstall?.source === "project" && selectedProjectTarget() === null }}
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
						{pendingInstall.source === "project" ? (
							<>
								<Select
									value={selectedWorkspaceId ?? undefined}
									options={workspaceOptions}
									placeholder={t("settings.skills.target.workspacePlaceholder")}
									onChange={(value: string): void => handleWorkspaceTargetChange(value)}
									suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
								/>
								<Select
									value={selectedSourceFolderId ?? undefined}
									options={sourceFolderOptions}
									placeholder={t("settings.skills.target.sourceFolderPlaceholder")}
									disabled={selectedWorkspace === null}
									onChange={setSelectedSourceFolderId}
									suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
								/>
								<Typography.Text type="secondary">{t("settings.skills.target.projectPathHint")}</Typography.Text>
							</>
						) : null}
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
				okButtonProps={{
					disabled: selectedNpxCandidates.length === 0
						|| isNpxLoading
						|| npxImportError !== null
						|| (npxTargetSource === "project" && selectedProjectTarget() === null)
				}}
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
							{npxTargetSource === "project" ? (
								<>
									<Select
										value={selectedWorkspaceId ?? undefined}
										options={workspaceOptions}
										placeholder={t("settings.skills.target.workspacePlaceholder")}
										disabled={isNpxImporting}
										onChange={(value: string): void => handleWorkspaceTargetChange(value)}
										suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
									/>
									<Select
										value={selectedSourceFolderId ?? undefined}
										options={sourceFolderOptions}
										placeholder={t("settings.skills.target.sourceFolderPlaceholder")}
										disabled={selectedWorkspace === null || isNpxImporting}
										onChange={setSelectedSourceFolderId}
										suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
									/>
								</>
							) : null}
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
