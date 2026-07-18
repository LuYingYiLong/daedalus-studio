import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Alert, Button, Dropdown, Empty, Input, MenuProps, Modal, Select, Space, Spin, Switch, Tag, Tooltip, Typography } from "antd";
import { Icon } from "@/assets/icons";
import styles from "./SkillsSettingsPage.module.css";
import {
	fetchSkills,
	installSkill,
	removeSkill,
	setSkillEnabled,
	type SkillInstallKind,
	type SkillInstallSource,
	type SkillListResult,
	type SkillSource,
	type SkillSummary
} from "@/api/skill-api";

const addItems: MenuProps["items"] = [
	{
		key: "zip",
		label: "Install from ZIP",
		icon: <Icon name="file_zip" />
	},
	{
		key: "folder",
		label: "Install from folder",
		icon: <Icon name="folder" />
	}
];

type SkillScopeFilter = "all" | Exclude<SkillSource, "builtin">;

type PendingInstall = {
	kind: SkillInstallKind;
	path: string;
	source: SkillInstallSource;
};

const scopeOptions: Array<{ value: SkillScopeFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "personal", label: "Personal" },
	{ value: "project", label: "Project" }
];

const installScopeOptions: Array<{ value: SkillInstallSource; label: string }> = [
	{ value: "personal", label: "Personal" },
	{ value: "project", label: "Project" }
];

function getSourceColor(source: SkillSource): string {
	if (source === "project") {
		return "processing";
	}
	if (source === "personal") {
		return "purple";
	}
	return "default";
}

function applySkillResult(result: SkillListResult, setSkills: (skills: SkillSummary[]) => void): void {
	setSkills(result.skills);
}

function SkillsSettingsPage(): React.JSX.Element {
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [query, setQuery] = useState<string>("");
	const [scopeFilter, setScopeFilter] = useState<SkillScopeFilter>("all");
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [busyRef, setBusyRef] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pendingInstall, setPendingInstall] = useState<PendingInstall | null>(null);

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
					setErrorMessage(error instanceof Error ? error.message : "Failed to load skills");
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
	}, []);

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
			setErrorMessage(error instanceof Error ? error.message : "Failed to select skill source");
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
			setErrorMessage(error instanceof Error ? error.message : "Failed to install skill");
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
			setErrorMessage(error instanceof Error ? error.message : "Failed to update skill");
		} finally {
			setBusyRef(null);
		}
	}

	function confirmDelete(skill: SkillSummary): void {
		Modal.confirm({
			title: "Delete skill?",
			content: `Delete ${skill.name} from Daedalus Studio. This removes the personal skill files but does not change any Godot project files.`,
			okText: "Delete",
			okButtonProps: { danger: true },
			async onOk(): Promise<void> {
				try {
					setBusyRef(skill.ref);
					setErrorMessage(null);
					const result: SkillListResult = await removeSkill(skill.ref);
					applySkillResult(result, setSkills);
				} catch (error: unknown) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to delete skill");
				} finally {
					setBusyRef(null);
				}
			}
		});
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						Skills
					</Typography.Title>
					<Tag>{customSkills.length}</Tag>
				</div>
				<Space.Compact className={styles.spaceCompact}>
					<Input
						allowClear={true}
						prefix={<Icon name="search" />}
						placeholder="Search skill..."
						className={styles.searchBox}
						value={query}
						onChange={(event: ChangeEvent<HTMLInputElement>): void => setQuery(event.target.value)}
					/>
					<Select
						value={scopeFilter}
						options={scopeOptions}
						className={styles.selectBox}
						onChange={(value: SkillScopeFilter): void => setScopeFilter(value)}
					/>
					<Dropdown
						menu={{
							items: addItems,
							onClick: ({ key }): void => {
								void openInstallDialog(key as SkillInstallKind);
							}
						}}
						trigger={["click"]}
					>
						<Button icon={<Icon name="add" />}>Add</Button>
					</Dropdown>
				</Space.Compact>
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
				{isLoading ? (
					<Spin />
				) : filteredSkills.length === 0 ? (
					<Empty
						image={<Icon name="empty" />}
						description={customSkills.length === 0 ? "No custom skills yet. Ask the agent to create a skill, or install one from ZIP/folder." : "No matching skills"}
					/>
				) : filteredSkills.map((skill: SkillSummary): React.JSX.Element => {
					const isBusy: boolean = busyRef === skill.ref;
					return (
						<div key={skill.ref} className={styles.skillItem}>
							<div className={styles.skillMain}>
								<div className={styles.skillTitleRow}>
									<Typography.Title level={4} className={styles.skillTitle}>{skill.name}</Typography.Title>
									<Tag color={getSourceColor(skill.source)}>{skill.source}</Tag>
									{skill.valid ? <Tag color="success">VALID</Tag> : <Tag color="error">INVALID</Tag>}
									{skill.enabled ? <Tag color="success">ON</Tag> : <Tag>OFF</Tag>}
								</div>
								{skill.description.length > 0 ? (
									<Typography.Text type="secondary" className={styles.skillDescription}>{skill.description}</Typography.Text>
								) : null}
								<Typography.Text className={styles.skillSummary}>{skill.displayPath}</Typography.Text>
								<Typography.Text type="secondary" className={styles.skillMeta}>
									{skill.ref}
									{skill.error !== undefined ? ` · ${skill.error}` : ""}
								</Typography.Text>
							</div>
							<div className={styles.skillActions}>
								<Tooltip title={skill.enabled ? "Disable" : "Enable"}>
									<Switch
										checked={skill.enabled}
										loading={isBusy}
										disabled={!skill.valid || (busyRef !== null && !isBusy)}
										onChange={(checked: boolean): void => {
											void handleSetEnabled(skill, checked);
										}}
									/>
								</Tooltip>
								{skill.removable ? (
									<Button
										type="text"
										danger={true}
										icon={<Icon name="remove" />}
										loading={isBusy}
										disabled={busyRef !== null && !isBusy}
										onClick={(): void => confirmDelete(skill)}
									>
										Delete
									</Button>
								) : null}
							</div>
						</div>
					);
				})}
			</div>

			<Modal
				title={pendingInstall === null ? "Install skill" : `Install from ${pendingInstall.kind === "zip" ? "ZIP" : "folder"}`}
				open={pendingInstall !== null}
				okText="Install"
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
							Project installs require an active workspace. Personal installs are available across workspaces.
						</Typography.Text>
					</div>
				) : null}
			</Modal>
		</section>
	);
}

export default SkillsSettingsPage;
