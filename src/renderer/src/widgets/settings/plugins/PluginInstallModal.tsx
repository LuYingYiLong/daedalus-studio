import { Alert, Button, Form, Input, Modal, Select, Space } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PluginSource } from "@/platform/rpc/plugin-api";
import styles from "./plugins.module.css";
import type { InstallSourceType } from "./plugin-types";

export function PluginInstallModal({
	open,
	loading,
	onCancel,
	onSubmit,
	title,
	submitLabel,
}: {
	open: boolean;
	loading: boolean;
	onCancel: () => void;
	onSubmit: (source: PluginSource) => Promise<void>;
	title?: string;
	submitLabel?: string;
}): React.JSX.Element {
	const { t } = useTranslation();
	const [sourceType, setSourceType] = useState<InstallSourceType>("local");
	const [form] = Form.useForm<Record<string, string>>();
	async function browsePath(): Promise<void> {
		const path =
			sourceType === "local"
				? await window.electronAPI.pluginFs.pickDirectory()
				: sourceType === "tarball"
					? await window.electronAPI.pluginFs.pickTarball()
					: await window.electronAPI.sessionFs.pickImportSource({
						dialogTitle: t("settings.plugins.actions.chooseFile"),
						buttonLabel: t("settings.plugins.actions.choose"),
					});
		if (path !== null) form.setFieldValue("path", path);
	}
	const submit = async (): Promise<void> => {
		const values = await form.validateFields();
		const source: PluginSource =
			sourceType === "local"
				? { type: "local", path: values.path.trim() }
				: sourceType === "tarball"
					? {
							type: "tarball",
							path: values.path.trim(),
							sha256: values.sha256.trim(),
						}
					: sourceType === "npm"
						? {
								type: "npm",
								packageName: values.packageName.trim(),
								version: values.version.trim(),
							}
						: {
								type: "git",
								url: values.url.trim(),
								commit: values.commit.trim(),
							};
		await onSubmit(source);
	};
	return (
		<Modal
			title={title ?? t("settings.plugins.install.title")}
			open={open}
			okText={submitLabel ?? t("settings.plugins.actions.install")}
			confirmLoading={loading}
			onCancel={onCancel}
			onOk={(): void => {
				void submit();
			}}
		>
			<Form form={form} layout="vertical">
				<Form.Item label={t("settings.plugins.install.sourceType")}>
					<Select
						value={sourceType}
						onChange={(value: InstallSourceType): void => {
							setSourceType(value);
							form.resetFields();
						}}
						options={["local", "tarball", "npm", "git"].map(
							(value) => ({
								value,
								label: t(`settings.plugins.install.${value}`),
							}),
						)}
					/>
				</Form.Item>
				{sourceType === "local" || sourceType === "tarball" ? (
					<Form.Item
						label={t("settings.plugins.install.path")}
						required
					>
						<Space.Compact className={styles.fullWidth}>
							<Form.Item
								name="path"
								noStyle
								rules={[{ required: true }]}
							>
								<Input
									placeholder={t(
										"settings.plugins.install.pathPlaceholder",
									)}
								/>
							</Form.Item>
							<Button
								onClick={(): void => {
									void browsePath();
								}}
							>
								{t("settings.plugins.actions.choose")}
							</Button>
						</Space.Compact>
					</Form.Item>
				) : null}
				{sourceType === "tarball" ? (
					<Form.Item
						name="sha256"
						label={t("settings.plugins.install.sha256")}
						rules={[{ required: true, len: 64 }]}
					>
						<Input />
					</Form.Item>
				) : null}
				{sourceType === "npm" ? (
					<>
						<Form.Item
							name="packageName"
							label={t("settings.plugins.install.packageName")}
							rules={[{ required: true }]}
						>
							<Input placeholder="example-plugin" />
						</Form.Item>
						<Form.Item
							name="version"
							label={t("settings.plugins.install.version")}
							rules={[{ required: true }]}
						>
							<Input placeholder="1.0.0" />
						</Form.Item>
					</>
				) : null}
				{sourceType === "git" ? (
					<>
						<Form.Item
							name="url"
							label={t("settings.plugins.install.url")}
							rules={[{ required: true }]}
						>
							<Input placeholder="https://github.com/example/plugin.git" />
						</Form.Item>
						<Form.Item
							name="commit"
							label={t("settings.plugins.install.commit")}
							rules={[{ required: true, min: 7 }]}
						>
							<Input placeholder="40-character commit SHA" />
						</Form.Item>
					</>
				) : null}
				<Alert
					type="info"
					showIcon
					title={t("settings.plugins.install.noExecution")}
				/>
			</Form>
		</Modal>
	);
}
