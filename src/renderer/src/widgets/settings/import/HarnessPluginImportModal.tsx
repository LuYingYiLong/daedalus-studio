import { Alert, Button, Form, Input, Modal, Select, Space } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PluginSource } from "@/platform/rpc/plugin-api";
import styles from "./import-settings.module.css";
import type { InstallSourceType } from "../plugins/plugin-types";

export function HarnessPluginImportModal({
	open,
	loading,
	onCancel,
	onScan,
}: {
	open: boolean;
	loading: boolean;
	onCancel: () => void;
	onScan: (source: PluginSource) => Promise<void>;
}): React.JSX.Element {
	const { t } = useTranslation();
	const [sourceType, setSourceType] = useState<InstallSourceType>("local");
	const [form] = Form.useForm<Record<string, string>>();

	async function browsePath(): Promise<void> {
		const path: string | null = sourceType === "local"
			? await window.electronAPI.pluginFs.pickDirectory()
			: await window.electronAPI.pluginFs.pickTarball();
		if (path !== null) form.setFieldValue("path", path);
	}

	async function submit(): Promise<void> {
		const values = await form.validateFields();
		const source: PluginSource = sourceType === "local"
			? { type: "local", path: values.path.trim() }
			: sourceType === "tarball"
				? { type: "tarball", path: values.path.trim(), sha256: values.sha256.trim() }
				: sourceType === "npm"
					? { type: "npm", packageName: values.packageName.trim(), version: values.version.trim() }
					: { type: "git", url: values.url.trim(), commit: values.commit.trim() };
		await onScan(source);
	}

	return (
		<Modal
			open={open}
			title={t("settings.import.plugin.modalTitle")}
			okText={t("settings.import.plugin.scan")}
			confirmLoading={loading}
			onCancel={onCancel}
			onOk={(): void => { void submit(); }}
		>
			<Form form={form} layout="vertical">
				<Form.Item label={t("settings.plugins.install.sourceType")}>
					<Select
						value={sourceType}
						onChange={(value: InstallSourceType): void => { setSourceType(value); form.resetFields(); }}
						options={(["local", "tarball", "npm", "git"] as const).map((value) => ({ value, label: t(`settings.plugins.install.${value}`) }))}
					/>
				</Form.Item>
				{sourceType === "local" || sourceType === "tarball" ? (
					<Form.Item label={t("settings.plugins.install.path")} required>
						<Space.Compact className={styles.fullWidth}>
							<Form.Item name="path" noStyle rules={[{ required: true, message: t("settings.import.plugin.pathRequired") }]}>
								<Input placeholder={t("settings.plugins.install.pathPlaceholder")} />
							</Form.Item>
							<Button onClick={(): void => { void browsePath(); }}>{t("settings.plugins.actions.choose")}</Button>
						</Space.Compact>
					</Form.Item>
				) : null}
				{sourceType === "tarball" ? <Form.Item name="sha256" label={t("settings.plugins.install.sha256")} rules={[{ required: true, len: 64 }]}><Input /></Form.Item> : null}
				{sourceType === "npm" ? <>
					<Form.Item name="packageName" label={t("settings.plugins.install.packageName")} rules={[{ required: true }]}><Input placeholder="example-plugin" /></Form.Item>
					<Form.Item name="version" label={t("settings.plugins.install.version")} rules={[{ required: true }]}><Input placeholder="1.0.0" /></Form.Item>
				</> : null}
				{sourceType === "git" ? <>
					<Form.Item name="url" label={t("settings.plugins.install.url")} rules={[{ required: true }]}><Input placeholder="https://github.com/example/plugin.git" /></Form.Item>
					<Form.Item name="commit" label={t("settings.plugins.install.commit")} rules={[{ required: true, min: 7 }]}><Input placeholder="40-character commit SHA" /></Form.Item>
				</> : null}
				<Alert type="info" showIcon title={t("settings.import.plugin.noExecution")} />
			</Form>
		</Modal>
	);
}
