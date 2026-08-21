import { Button, Form, Input, Modal, Select, Space, Switch } from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type {
	HarnessConfigDraft,
	HarnessConfigResult,
} from "@/platform/rpc/plugin-api";
import { HarnessRuntimeSettings } from "./HarnessRuntimeSettings";
import styles from "./plugins.module.css";

type HarnessFormValues = {
	enabled: boolean;
	launchMode: "installed" | "source";
	executablePath?: string;
	sourceRoot?: string;
};

export function HarnessRuntimeModal({
	open,
	value,
	loading,
	onCancel,
	onDetect,
	onSave,
}: {
	open: boolean;
	value: HarnessConfigResult | null;
	loading: boolean;
	onCancel: () => void;
	onDetect: (draft: HarnessConfigDraft) => Promise<void>;
	onSave: (values: HarnessFormValues) => Promise<void>;
}): React.JSX.Element {
	const { t } = useTranslation();
	const [form] = Form.useForm<HarnessFormValues>();
	const launchMode = Form.useWatch("launchMode", form) ?? "installed";
	useEffect((): void => {
		if (!open || value === null) return;
		form.setFieldsValue({
			enabled: value.config.enabled,
			launchMode: value.config.launchMode,
			executablePath: value.config.executablePath ?? "",
			sourceRoot: value.config.sourceRoot ?? "",
		});
	}, [form, open, value]);
	async function browse(): Promise<void> {
		const path =
			launchMode === "source"
				? await window.electronAPI.workspaceFs.pickWorkspaceDirectory()
				: await window.electronAPI.sessionFs.pickImportSource({
						dialogTitle: t(
							"settings.plugins.harness.chooseExecutable",
						),
						buttonLabel: t("settings.plugins.actions.choose"),
					});
		if (path !== null)
			form.setFieldValue(
				launchMode === "source" ? "sourceRoot" : "executablePath",
				path,
			);
	}
	return (
		<Modal
			open={open}
			title={t("settings.plugins.harness.title")}
			okText={t("settings.common.save")}
			cancelText={t("settings.common.cancel")}
			confirmLoading={loading}
			onCancel={onCancel}
			onOk={(): void => {
				void form.validateFields().then(onSave);
			}}
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{
					enabled: false,
					launchMode: "installed",
					executablePath: "",
					sourceRoot: "",
				}}
			>
				<Form.Item
					name="enabled"
					label={t("settings.plugins.harness.enabled")}
					valuePropName="checked"
				>
					<Switch />
				</Form.Item>
				<Form.Item
					name="launchMode"
					label={t("settings.plugins.harness.launchMode")}
				>
					<Select
						options={[
							{
								value: "installed",
								label: t("settings.plugins.harness.installed"),
							},
							{
								value: "source",
								label: t("settings.plugins.harness.source"),
							},
						]}
					/>
				</Form.Item>
				<Form.Item
					label={t(
						launchMode === "source"
							? "settings.plugins.harness.sourceRoot"
							: "settings.plugins.harness.executablePath",
					)}
				>
					<Space.Compact className={styles.fullWidth}>
						<Form.Item
							noStyle
							name={
								launchMode === "source"
									? "sourceRoot"
									: "executablePath"
							}
							rules={[
								{
									required: true,
									message: t(
										"settings.plugins.harness.pathRequired",
									),
								},
							]}
						>
							<Input />
						</Form.Item>
						<Button
							onClick={(): void => {
								void browse();
							}}
						>
							{t("settings.plugins.actions.choose")}
						</Button>
					</Space.Compact>
				</Form.Item>
				<Space orientation="vertical" className={styles.fullWidth}>
					<Button
						block
						loading={loading}
						onClick={(): void => {
							const draft = form.getFieldsValue();
							void onDetect({
								enabled: draft.enabled === true,
								launchMode: draft.launchMode,
								executablePath:
									draft.executablePath?.trim() || null,
								sourceRoot: draft.sourceRoot?.trim() || null,
							});
						}}
					>
						{t("settings.plugins.harness.detect")}
					</Button>
					<HarnessRuntimeSettings value={value} />
				</Space>
			</Form>
		</Modal>
	);
}
