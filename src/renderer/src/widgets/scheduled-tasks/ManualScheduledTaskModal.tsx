import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Alert,
	DatePicker,
	Form,
	Input,
	InputNumber,
	Modal,
	Radio,
	Segmented,
	Select,
	Spin,
} from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { fetchProviderModelSelection } from "@/platform/rpc/provider-api";
import { fetchSessions } from "@/platform/rpc/session-api";
import { fetchWorkspaces } from "@/platform/rpc/workspace-api";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import type { ManualScheduledTaskCreateInput } from "../../../../contracts/scheduled-tasks";
import { buildManualSchedule } from "./manual-schedule";
import type {
	ManualScheduledTaskFormValues,
	ManualScheduledTaskModelOption,
} from "./manual-scheduled-task-types";
import styles from "./ManualScheduledTaskModal.module.css";

type Props = {
	open: boolean;
	defaultWorkspaceId: string | null;
	defaultProviderId: string | null;
	defaultModelId: string | null;
	defaultReasoningEffort: string | null;
	onCancel: () => void;
	onCreated: () => void | Promise<void>;
};

const EMPTY_SESSION_TITLE_PATTERN: RegExp =
	/^(?:new session|new \.\.\.|新会话|新建会话)$/iu;

function modelRef(providerId: string, modelId: string): string {
	return JSON.stringify([providerId, modelId]);
}

function readModelRef(value: string): [string, string] {
	const parsed: unknown = JSON.parse(value);
	if (
		!Array.isArray(parsed) ||
		typeof parsed[0] !== "string" ||
		typeof parsed[1] !== "string"
	) {
		throw new Error("scheduled_task_model_invalid");
	}
	return [parsed[0], parsed[1]];
}

function initialAnchor(): dayjs.Dayjs {
	return dayjs().add(1, "hour").second(0).millisecond(0);
}

export default function ManualScheduledTaskModal({
	open,
	defaultWorkspaceId,
	defaultProviderId,
	defaultModelId,
	defaultReasoningEffort,
	onCancel,
	onCreated,
}: Props): React.JSX.Element {
	const { t, i18n } = useTranslation();
	const [form] = Form.useForm<ManualScheduledTaskFormValues>();
	const [loading, setLoading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [sessions, setSessions] = useState<SessionMetadata[]>([]);
	const [models, setModels] = useState<ManualScheduledTaskModelOption[]>([]);
	const targetKind = Form.useWatch("targetKind", form) ?? "new_session";
	const selectedModelRef = Form.useWatch("modelRef", form);
	const repeat = Form.useWatch("repeat", form) ?? "once";
	const customUnit = Form.useWatch("customUnit", form) ?? "day";

	const load = useCallback(async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			const [workspaceResult, sessionResult, selection] =
				await Promise.all([
					fetchWorkspaces(),
					fetchSessions(),
					fetchProviderModelSelection(),
				]);
			const nextModels: ManualScheduledTaskModelOption[] =
				selection.providers
					.filter(
						(provider): boolean =>
							provider.configured &&
							provider.enabled !== false &&
							provider.ready === true,
					)
					.flatMap((provider): ManualScheduledTaskModelOption[] =>
						provider.models.map((model) => ({
							value: modelRef(provider.provider, model.id),
							providerId: provider.provider,
							providerName: provider.displayName,
							modelId: model.id,
							modelName: model.displayName,
							reasoningEfforts:
								model.capabilities.reasoningEfforts ?? [],
						})),
					);
			setWorkspaces(workspaceResult.workspaces);
			setSessions(
				sessionResult.sessions.filter(
					(session): boolean =>
						session.archivedAt === undefined &&
						(!session.temporary ||
							!EMPTY_SESSION_TITLE_PATTERN.test(
								session.title.trim(),
							)),
				),
			);
			setModels(nextModels);
			const preferredRef = nextModels.some(
				(model): boolean =>
					model.providerId === defaultProviderId &&
					model.modelId === defaultModelId,
			)
				? modelRef(defaultProviderId!, defaultModelId!)
				: nextModels.some(
							(model): boolean =>
								model.providerId ===
									selection.activeModel.providerId &&
								model.modelId === selection.activeModel.modelId,
					  )
					? modelRef(
							selection.activeModel.providerId,
							selection.activeModel.modelId,
						)
					: (nextModels[0]?.value ?? "");
			form.setFieldsValue({
				workspaceId: defaultWorkspaceId,
				modelRef: preferredRef,
				reasoningEffort: defaultReasoningEffort ?? undefined,
			});
		} catch (loadError: unknown) {
			setError(
				loadError instanceof Error
					? loadError.message
					: String(loadError),
			);
		} finally {
			setLoading(false);
		}
	}, [
		defaultModelId,
		defaultProviderId,
		defaultReasoningEffort,
		defaultWorkspaceId,
		form,
	]);

	useEffect((): void => {
		if (!open) return;
		form.setFieldsValue({
			kind: "agent",
			targetKind: "new_session",
			repeat: "once",
			anchor: initialAnchor(),
			customUnit: "day",
			interval: 1,
			weekdays: [1],
			notificationPolicy: "important_updates",
		});
		void load();
	}, [form, load, open]);

	const selectedModel = useMemo(
		(): ManualScheduledTaskModelOption | undefined =>
			models.find((model): boolean => model.value === selectedModelRef),
		[models, selectedModelRef],
	);

	useEffect((): void => {
		if (
			selectedModel === undefined ||
			selectedModel.reasoningEfforts.length === 0
		) {
			form.setFieldValue("reasoningEffort", undefined);
			return;
		}
		const current = form.getFieldValue("reasoningEffort");
		if (
			selectedModel.reasoningEfforts.some(
				(option): boolean => option.id === current,
			)
		)
			return;
		form.setFieldValue(
			"reasoningEffort",
			selectedModel.reasoningEfforts.find(
				(option): boolean => option.default === true,
			)?.id ??
				selectedModel.reasoningEfforts.find(
					(option): boolean => option.id === "medium",
				)?.id ??
				selectedModel.reasoningEfforts[0]?.id,
		);
	}, [form, selectedModel]);

	const workspaceNameById = useMemo(
		(): Map<string, string> =>
			new Map(
				workspaces.map((workspace): [string, string] => [
					workspace.id,
					workspace.name,
				]),
			),
		[workspaces],
	);

	const submit = async (): Promise<void> => {
		setSubmitting(true);
		setError(null);
		try {
			const values = await form.validateFields();
			const timezone =
				Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
			const built = buildManualSchedule(
				values,
				timezone,
				i18n.language,
				t,
			);
			let target: ManualScheduledTaskCreateInput["target"];
			if (values.targetKind === "existing_session") {
				target = {
					kind: "existing_session",
					sessionId: values.sessionId!,
				};
			} else {
				const [provider, model] = readModelRef(values.modelRef);
				target = {
					kind: "new_session",
					context: {
						workspaceId: values.workspaceId,
						provider,
						model,
						reasoningEffort: values.reasoningEffort ?? null,
						executionPolicy: "read_only",
					},
				};
			}
			await window.electronAPI.scheduledTasks.create({
				title: values.title,
				kind: values.kind,
				prompt: values.prompt,
				scheduleDescription: built.description,
				schedule: built.schedule,
				target,
				notificationPolicy: values.notificationPolicy,
			});
			form.resetFields();
			await onCreated();
		} catch (submitError: unknown) {
			if (
				typeof submitError === "object" &&
				submitError !== null &&
				"errorFields" in submitError
			)
				return;
			setError(
				submitError instanceof Error
					? submitError.message
					: String(submitError),
			);
		} finally {
			setSubmitting(false);
		}
	};
	const cancel = (): void => {
		if (submitting) return;
		form.resetFields();
		setError(null);
		onCancel();
	};

	return (
		<Modal
			open={open}
			forceRender
			title={t("scheduledTasks.manual.title")}
			okText={t("scheduledTasks.manual.create")}
			cancelText={t("scheduledTasks.manual.cancel")}
			confirmLoading={submitting}
			width={680}
			onOk={(): void => {
				void submit();
			}}
			onCancel={cancel}
		>
			<div className={styles.modalBody}>
				{error !== null ? (
					<Alert
						className={styles.error}
						type="error"
						showIcon
						message={error}
						action={
							<a
								onClick={(): void => {
									void load();
								}}
							>
								{t("scheduledTasks.manual.retry")}
							</a>
						}
					/>
				) : null}
				<Spin spinning={loading}>
					<Form form={form} layout="vertical" requiredMark={false}>
						<Form.Item
							name="title"
							label={t("scheduledTasks.manual.fields.title")}
							rules={[{ required: true }, { max: 120 }]}
						>
							<Input maxLength={120} />
						</Form.Item>
						<Form.Item
							name="prompt"
							label={t("scheduledTasks.manual.fields.prompt")}
							rules={[{ required: true }, { max: 20000 }]}
						>
							<Input.TextArea
								autoSize={{ minRows: 3, maxRows: 8 }}
								maxLength={20000}
							/>
						</Form.Item>
						<div className={styles.inlineFields}>
							<Form.Item
								name="kind"
								label={t("scheduledTasks.manual.fields.kind")}
								rules={[{ required: true }]}
							>
								<Select
									options={["agent", "monitor"].map(
										(value) => ({
											value,
											label: t(
												`scheduledTasks.kind.${value}`,
											),
										}),
									)}
								/>
							</Form.Item>
							<Form.Item
								name="targetKind"
								label={t("scheduledTasks.manual.fields.runIn")}
								rules={[{ required: true }]}
							>
								<Segmented
									block
									options={[
										"new_session",
										"existing_session",
									].map((value) => ({
										value,
										label: t(
											`scheduledTasks.manual.target.${value}`,
										),
									}))}
								/>
							</Form.Item>
						</div>
						{targetKind === "new_session" ? (
							<>
								<Form.Item
									name="workspaceId"
									label={t(
										"scheduledTasks.manual.fields.workspace",
									)}
								>
									<Select
										allowClear
										placeholder={t(
											"scheduledTasks.noWorkspace",
										)}
										options={workspaces.map(
											(workspace) => ({
												value: workspace.id,
												label: workspace.name,
											}),
										)}
										onChange={(value): void =>
											form.setFieldValue(
												"workspaceId",
												value ?? null,
											)
										}
									/>
								</Form.Item>
								<Form.Item
									name="modelRef"
									label={t(
										"scheduledTasks.manual.fields.model",
									)}
									rules={[{ required: true }]}
								>
									<Select
										showSearch={{
											optionFilterProp: "label",
										}}
										options={models.map((model) => ({
											value: model.value,
											label: `${model.providerName}/${model.modelName}`,
										}))}
									/>
								</Form.Item>
								{(selectedModel?.reasoningEfforts.length ?? 0) >
								0 ? (
									<Form.Item
										name="reasoningEffort"
										label={t(
											"scheduledTasks.manual.fields.reasoningEffort",
										)}
										rules={[{ required: true }]}
									>
										<Select
											options={selectedModel!.reasoningEfforts.map(
												(option) => ({
													value: option.id,
													label: t(
														`composer.reasoning.efforts.${option.id}`,
														{
															defaultValue:
																option.id,
														},
													),
												}),
											)}
										/>
									</Form.Item>
								) : null}
							</>
						) : (
							<Form.Item
								name="sessionId"
								label={t(
									"scheduledTasks.manual.fields.session",
								)}
								rules={[{ required: true }]}
							>
								<Select
									showSearch={{ optionFilterProp: "label" }}
									options={sessions.map((session) => ({
										value: session.id,
										label: `${session.title} · ${session.workspaceId === undefined ? t("scheduledTasks.noWorkspace") : (workspaceNameById.get(session.workspaceId) ?? session.workspaceName ?? session.workspaceId)}`,
									}))}
								/>
							</Form.Item>
						)}
						<div className={styles.inlineFields}>
							<Form.Item
								name="repeat"
								label={t("scheduledTasks.manual.fields.repeat")}
								rules={[{ required: true }]}
							>
								<Select
									options={[
										"once",
										"daily",
										"weekdays",
										"weekly",
										"monthly",
										"custom",
									].map((value) => ({
										value,
										label: t(
											`scheduledTasks.manual.repeat.${value}`,
										),
									}))}
								/>
							</Form.Item>
							<Form.Item
								name="anchor"
								label={t("scheduledTasks.manual.fields.time")}
								rules={[
									{ required: true },
									{
										validator: async (
											_,
											value,
										): Promise<void> => {
											if (
												value !== undefined &&
												repeat === "once" &&
												!value.isAfter(dayjs())
											)
												throw new Error(
													t(
														"scheduledTasks.manual.validation.future",
													),
												);
										},
									},
								]}
							>
								<DatePicker
									className={styles.fullWidth}
									showTime={{ format: "HH:mm" }}
									format="YYYY-MM-DD HH:mm"
								/>
							</Form.Item>
						</div>
						{repeat === "custom" ? (
							<div className={styles.inlineFields}>
								<Form.Item
									name="customUnit"
									label={t(
										"scheduledTasks.manual.fields.customUnit",
									)}
									rules={[{ required: true }]}
								>
									<Select
										options={["day", "week", "month"].map(
											(value) => ({
												value,
												label: t(
													`scheduledTasks.manual.unit.${value}`,
												),
											}),
										)}
									/>
								</Form.Item>
								<Form.Item
									name="interval"
									label={t(
										"scheduledTasks.manual.fields.interval",
									)}
									rules={[{ required: true }]}
								>
									<InputNumber
										className={styles.fullWidth}
										min={1}
										max={30}
										precision={0}
									/>
								</Form.Item>
								{customUnit === "week" ? (
									<Form.Item
										name="weekdays"
										label={t(
											"scheduledTasks.manual.fields.weekdays",
										)}
										rules={[
											{
												required: true,
												type: "array",
												min: 1,
											},
										]}
									>
										<Select
											mode="multiple"
											options={[1, 2, 3, 4, 5, 6, 0].map(
												(value) => ({
													value,
													label: t(
														`scheduledTasks.manual.weekday.${value}`,
													),
												}),
											)}
										/>
									</Form.Item>
								) : null}
							</div>
						) : null}
						<Form.Item
							name="notificationPolicy"
							label={t(
								"scheduledTasks.manual.fields.notification",
							)}
							rules={[{ required: true }]}
						>
							<Radio.Group
								options={[
									"important_updates",
									"failures_only",
								].map((value) => ({
									value,
									label: t(
										`scheduledTasks.manual.notification.${value}`,
									),
								}))}
							/>
						</Form.Item>
					</Form>
				</Spin>
			</div>
		</Modal>
	);
}
