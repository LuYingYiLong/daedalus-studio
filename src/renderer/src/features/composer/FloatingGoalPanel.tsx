import { App, Button, InputNumber, Modal, Popover, Progress, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { applyGoalRollback, cancelGoal, extendGoalBudget, pauseGoal, previewGoalRollback, resumeGoal } from "@/api/goal-api";
import type { AgentGoalState, WorkflowTodoSnapshot, WorkflowTodoStep } from "@/api/types";
import type { WorkflowFileChangeSummary } from "./FloatingWorkflowTodoPanel";
import styles from "./FloatingGoalPanel.module.css";

type Props = {
	goal: AgentGoalState;
	workflowTodo: WorkflowTodoSnapshot | null;
	fileChangeSummary: WorkflowFileChangeSummary;
	onChange: (goal: AgentGoalState) => void;
};

function formatTokens(tokens: number): string {
	return new Intl.NumberFormat(undefined, { notation: tokens >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(tokens);
}

function formatDuration(milliseconds: number): string {
	const minutes = Math.floor(milliseconds / 60_000);
	const seconds = Math.floor((milliseconds % 60_000) / 1000);
	return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function isTerminal(goal: AgentGoalState): boolean {
	return goal.stage === "achieved" || goal.stage === "failed" || goal.stage === "cancelled";
}

export default function FloatingGoalPanel({ goal, workflowTodo, fileChangeSummary, onChange }: Props): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [action, setAction] = useState<"pause" | "resume" | "cancel" | "rollback" | null>(null);
	const [budgetOpen, setBudgetOpen] = useState(false);
	const [budgetSaving, setBudgetSaving] = useState(false);
	const [cycles, setCycles] = useState(2);
	const [tokens, setTokens] = useState(100_000);
	const [minutes, setMinutes] = useState(30);
	const [now, setNow] = useState((): number => Date.now());
	const [activeStartedAt, setActiveStartedAt] = useState((): number => Date.now());
	const tracksActiveTime = goal.stage === "running" || goal.stage === "evaluating";
	useEffect((): (() => void) | undefined => {
		const startedAt = Date.now();
		setNow(startedAt);
		setActiveStartedAt(startedAt);
		if (!tracksActiveTime) return undefined;
		const timer = window.setInterval((): void => setNow(Date.now()), 1000);
		return (): void => window.clearInterval(timer);
	}, [goal.goalId, goal.stage, goal.usage.activeMilliseconds, tracksActiveTime]);
	const displayedActiveMilliseconds = goal.usage.activeMilliseconds + (tracksActiveTime
		? Math.max(0, now - activeStartedAt)
		: 0);
	const percent = goal.stage === "achieved" ? 100 : Math.min(100, Math.round((goal.usage.cycles / Math.max(1, goal.budget.maxCycles)) * 100));
	const active = !isTerminal(goal);
	const paused = goal.stage === "paused";
	const readinessIssues = goal.readiness?.checks.filter((check) => check.status !== "passed") ?? [];
	const todoSteps: WorkflowTodoStep[] = workflowTodo?.steps ?? [];
	const summary = useMemo(() => `${goal.usage.cycles}/${goal.budget.maxCycles}`, [goal.budget.maxCycles, goal.usage.cycles]);

	async function runAction(kind: "pause" | "resume" | "cancel", operation: () => Promise<AgentGoalState>): Promise<void> {
		try {
			setAction(kind);
			onChange(await operation());
		} catch (error: unknown) {
			void message.error(error instanceof Error ? error.message : t("goal.errors.action"));
		} finally {
			setAction(null);
		}
	}

	function confirmCancel(): void {
		modal.confirm({
			title: t("goal.cancelConfirm.title"),
			content: t("goal.cancelConfirm.description"),
			okText: t("goal.actions.cancel"),
			okButtonProps: { danger: true },
			onOk: (): Promise<void> => runAction("cancel", () => cancelGoal(goal.goalId))
		});
	}

	async function handleRollback(): Promise<void> {
		try {
			setAction("rollback");
			const preview = await previewGoalRollback(goal.goalId);
			if (!preview.available || preview.fingerprint === null) {
				modal.warning({
					title: t("goal.rollback.unavailableTitle"),
					content: preview.reasons.join("\n") || t("goal.rollback.unavailable")
				});
				return;
			}
			modal.confirm({
				title: t("goal.rollback.title"),
				content: t("goal.rollback.description", { count: preview.files.length }),
				okText: t("goal.actions.rollback"),
				okButtonProps: { danger: true },
				onOk: async (): Promise<void> => {
					await applyGoalRollback(goal.goalId, preview.fingerprint!);
					void message.success(t("goal.rollback.success"));
				}
			});
		} catch (error: unknown) {
			void message.error(error instanceof Error ? error.message : t("goal.errors.rollback"));
		} finally {
			setAction(null);
		}
	}

	async function handleExtend(): Promise<void> {
		try {
			setBudgetSaving(true);
			onChange(await extendGoalBudget(goal.goalId, cycles, tokens, minutes));
			setBudgetOpen(false);
		} catch (error: unknown) {
			void message.error(error instanceof Error ? error.message : t("goal.errors.budget"));
		} finally {
			setBudgetSaving(false);
		}
	}

	const content = (
		<div className={styles.content}>
			<div className={styles.metrics}>
				<div><span>{t("goal.fields.stage")}</span><strong>{t(`goal.stages.${goal.stage}`)}</strong></div>
				<div><span>{t("goal.fields.cycles")}</span><strong>{summary}</strong></div>
				<div><span>{t("goal.fields.tokens")}</span><strong>{formatTokens(goal.usage.tokens)} / {formatTokens(goal.budget.maxTokens)}</strong></div>
				<div><span>{t("goal.fields.activeTime")}</span><strong>{formatDuration(displayedActiveMilliseconds)}</strong></div>
			</div>
			<Progress percent={percent} showInfo={false} status={goal.stage === "failed" ? "exception" : goal.stage === "achieved" ? "success" : "normal"} />
			{goal.evaluation === null ? null : (
				<div className={styles.section}>
					<Typography.Text strong>{t("goal.evaluation")}</Typography.Text>
					<Typography.Paragraph>{goal.evaluation.summary}</Typography.Paragraph>
					{goal.evaluation.unmetCriteria.map((criterion) => <Typography.Text key={criterion} type="secondary">• {criterion}</Typography.Text>)}
				</div>
			)}
			{readinessIssues.length === 0 ? null : (
				<div className={styles.section}>
					<Typography.Text strong>{t("goal.readiness")}</Typography.Text>
					{readinessIssues.map((check) => <Typography.Text key={check.id} type={check.status === "blocked" ? "danger" : "warning"}>• {check.message}</Typography.Text>)}
				</div>
			)}
			{todoSteps.length === 0 ? null : (
				<div className={styles.section}>
					<Typography.Text strong>{t("goal.workflow")}</Typography.Text>
					{todoSteps.map((step) => <Typography.Text key={step.id} type="secondary">• {step.title}</Typography.Text>)}
				</div>
			)}
			<div className={styles.footer}>
				<Typography.Text type="secondary">{t("workflowTodo.changedFiles", { count: fileChangeSummary.changedFiles })}</Typography.Text>
				<Space size={2}>
					{active && !paused ? <Button type="text" size="small" loading={action === "pause"} icon={<Icon name="stop" />} onClick={() => void runAction("pause", () => pauseGoal(goal.goalId))}>{t("goal.actions.pause")}</Button> : null}
					{paused ? <Button type="text" size="small" loading={action === "resume"} icon={<Icon name="play" />} onClick={() => void runAction("resume", () => resumeGoal(goal.goalId))}>{t("goal.actions.resume")}</Button> : null}
					{goal.pauseReason === "budget_exhausted" ? <Button type="text" size="small" icon={<Icon name="add" />} onClick={() => setBudgetOpen(true)}>{t("goal.actions.extend")}</Button> : null}
					{active ? <Button type="text" danger size="small" loading={action === "cancel"} icon={<Icon name="close" />} onClick={confirmCancel}>{t("goal.actions.cancel")}</Button> : null}
					{!active && goal.checkpoint.status === "available" ? <Button type="text" danger size="small" loading={action === "rollback"} icon={<Icon name="undo" />} onClick={() => void handleRollback()}>{t("goal.actions.rollback")}</Button> : null}
				</Space>
			</div>
		</div>
	);

	return (
		<>
			<div className={styles.panel} aria-label={t("goal.aria")}>
				<Popover open={popoverOpen} onOpenChange={setPopoverOpen} trigger="click" placement="top" title={goal.title} content={content}>
					<Button type="text" size="small" className={styles.trigger} icon={<Icon name="goal" />}>
						{t(`goal.stages.${goal.stage}`)} · {summary}
					</Button>
				</Popover>
				<span className={styles.diff}><span>+{fileChangeSummary.additions}</span><span>-{fileChangeSummary.deletions}</span></span>
			</div>
			<Modal title={t("goal.extend.title")} open={budgetOpen} confirmLoading={budgetSaving} destroyOnHidden onCancel={() => setBudgetOpen(false)} onOk={() => void handleExtend()}>
				<div className={styles.budgetFields}>
					<label>{t("goal.extend.cycles")}<InputNumber min={0} max={100} value={cycles} onChange={(value) => setCycles(value ?? 0)} /></label>
					<label>{t("goal.extend.tokens")}<InputNumber min={0} max={10_000_000} step={10_000} value={tokens} onChange={(value) => setTokens(value ?? 0)} /></label>
					<label>{t("goal.extend.minutes")}<InputNumber min={0} max={10_080} value={minutes} onChange={(value) => setMinutes(value ?? 0)} /></label>
				</div>
			</Modal>
		</>
	);
}
