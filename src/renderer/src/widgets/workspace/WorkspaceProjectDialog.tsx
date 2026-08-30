import { useEffect, useMemo, useState } from "react";
import {
	Button,
	Flex,
	Input,
	List,
	Modal,
	Popover,
	Space,
	Tag,
	Tooltip,
	Typography
} from "antd";
import { useTranslation } from "react-i18next";
import type {
	WorkspaceColor,
	WorkspaceConfig,
	WorkspaceIcon,
	WorkspaceSourceFolder
} from "@/platform/rpc/types";
import { configureEnvironment, updateWorkspace } from "@/platform/rpc/workspace-api";
import { Icon } from "@/assets/icons";
import {
	getWorkspaceIconStyle,
	WORKSPACE_COLOR_VALUES,
	WORKSPACE_ICON_NAMES,
	WorkspaceIconView
} from "./workspace-appearance";
import styles from "./WorkspaceProjectDialog.module.css";

type WorkspaceProjectDraft = {
	name: string;
	icon: WorkspaceIcon;
	color: WorkspaceColor;
	sourceFolders: WorkspaceSourceFolder[];
	primarySourceFolderId: string;
};

export type WorkspaceProjectDialogProps = {
	open: boolean;
	workspace: WorkspaceConfig | null;
	onCancel: () => void;
	onSaved: (workspace: WorkspaceConfig) => void;
	onRequestDelete?: (workspace: WorkspaceConfig) => void;
};

const ICON_OPTIONS: WorkspaceIcon[] = [0, 1, 2, 3, 4, 5, 6];
const COLOR_OPTIONS: WorkspaceColor[] = [0, 1, 2, 3, 4, 5, 6, 7];

function createDraft(workspace: WorkspaceConfig): WorkspaceProjectDraft {
	return {
		name: workspace.name,
		icon: workspace.icon,
		color: workspace.color,
		sourceFolders: workspace.sourceFolders.map((source): WorkspaceSourceFolder => ({
			...source,
			capabilities: { ...source.capabilities }
		})),
		primarySourceFolderId: workspace.primarySourceFolderId
	};
}

function createEmptyDraft(): WorkspaceProjectDraft {
	return {
		name: "",
		icon: 0,
		color: 0,
		sourceFolders: [],
		primarySourceFolderId: ""
	};
}

function createClientSourceFolder(path: string): WorkspaceSourceFolder {
	return {
		id: `source-${window.crypto.randomUUID()}`,
		path,
		capabilities: { git: false, godot: false }
	};
}

function pathKey(path: string): string {
	return path.replaceAll("\\", "/").replace(/\/+$/u, "").toLocaleLowerCase();
}

export default function WorkspaceProjectDialog({
	open,
	workspace,
	onCancel,
	onSaved,
	onRequestDelete
}: WorkspaceProjectDialogProps): React.JSX.Element {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<WorkspaceProjectDraft | null>(null);
	const [saving, setSaving] = useState<boolean>(false);
	const [addingFolder, setAddingFolder] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [appearanceOpen, setAppearanceOpen] = useState<boolean>(false);

	useEffect((): void => {
		if (open) {
			setDraft(workspace === null ? createEmptyDraft() : createDraft(workspace));
			setError(null);
			setAppearanceOpen(false);
		}
	}, [open, workspace]);

	const appearanceContent: React.JSX.Element | null = useMemo((): React.JSX.Element | null => {
		if (draft === null) {
			return null;
		}
		return (
			<div className={styles.appearancePicker}>
				<Typography.Text type="secondary">
					{t("workspaceTree.projectEditor.icon", { defaultValue: "Icon" })}
				</Typography.Text>
				<div className={styles.optionGrid}>
					{ICON_OPTIONS.map((icon): React.JSX.Element => (
						<Button
							type={draft.icon === icon ? "primary" : "text"}
							shape="circle"
							icon={<Icon name={WORKSPACE_ICON_NAMES[icon]} />}
							aria-label={WORKSPACE_ICON_NAMES[icon]}
							onClick={(): void => setDraft((current): WorkspaceProjectDraft | null => (
								current === null ? null : { ...current, icon }
							))}
						/>
					))}
				</div>
				<Typography.Text type="secondary">
					{t("workspaceTree.projectEditor.color", { defaultValue: "Color" })}
				</Typography.Text>
				<div className={styles.optionGrid}>
					{COLOR_OPTIONS.map((color): React.JSX.Element => (
						<Button
							key={color}
							type={draft.color === color ? "primary" : "text"}
							shape="circle"
							className={styles.colorButton}
							aria-label={`${t("workspaceTree.projectEditor.color", { defaultValue: "Color" })} ${color}`}
							onClick={(): void => setDraft((current): WorkspaceProjectDraft | null => (
								current === null ? null : { ...current, color }
							))}
						>
							<span
								className={styles.colorSwatch}
								style={{
									background: color === 0 ? "#1f1f1f" : WORKSPACE_COLOR_VALUES[color]
								}}
							/>
						</Button>
					))}
				</div>
			</div>
		);
	}, [draft, t]);

	async function handleAddFolder(): Promise<void> {
		if (draft === null || addingFolder) {
			return;
		}
		try {
			setAddingFolder(true);
			const selectedPath: string | null = await window.electronAPI.workspaceFs.pickWorkspaceDirectory();
			if (selectedPath === null) {
				return;
			}
			if (draft.sourceFolders.some((source): boolean => pathKey(source.path) === pathKey(selectedPath))) {
				setError(t("workspaceTree.projectEditor.duplicateFolder", { defaultValue: "This source folder is already in the project." }));
				return;
			}
			setDraft((current): WorkspaceProjectDraft | null => {
				if (current === null) {
					return null;
				}
				const sourceFolder: WorkspaceSourceFolder = createClientSourceFolder(selectedPath);
				return {
					...current,
					sourceFolders: [...current.sourceFolders, sourceFolder],
					primarySourceFolderId: current.primarySourceFolderId || sourceFolder.id
				};
			});
			setError(null);
		} catch (addError: unknown) {
			setError(addError instanceof Error ? addError.message : t("workspaceTree.projectEditor.addFailed", { defaultValue: "Failed to add source folder." }));
		} finally {
			setAddingFolder(false);
		}
	}

	async function handleSave(): Promise<void> {
		if (draft === null || saving) {
			return;
		}
		if (draft.name.trim().length === 0) {
			setError(t("workspaceTree.projectEditor.nameRequired", { defaultValue: "Project name cannot be empty." }));
			return;
		}
		if (draft.sourceFolders.length === 0 || draft.primarySourceFolderId.length === 0) {
			setError(t("workspaceTree.projectEditor.sourceFolderRequired", { defaultValue: "Add a source folder before saving." }));
			return;
		}
		try {
			setSaving(true);
			setError(null);
			const primarySourceFolder: WorkspaceSourceFolder | undefined = draft.sourceFolders.find(
				(source: WorkspaceSourceFolder): boolean => source.id === draft.primarySourceFolderId
			);
			if (primarySourceFolder === undefined) {
				throw new Error("The primary source folder must belong to the project.");
			}
			let workspaceToSave: WorkspaceConfig;
			if (workspace === null) {
				const configured = await configureEnvironment({
					workspaceRoot: primarySourceFolder.path,
					sessionId: null
				});
				if (configured.workspace === null) {
					throw new Error("Workspace registration did not return a workspace");
				}
				workspaceToSave = configured.workspace;
			} else {
				workspaceToSave = workspace;
			}
			const updated: WorkspaceConfig = await updateWorkspace({
				workspaceId: workspaceToSave.id,
				name: draft.name,
				icon: draft.icon,
				color: draft.color,
				sourceFolders: draft.sourceFolders.map((source) => ({ id: source.id, path: source.path })),
				primarySourceFolderId: draft.primarySourceFolderId
			});
			onSaved(updated);
		} catch (saveError: unknown) {
			setError(saveError instanceof Error ? saveError.message : t("workspaceTree.projectEditor.saveFailed", { defaultValue: "Failed to save project." }));
		} finally {
			setSaving(false);
		}
	}

	return (
		<Modal
			width={680}
			open={open}
			title={workspace === null ? t("workspaceTree.actions.newProject") : t("workspaceTree.actions.editProject")}
			confirmLoading={saving}
			okText={t("workspaceTree.projectEditor.confirm")}
			okButtonProps={{ "data-studio-project-confirm": "true" }}
			cancelText={t("workspaceTree.projectEditor.cancel")}
			onOk={(): void => void handleSave()}
			onCancel={(): void => {
				if (!saving) {
					onCancel();
				}
			}}
			footer={(_, { OkBtn, CancelBtn }): React.JSX.Element => (
				<Flex justify="space-between" align="center">
					{workspace === null ? <span /> : (
						<Button
							danger
							type="text"
							disabled={saving}
							onClick={(): void => onRequestDelete?.(workspace)}
						>
							{t("workspaceTree.actions.delete")}
						</Button>
					)}
					<Space>
						<CancelBtn />
						<OkBtn />
					</Space>
				</Flex>
			)}
		>
			{draft === null ? null : (
				<div className={styles.modal}>
					<Space.Compact block>
						<Popover
							trigger="click"
							placement="bottomLeft"
							open={appearanceOpen}
							content={appearanceContent}
							onOpenChange={setAppearanceOpen}
						>
							<Button
								icon={<WorkspaceIconView workspace={draft} width={18} height={18} />}
								aria-label={t("workspaceTree.projectEditor.appearance", { defaultValue: "Project appearance" })}
							/>
						</Popover>
						<Input
							value={draft.name}
							maxLength={120}
							placeholder={t("workspaceTree.projectEditor.namePlaceholder", { defaultValue: "Project name" })}
							onChange={(event): void => {
								setDraft((current): WorkspaceProjectDraft | null => current === null
									? null
									: { ...current, name: event.target.value });
								setError(null);
							}}
						/>
					</Space.Compact>
					<Flex vertical>
						<Flex justify="space-between" align="center">
							<Typography.Title level={5} className={styles.sectionTitle}>
								{t("workspaceTree.projectEditor.sourceFolders", { defaultValue: "Source folders" })}
							</Typography.Title>
							<Button
								type="text"
								icon={<Icon name="add" />}
								loading={addingFolder}
								onClick={(): void => void handleAddFolder()}
							>
								{t("workspaceTree.projectEditor.addFolder", { defaultValue: "Add folder" })}
							</Button>
						</Flex>
						<List
							className={styles.sourceList}
							dataSource={draft.sourceFolders}
							renderItem={(source): React.JSX.Element => {
								const primary: boolean = source.id === draft.primarySourceFolderId;
								return (
									<List.Item
										actions={[
											primary ? null : (
												<Tooltip key="primary" title={t("workspaceTree.projectEditor.makePrimary", { defaultValue: "Make primary" })}>
													<Button
														type="text"
														shape="circle"
														icon={<Icon name="pin" />}
														aria-label={t("workspaceTree.projectEditor.makePrimary", { defaultValue: "Make primary" })}
														onClick={(): void => setDraft((current): WorkspaceProjectDraft | null => (
															current === null ? null : { ...current, primarySourceFolderId: source.id }
														))}
													/>
												</Tooltip>
											),
											primary ? null : (
												<Tooltip key="remove" title={t("workspaceTree.projectEditor.removeFolder", { defaultValue: "Remove source folder" })}>
													<Button
														type="text"
														danger
														shape="circle"
														icon={<Icon name="remove" />}
														aria-label={t("workspaceTree.projectEditor.removeFolder", { defaultValue: "Remove source folder" })}
														onClick={(): void => setDraft((current): WorkspaceProjectDraft | null => current === null
															? null
															: {
																...current,
																sourceFolders: current.sourceFolders.filter((item): boolean => item.id !== source.id)
															})}
													/>
												</Tooltip>
											)
										].filter((action): action is React.JSX.Element => action !== null)}
									>
										<List.Item.Meta
											avatar={<Icon name="folder" style={getWorkspaceIconStyle(draft.color)} />}
											title={(
												<Space size={6}>
													<Typography.Text ellipsis>{source.path.split(/[\\/]/u).at(-1) || source.path}</Typography.Text>
													{primary ? <Tag color="blue">{t("workspaceTree.projectEditor.primary", { defaultValue: "Primary" })}</Tag> : null}
													{source.capabilities.git ? <Tag>Git</Tag> : null}
													{source.capabilities.godot ? <Tag color="cyan">Godot</Tag> : null}
												</Space>
											)}
											description={<Typography.Text type="secondary" ellipsis>{source.path}</Typography.Text>}
										/>
									</List.Item>
								);
							}}
						/>
						{error === null ? null : <Typography.Text type="danger">{error}</Typography.Text>}
					</Flex>
				</div>
			)}
		</Modal>
	);
}
