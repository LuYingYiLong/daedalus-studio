import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	App,
	Button,
	Empty,
	Form,
	Input,
	Menu,
	Modal,
	Select,
	Space,
	Spin,
	Switch,
	Tag,
	Tooltip,
	Typography,
} from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	getEnvironmentConfig,
	updateEnvironmentConfig,
	updateEnvironmentTrust,
} from "@/platform/rpc/environment-api";
import { fetchWorkspaces } from "@/platform/rpc/workspace-api";
import type {
	LocalEnvironmentConfig,
	LocalEnvironmentConfigDocument,
	LocalEnvironmentProfile,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import pageMotionStyles from "./SettingsPageMotion.module.css";
import styles from "./DevelopmentEnvironmentSettingsPage.module.css";

type ActionForm = {
	id: string;
	name: string;
	script?: string;
	network: boolean;
};
type ProfileForm = {
	id: string;
	name: string;
	description?: string;
	setupScript?: string;
	setupNetwork: boolean;
	actions: ActionForm[];
};
type EditorForm = {
	defaultEnvironmentId?: string;
	environments: ProfileForm[];
};
type MenuItems = NonNullable<MenuProps["items"]>;

function createProfile(index: number): ProfileForm {
	return {
		id: `environment-${index + 1}`,
		name: `Environment ${index + 1}`,
		actions: [],
		setupNetwork: false,
	};
}

function toForm(config: LocalEnvironmentConfig): EditorForm {
	return {
		defaultEnvironmentId: config.defaultEnvironmentId ?? undefined,
		environments: config.environments.map((profile) => ({
			id: profile.id,
			name: profile.name,
			description: profile.description,
			setupScript: profile.setup?.scripts.default,
			setupNetwork: profile.setup?.network === true,
			actions: profile.actions.map((action) => ({
				id: action.id,
				name: action.name,
				script: action.scripts.default,
				network: action.network === true,
			})),
		})),
	};
}

function toConfig(values: EditorForm): LocalEnvironmentConfig {
	return {
		version: 1,
		defaultEnvironmentId: values.defaultEnvironmentId?.trim() || null,
		environments: values.environments.map(
			(profile): LocalEnvironmentProfile => {
				const setupScript = profile.setupScript?.trim() ?? "";
				return {
					id: profile.id.trim(),
					name: profile.name.trim(),
					description: profile.description?.trim() || undefined,
					setup:
						setupScript === ""
							? undefined
							: {
									scripts: { default: setupScript },
									timeoutSeconds: 600,
									network: profile.setupNetwork,
								},
					actions: profile.actions.map((action) => ({
						id: action.id.trim(),
						name: action.name.trim(),
						scripts: { default: action.script?.trim() ?? "" },
						network: action.network,
					})),
				};
			},
		),
	};
}

function DevelopmentEnvironmentSettingsPage(): React.JSX.Element | null {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [form] = Form.useForm<EditorForm>();
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);
	const [sourceFolderId, setSourceFolderId] = useState<string | null>(null);
	const [document, setDocument] =
		useState<LocalEnvironmentConfigDocument | null>(null);
	const [loadingProjects, setLoadingProjects] = useState(true);
	const [loadingDocument, setLoadingDocument] = useState(false);
	const [saving, setSaving] = useState(false);
	const [editorOpen, setEditorOpen] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const workspace = useMemo(
		() => workspaces.find((candidate) => candidate.id === workspaceId),
		[workspaceId, workspaces],
	);
	const profiles = Form.useWatch("environments", form) ?? [];

	useEffect((): (() => void) => {
		let cancelled = false;
		void fetchWorkspaces()
			.then((result): void => {
				if (cancelled) return;
				setWorkspaces(result.workspaces);
				const first = result.workspaces[0];
				setWorkspaceId(first?.id ?? null);
				setSourceFolderId(first?.primarySourceFolderId ?? null);
			})
			.catch((error: unknown): void => {
				if (!cancelled)
					setErrorMessage(
						error instanceof Error
							? error.message
							: t("settings.environments.errors.load"),
					);
			})
			.finally((): void => {
				if (!cancelled) setLoadingProjects(false);
			});
		return (): void => {
			cancelled = true;
		};
	}, [t]);

	const loadDocument = useCallback(async (): Promise<void> => {
		if (workspaceId === null || sourceFolderId === null) return;
		setLoadingDocument(true);
		try {
			const next = await getEnvironmentConfig(
				workspaceId,
				sourceFolderId,
			);
			setDocument(next);
			form.setFieldsValue(toForm(next.config));
			setErrorMessage(null);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.environments.errors.load"),
			);
		} finally {
			setLoadingDocument(false);
		}
	}, [form, sourceFolderId, t, workspaceId]);

	useEffect((): void => {
		void loadDocument();
	}, [loadDocument]);

	function selectWorkspace(nextWorkspace: WorkspaceConfig): void {
		setWorkspaceId(nextWorkspace.id);
		setSourceFolderId(nextWorkspace.primarySourceFolderId);
		setDocument(null);
	}

	function openEditor(nextWorkspace: WorkspaceConfig): void {
		selectWorkspace(nextWorkspace);
		setEditorOpen(true);
	}

	const menuItems = useMemo(
		(): MenuItems =>
			workspaces.map((candidate) => ({
				key: candidate.id,
				label: (
					<span className={styles.projectMenuItem}>
						<span className={styles.projectText}>
							<span className={styles.projectTitle}>
								{candidate.name}
							</span>
							<span className={styles.projectMeta}>
								{candidate.sourceFolders.find(
									(source) =>
										source.id ===
										candidate.primarySourceFolderId,
								)?.path ?? ""}
							</span>
						</span>
						<Tooltip title={t("settings.environments.editProject")}>
							<Button
								type="text"
								shape="circle"
								aria-label={t(
									"settings.environments.editProject",
								)}
								icon={<Icon name="pencil" />}
								onClick={(
									event: MouseEvent<HTMLElement>,
								): void => {
									event.preventDefault();
									event.stopPropagation();
									openEditor(candidate);
								}}
							/>
						</Tooltip>
					</span>
				),
			})),
		[t, workspaces],
	);

	async function save(): Promise<void> {
		if (document === null) return;
		const values = await form.validateFields();
		setSaving(true);
		try {
			const next = await updateEnvironmentConfig({
				workspaceId: document.workspaceId,
				sourceFolderId: document.sourceFolderId,
				content: JSON.stringify(toConfig(values), null, "\t"),
				expectedRevision: document.revision,
			});
			setDocument(next);
			form.setFieldsValue(toForm(next.config));
			setEditorOpen(false);
			void message.success(t("settings.environments.saved"));
			if (next.profiles.length > 0)
				modal.info({
					title: t("settings.environments.review.title"),
					width: 680,
					content: next.profiles.map((profile) => (
						<div className={styles.reviewItem} key={profile.id}>
							<div className={styles.reviewMeta}>
								<Typography.Text strong>
									{profile.name}
								</Typography.Text>
								<Typography.Text type="secondary">
									{profile.resolvedSetupScript ??
										t("settings.environments.noSetup")}
								</Typography.Text>
							</div>
							<Space.Compact>
								<Button
									onClick={(): void => {
										void updateEnvironmentTrust({
											workspaceId: next.workspaceId,
											sourceFolderId: next.sourceFolderId,
											fingerprint: profile.fingerprint,
											status: "trusted",
										}).then(setDocument);
									}}
								>
									{t("settings.environments.review.trust")}
								</Button>
								{profile.setup?.network === true ? (
									<Button
										type="primary"
										onClick={(): void => {
											void updateEnvironmentTrust({
												workspaceId: next.workspaceId,
												sourceFolderId:
													next.sourceFolderId,
												fingerprint:
													profile.fingerprint,
												status: "network-approved",
											}).then(setDocument);
										}}
									>
										{t(
											"settings.environments.review.trustNetwork",
										)}
									</Button>
								) : null}
							</Space.Compact>
						</div>
					)),
				});
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.environments.errors.save"),
			);
		} finally {
			setSaving(false);
		}
	}

	if (loadingProjects) return null;

	return (
		<section className={`${styles.page} ${pageMotionStyles.enter}`}>
			<header className={styles.header}>
				<Space>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.environments.title")}
					</Typography.Title>
					<Tag>{workspaces.length}</Tag>
				</Space>
			</header>
			{errorMessage === null ? null : (
				<Typography.Text type="danger" className={styles.errorText}>
					{errorMessage}
				</Typography.Text>
			)}
			<div className={styles.menuScroller}>
				{workspaces.length === 0 ? (
					<Empty description={t("settings.environments.empty")} />
				) : (
					<Menu
						className={styles.projectMenu}
						selectable={false}
						inlineIndent={8}
						mode="inline"
						items={menuItems}
						onClick={({ key }): void => {
							const nextWorkspace = workspaces.find(
								(candidate) => candidate.id === key,
							);
							if (nextWorkspace !== undefined)
								selectWorkspace(nextWorkspace);
						}}
					/>
				)}
			</div>
			<Modal
				title={t("settings.environments.editorTitle", {
					workspace: workspace?.name ?? "",
				})}
				open={editorOpen}
				width={760}
				confirmLoading={saving}
				onCancel={(): void => setEditorOpen(false)}
				onOk={(): void => {
					void save();
				}}
				mask={{ closable: false }}
				className={styles.modal}
			>
				{loadingDocument || document === null ? (
					<div className={styles.modalLoading}>
						<Spin />
					</div>
				) : (
					<Form form={form} layout="vertical" preserve={false}>
						<Form.Item
							label={t("settings.environments.sourceFolder")}
						>
							<Select
								value={sourceFolderId ?? undefined}
								options={(workspace?.sourceFolders ?? []).map(
									(source) => ({
										value: source.id,
										label: source.path,
									}),
								)}
								onChange={(value: string): void => {
									setSourceFolderId(value);
									setDocument(null);
								}}
							/>
						</Form.Item>
						<Form.Item
							name="defaultEnvironmentId"
							label={t(
								"settings.environments.defaultEnvironment",
							)}
						>
							<Select
								allowClear
								options={profiles.map((profile) => ({
									value: profile?.id,
									label: profile?.name,
								}))}
							/>
						</Form.Item>
						<Form.List name="environments">
							{(fields, { add, remove }) => (
								<div className={styles.profileList}>
									{fields.map((field) => (
										<div
											className={styles.profileEditor}
											key={field.key}
										>
											<div
												className={styles.profileHeader}
											>
												<Typography.Text strong>
													{t(
														"settings.environments.profiles",
													)}
												</Typography.Text>
												<Button
													danger
													type="text"
													shape="circle"
													aria-label={t(
														"settings.common.delete",
													)}
													icon={
														<Icon name="remove" />
													}
													onClick={(): void =>
														remove(field.name)
													}
												/>
											</div>
											<div
												className={styles.profileFields}
											>
												<Form.Item
													name={[field.name, "name"]}
													rules={[
														{
															required: true,
															whitespace: true,
														},
													]}
												>
													<Input
														placeholder={t(
															"settings.environments.profileName",
														)}
													/>
												</Form.Item>
												<Form.Item
													name={[field.name, "id"]}
													rules={[
														{
															required: true,
															whitespace: true,
														},
													]}
												>
													<Input placeholder="ID" />
												</Form.Item>
												<Form.Item
													className={styles.fullWidth}
													name={[
														field.name,
														"description",
													]}
												>
													<Input
														placeholder={t(
															"settings.environments.profileDescription",
														)}
													/>
												</Form.Item>
												<Form.Item
													className={styles.fullWidth}
													name={[
														field.name,
														"setupScript",
													]}
												>
													<Input.TextArea
														className={
															styles.script
														}
														autoSize={{
															minRows: 2,
															maxRows: 6,
														}}
														placeholder={t(
															"settings.environments.setupScript",
														)}
													/>
												</Form.Item>
												<Form.Item
													className={
														styles.networkControl
													}
													name={[
														field.name,
														"setupNetwork",
													]}
													valuePropName="checked"
												>
													<Switch
														aria-label={t(
															"settings.environments.network",
														)}
													/>
												</Form.Item>
											</div>
											<Typography.Text
												type="secondary"
												className={styles.fieldHint}
											>
												{t(
													"settings.environments.network",
												)}
											</Typography.Text>
											<Form.List
												name={[field.name, "actions"]}
											>
												{(
													actionFields,
													actionOperation,
												) => (
													<div
														className={
															styles.actionList
														}
													>
														<Typography.Text strong>
															{t(
																"settings.environments.actions",
															)}
														</Typography.Text>
														{actionFields.map(
															(actionField) => (
																<div
																	className={
																		styles.actionEditor
																	}
																	key={
																		actionField.key
																	}
																>
																	<Form.Item
																		name={[
																			actionField.name,
																			"name",
																		]}
																		rules={[
																			{
																				required: true,
																				whitespace: true,
																			},
																		]}
																	>
																		<Input
																			placeholder={t(
																				"settings.environments.actionName",
																			)}
																		/>
																	</Form.Item>
																	<Form.Item
																		name={[
																			actionField.name,
																			"id",
																		]}
																		rules={[
																			{
																				required: true,
																				whitespace: true,
																			},
																		]}
																	>
																		<Input placeholder="ID" />
																	</Form.Item>
																	<Form.Item
																		name={[
																			actionField.name,
																			"network",
																		]}
																		valuePropName="checked"
																	>
																		<Switch
																			aria-label={t(
																				"settings.environments.actionNetwork",
																			)}
																		/>
																	</Form.Item>
																	<Button
																		danger
																		type="text"
																		shape="circle"
																		aria-label={t(
																			"settings.common.delete",
																		)}
																		icon={
																			<Icon name="remove" />
																		}
																		onClick={(): void =>
																			actionOperation.remove(
																				actionField.name,
																			)
																		}
																	/>
																	<Form.Item
																		className={
																			styles.actionScript
																		}
																		name={[
																			actionField.name,
																			"script",
																		]}
																	>
																		<Input.TextArea
																			className={
																				styles.script
																			}
																			autoSize={{
																				minRows: 2,
																				maxRows: 6,
																			}}
																			placeholder={t(
																				"settings.environments.actionScript",
																			)}
																		/>
																	</Form.Item>
																</div>
															),
														)}
														<Button
															type="dashed"
															icon={
																<Icon name="add" />
															}
															onClick={(): void =>
																actionOperation.add(
																	{
																		id: `action-${actionFields.length + 1}`,
																		name: `Action ${actionFields.length + 1}`,
																		script: "npm test",
																		network: false,
																	},
																)
															}
														>
															{t(
																"settings.environments.addAction",
															)}
														</Button>
													</div>
												)}
											</Form.List>
										</div>
									))}
									<Button
										type="dashed"
										icon={<Icon name="add" />}
										onClick={(): void =>
											add(createProfile(fields.length))
										}
									>
										{t("settings.environments.add")}
									</Button>
								</div>
							)}
						</Form.List>
					</Form>
				)}
			</Modal>
		</section>
	);
}

export default DevelopmentEnvironmentSettingsPage;
