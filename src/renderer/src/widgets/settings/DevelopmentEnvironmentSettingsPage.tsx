import {
	App,
	Button,
	Empty,
	Form,
	Input,
	Modal,
	Select,
	Space,
	Spin,
	Switch,
	Tooltip,
	Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import pageMotionStyles from "./SettingsPageMotion.module.css";
import styles from "./WorktreeSettings.module.css";

type ProfileFormValues = {
	id: string;
	name: string;
	description?: string;
	setupScript?: string;
	setupNetwork: boolean;
	actions: Array<{
		id: string;
		name: string;
		script?: string;
		network: boolean;
	}>;
};

function createProfile(index: number): LocalEnvironmentProfile {
	return {
		id: `environment-${index + 1}`,
		name: `Environment ${index + 1}`,
		actions: [],
	};
}

function profileToFormValues(
	profile: LocalEnvironmentProfile,
): ProfileFormValues {
	return {
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
	};
}

function formValuesToProfile(
	values: ProfileFormValues,
	previous: LocalEnvironmentProfile | undefined,
): LocalEnvironmentProfile {
	const setupScript: string = values.setupScript?.trim() ?? "";
	return {
		id: values.id.trim(),
		name: values.name.trim(),
		description: values.description?.trim() || undefined,
		setup:
			setupScript === ""
				? undefined
				: {
						scripts: { default: setupScript },
						timeoutSeconds: previous?.setup?.timeoutSeconds ?? 600,
						network: values.setupNetwork,
					},
		actions: values.actions.map((action) => ({
			id: action.id.trim(),
			name: action.name.trim(),
			scripts: { default: action.script?.trim() ?? "" },
			network: action.network,
		})),
	};
}

function DevelopmentEnvironmentSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [form] = Form.useForm<ProfileFormValues>();
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);
	const [sourceFolderId, setSourceFolderId] = useState<string | null>(null);
	const [document, setDocument] =
		useState<LocalEnvironmentConfigDocument | null>(null);
	const [config, setConfig] = useState<LocalEnvironmentConfig>({
		version: 1,
		defaultEnvironmentId: null,
		environments: [],
	});
	const [loading, setLoading] = useState<boolean>(true);
	const [saving, setSaving] = useState<boolean>(false);
	const [editingProfileIndex, setEditingProfileIndex] = useState<
		number | null
	>(null);
	const [profileEditorOpen, setProfileEditorOpen] = useState<boolean>(false);
	const workspace = useMemo(
		(): WorkspaceConfig | undefined =>
			workspaces.find((item): boolean => item.id === workspaceId),
		[workspaceId, workspaces],
	);
	const selectedSource = useMemo(
		() =>
			workspace?.sourceFolders.find(
				(source): boolean => source.id === sourceFolderId,
			),
		[sourceFolderId, workspace?.sourceFolders],
	);

	useEffect((): void => {
		void fetchWorkspaces()
			.then((result): void => {
				setWorkspaces(result.workspaces);
				const first = result.workspaces[0];
				setWorkspaceId(first?.id ?? null);
				setSourceFolderId(first?.primarySourceFolderId ?? null);
			})
			.catch((error: unknown): void => {
				void message.error(
					error instanceof Error
						? error.message
						: t("settings.environments.errors.load"),
				);
			})
			.finally((): void => setLoading(false));
	}, [message, t]);

	const loadDocument = useCallback(async (): Promise<void> => {
		if (workspaceId === null || sourceFolderId === null) return;
		setLoading(true);
		try {
			const next = await getEnvironmentConfig(
				workspaceId,
				sourceFolderId,
			);
			setDocument(next);
			setConfig(structuredClone(next.config));
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.environments.errors.load"),
			);
		} finally {
			setLoading(false);
		}
	}, [message, sourceFolderId, t, workspaceId]);

	useEffect((): void => {
		void loadDocument();
	}, [loadDocument]);

	function closeProfileEditor(): void {
		setProfileEditorOpen(false);
		setEditingProfileIndex(null);
		form.resetFields();
	}

	function openProfileEditor(index: number | null): void {
		const profile: LocalEnvironmentProfile =
			index === null
				? createProfile(config.environments.length)
				: config.environments[index];
		form.setFieldsValue(profileToFormValues(profile));
		setEditingProfileIndex(index);
		setProfileEditorOpen(true);
	}

	async function saveProfileEditor(): Promise<void> {
		const values: ProfileFormValues = await form.validateFields();
		const previous =
			editingProfileIndex === null
				? undefined
				: config.environments[editingProfileIndex];
		const profile = formValuesToProfile(values, previous);
		setConfig(
			(current): LocalEnvironmentConfig => ({
				...current,
				environments:
					editingProfileIndex === null
						? [...current.environments, profile]
						: current.environments.map((candidate, index) =>
								index === editingProfileIndex
									? profile
									: candidate,
							),
			}),
		);
		closeProfileEditor();
	}

	function removeProfile(index: number): void {
		setConfig((current): LocalEnvironmentConfig => {
			const profileId: string = current.environments[index].id;
			return {
				...current,
				defaultEnvironmentId:
					current.defaultEnvironmentId === profileId
						? null
						: current.defaultEnvironmentId,
				environments: current.environments.filter(
					(_, profileIndex): boolean => profileIndex !== index,
				),
			};
		});
	}

	async function save(): Promise<void> {
		if (document === null) return;
		setSaving(true);
		try {
			const next = await updateEnvironmentConfig({
				workspaceId: document.workspaceId,
				sourceFolderId: document.sourceFolderId,
				content: JSON.stringify(config, null, "\t"),
				expectedRevision: document.revision,
			});
			setDocument(next);
			setConfig(structuredClone(next.config));
			if (next.profiles.length > 0) {
				modal.info({
					title: t("settings.environments.review.title"),
					width: 680,
					content: (
						<div className={styles.reviewList}>
							{next.profiles.map((profile) => (
								<div
									className={styles.reviewItem}
									key={profile.id}
								>
									<div className={styles.reviewMeta}>
										<Typography.Text strong>
											{profile.name}
										</Typography.Text>
										<Typography.Text code>
											{profile.resolvedSetupScript ??
												t(
													"settings.environments.noSetup",
												)}
										</Typography.Text>
										<Typography.Text type="secondary">
											{profile.setup?.network === true
												? t(
														"settings.environments.review.networkEnabled",
													)
												: t(
														"settings.environments.review.networkDisabled",
													)}
										</Typography.Text>
									</div>
									<Space.Compact>
										<Button
											onClick={(): void => {
												void updateEnvironmentTrust({
													workspaceId:
														next.workspaceId,
													sourceFolderId:
														next.sourceFolderId,
													fingerprint:
														profile.fingerprint,
													status: "trusted",
												}).then(setDocument);
											}}
										>
											{t(
												"settings.environments.review.trust",
											)}
										</Button>
										{profile.setup?.network === true ? (
											<Button
												type="primary"
												onClick={(): void => {
													void updateEnvironmentTrust(
														{
															workspaceId:
																next.workspaceId,
															sourceFolderId:
																next.sourceFolderId,
															fingerprint:
																profile.fingerprint,
															status: "network-approved",
														},
													).then(setDocument);
												}}
											>
												{t(
													"settings.environments.review.trustNetwork",
												)}
											</Button>
										) : null}
									</Space.Compact>
								</div>
							))}
						</div>
					),
				});
			}
			void message.success(t("settings.environments.saved"));
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

	return (
		<section className={`${styles.page} ${pageMotionStyles.enter}`}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>
					{t("settings.environments.title")}
				</Typography.Title>
			</header>
			<div className={styles.content}>
				<SettingsList title={t("settings.environments.source")}>
					<SettingsItem
						title={
							workspace?.name ?? t("settings.environments.source")
						}
						description={selectedSource?.path ?? ""}
					>
						<Space.Compact className={styles.sourceControls}>
							<Select
								value={workspaceId ?? undefined}
								options={workspaces.map((item) => ({
									value: item.id,
									label: item.name,
								}))}
								onChange={(value: string): void => {
									const next = workspaces.find(
										(item): boolean => item.id === value,
									);
									setWorkspaceId(value);
									setSourceFolderId(
										next?.primarySourceFolderId ?? null,
									);
								}}
							/>
							<Select
								value={sourceFolderId ?? undefined}
								options={(workspace?.sourceFolders ?? []).map(
									(source) => ({
										value: source.id,
										label: source.path,
									}),
								)}
								onChange={setSourceFolderId}
							/>
						</Space.Compact>
					</SettingsItem>
				</SettingsList>

				{loading ? (
					<div className={styles.loading}>
						<Spin />
					</div>
				) : document === null ? (
					<Empty />
				) : (
					<SettingsList title={t("settings.environments.profiles")}>
						<SettingsItem
							title={t(
								"settings.environments.defaultEnvironment",
							)}
							description={t(
								"settings.environments.defaultEnvironment",
							)}
						>
							<Select
								className={styles.selectControl}
								allowClear
								value={config.defaultEnvironmentId ?? undefined}
								placeholder={t(
									"settings.environments.defaultEnvironment",
								)}
								options={config.environments.map((profile) => ({
									value: profile.id,
									label: profile.name,
								}))}
								onChange={(value: string | undefined): void =>
									setConfig(
										(current): LocalEnvironmentConfig => ({
											...current,
											defaultEnvironmentId: value ?? null,
										}),
									)
								}
							/>
						</SettingsItem>
						{config.environments.length === 0 ? (
							<div className={styles.emptyState}>
								<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
							</div>
						) : (
							config.environments.map((profile, index) => (
								<SettingsItem
									key={profile.id}
									title={profile.name}
									description={
										profile.description ||
										(profile.setup?.scripts.default ??
											t("settings.environments.noSetup"))
									}
								>
									<Space.Compact>
										<Tooltip
											title={t("settings.common.edit")}
										>
											<Button
												aria-label={t(
													"settings.common.edit",
												)}
												icon={<Icon name="pencil" />}
												onClick={(): void =>
													openProfileEditor(index)
												}
											/>
										</Tooltip>
										<Tooltip
											title={t("settings.common.delete")}
										>
											<Button
												danger
												aria-label={t(
													"settings.common.delete",
												)}
												icon={<Icon name="remove" />}
												onClick={(): void =>
													removeProfile(index)
												}
											/>
										</Tooltip>
									</Space.Compact>
								</SettingsItem>
							))
						)}
						<SettingsItem
							title={t("settings.environments.add")}
							description={t("settings.environments.description")}
						>
							<Button
								icon={<Icon name="add" />}
								onClick={(): void => openProfileEditor(null)}
							>
								{t("settings.environments.add")}
							</Button>
						</SettingsItem>
					</SettingsList>
				)}

				{document === null ? null : (
					<SettingsList>
						<SettingsItem
							title={t("settings.common.save")}
							description={document.path}
						>
							<Button
								type="primary"
								loading={saving}
								onClick={(): void => {
									void save();
								}}
							>
								{t("settings.common.save")}
							</Button>
						</SettingsItem>
					</SettingsList>
				)}
			</div>

			<Modal
				title={t(
					editingProfileIndex === null
						? "settings.environments.add"
						: "settings.common.edit",
				)}
				open={profileEditorOpen}
				onCancel={closeProfileEditor}
				onOk={(): void => {
					void saveProfileEditor();
				}}
				mask={{ closable: false }}
			>
				<Form form={form} layout="vertical" preserve={false}>
					<Form.Item
						name="name"
						label={t("settings.environments.profiles")}
						rules={[{ required: true, whitespace: true }]}
					>
						<Input />
					</Form.Item>
					<Form.Item
						name="id"
						label="ID"
						rules={[{ required: true, whitespace: true }]}
					>
						<Input />
					</Form.Item>
					<Form.Item
						name="description"
						label={t("settings.environments.profileDescription")}
					>
						<Input />
					</Form.Item>
					<Form.Item
						name="setupScript"
						label={t("settings.environments.setupScript")}
					>
						<Input.TextArea
							className={styles.script}
							autoSize={{ minRows: 3, maxRows: 8 }}
						/>
					</Form.Item>
					<Form.Item
						name="setupNetwork"
						label={t("settings.environments.network")}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Typography.Title
						level={5}
						className={styles.modalSectionTitle}
					>
						{t("settings.environments.actions")}
					</Typography.Title>
					<Form.List name="actions">
						{(fields, { add, remove }) => (
							<div className={styles.actionList}>
								{fields.map((field) => (
									<div
										className={styles.actionEditor}
										key={field.key}
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
													"settings.environments.actionName",
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
											name={[field.name, "network"]}
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
											aria-label={t(
												"settings.common.delete",
											)}
											icon={<Icon name="remove" />}
											onClick={(): void =>
												remove(field.name)
											}
										/>
										<Form.Item
											className={styles.actionScript}
											name={[field.name, "script"]}
										>
											<Input.TextArea
												className={styles.script}
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
								))}
								<Button
									type="dashed"
									icon={<Icon name="add" />}
									onClick={(): void =>
										add({
											id: `action-${fields.length + 1}`,
											name: `Action ${fields.length + 1}`,
											script: "npm test",
											network: false,
										})
									}
								>
									{t("settings.environments.addAction")}
								</Button>
							</div>
						)}
					</Form.List>
				</Form>
			</Modal>
		</section>
	);
}

export default DevelopmentEnvironmentSettingsPage;
