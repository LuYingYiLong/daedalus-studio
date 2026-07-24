import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
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

type SkillScopeFilter = "all" | Exclude<SkillSource, "builtin">;

type PendingInstall = {
	kind: SkillInstallKind;
	path: string;
	source: SkillInstallSource;
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

function SkillsSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [query, setQuery] = useState<string>("");
	const [scopeFilter, setScopeFilter] = useState<SkillScopeFilter>("all");
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [busyRef, setBusyRef] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pendingInstall, setPendingInstall] = useState<PendingInstall | null>(null);
	const addItems: MenuProps["items"] = useMemo((): MenuProps["items"] => [
		{
			key: "zip",
			label: t("settings.skills.actions.installFromZip"),
			icon: <Icon name="file_zip" />
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

	function confirmDelete(skill: SkillSummary): void {
		Modal.confirm({
			title: t("settings.skills.confirm.delete.title"),
			content: t("settings.skills.confirm.delete.description", { name: skill.name }),
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

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.skills.title")}
					</Typography.Title>
					<Tag>{customSkills.length}</Tag>
				</div>
				<Space.Compact className={styles.spaceCompact}>
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
						<Button icon={<Icon name="add" />}>{t("settings.common.add")}</Button>
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
									{skill.valid ? <Tag color="success">{t("settings.skills.valid")}</Tag> : <Tag color="error">{t("settings.skills.invalid")}</Tag>}
									{skill.enabled ? <Tag color="success">{t("settings.common.on")}</Tag> : <Tag>{t("settings.common.off")}</Tag>}
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
								{skill.removable ? (
									<Button
										type="text"
										danger={true}
										icon={<Icon name="remove" />}
										loading={isBusy}
										disabled={busyRef !== null && !isBusy}
										onClick={(): void => confirmDelete(skill)}
									>
										{t("settings.common.delete")}
									</Button>
								) : null}
							</div>
						</div>
					);
				})}
			</div>

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
		</section>
	);
}

export default SkillsSettingsPage;
