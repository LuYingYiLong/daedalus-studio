import {
	App,
	Button,
	InputNumber,
	Modal,
	Popover,
	Progress,
	Space,
	Typography,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	applyGoalRollback,
	cancelGoal,
	extendGoalBudget,
	getCurrentGoal,
	previewGoalRollback,
	resumeGoal,
} from "@/platform/rpc/goal-api";
import type {
	AgentGoalState,
	WorkflowTodoSnapshot,
	WorkflowTodoStep,
} from "@/platform/rpc/types";
import {
	getWorkflowTodoProgress,
	WorkflowTodoStepList,
	type WorkflowFileChangeSummary,
} from "./FloatingWorkflowTodoPanel";
import {
	getGoalBudgetExtensionDefaults,
	hasGoalBudgetAfterExtension,
	hasGoalBudgetRemaining,
} from "@/domain/composer/goal-budget";
import { isAgentGoalTerminal } from "@/domain/composer/goal-display";
import styles from "./FloatingGoalPanel.module.css";

type Props = {
	goal: AgentGoalState;
	sessionId: string;
	workflowTodo: WorkflowTodoSnapshot | null;
	fileChangeSummary: WorkflowFileChangeSummary;
	onChange: (goal: AgentGoalState) => void;
	onDismiss: (goal: AgentGoalState) => Promise<void>;
};

function formatTokens(tokens: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: tokens >= 10_000 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(tokens);
}

function formatDuration(milliseconds: number): string {
	const minutes = Math.floor(milliseconds / 60_000);
	const seconds = Math.floor((milliseconds % 60_000) / 1000);
	return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default function FloatingGoalPanel({
	goal,
	sessionId,
	workflowTodo,
	fileChangeSummary,
	onChange,
	onDismiss,
}: Props): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const budgetDefaults = useMemo(
		() => getGoalBudgetExtensionDefaults(goal),
		[goal.budget, goal.usage],
	);
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [action, setAction] = useState<
		"resume" | "cancel" | "rollback" | "dismiss" | null
	>(null);
	const [budgetOpen, setBudgetOpen] = useState(false);
	const [budgetSaving, setBudgetSaving] = useState(false);
	const [cycles, setCycles] = useState(budgetDefaults.cycles);
	const [tokens, setTokens] = useState(budgetDefaults.tokens);
	const [minutes, setMinutes] = useState(budgetDefaults.activeMinutes);
	const [telemetryGoal, setTelemetryGoal] = useState<AgentGoalState | null>(
		null,
	);
	const telemetryRequestRef = useRef(0);
	const effectiveGoal =
		telemetryGoal?.goalId === goal.goalId &&
		telemetryGoal.revision >= goal.revision
			? telemetryGoal
			: goal;
	const [now, setNow] = useState((): number => Date.now());
	const [activeStartedAt, setActiveStartedAt] = useState((): number =>
		Date.now(),
	);
	const tracksActiveTime =
		effectiveGoal.stage === "running" ||
		effectiveGoal.stage === "evaluating";
	useEffect((): void => {
		setTelemetryGoal(null);
	}, [goal.goalId, goal.revision]);
	useEffect((): (() => void) | undefined => {
		if (!popoverOpen) return undefined;
		let disposed = false;
		let inFlight = false;
		const refresh = async (): Promise<void> => {
			if (inFlight) return;
			inFlight = true;
			const requestId = ++telemetryRequestRef.current;
			try {
				const goalResult = await getCurrentGoal(sessionId);
				if (disposed || requestId !== telemetryRequestRef.current)
					return;
				if (goalResult?.goalId === goal.goalId)
					setTelemetryGoal(goalResult);
			} catch {
				// Keep the last telemetry snapshot; normal event updates remain authoritative.
			} finally {
				inFlight = false;
			}
		};
		void refresh();
		const timer = window.setInterval((): void => void refresh(), 5_000);
		return (): void => {
			disposed = true;
			telemetryRequestRef.current += 1;
			window.clearInterval(timer);
		};
	}, [goal.goalId, goal.stage, popoverOpen, sessionId]);
	useEffect((): (() => void) | undefined => {
		const startedAt = Date.now();
		setNow(startedAt);
		setActiveStartedAt(startedAt);
		if (!tracksActiveTime) return undefined;
		const timer = window.setInterval((): void => setNow(Date.now()), 1000);
		return (): void => window.clearInterval(timer);
	}, [
		effectiveGoal.goalId,
		effectiveGoal.stage,
		effectiveGoal.usage.activeMilliseconds,
		tracksActiveTime,
	]);
	const displayedActiveMilliseconds =
		effectiveGoal.usage.activeMilliseconds +
		(tracksActiveTime ? Math.max(0, now - activeStartedAt) : 0);
	const active = !isAgentGoalTerminal(goal);
	const paused = goal.stage === "paused";
	const canResume = hasGoalBudgetRemaining(goal);
	const readinessIssues =
		goal.readiness?.checks.filter((check) => check.status !== "passed") ??
		[];
	const todoSteps: WorkflowTodoStep[] = workflowTodo?.steps ?? [];
	const todoProgress = getWorkflowTodoProgress(todoSteps);
	const summary = useMemo(
		() => `${effectiveGoal.usage.cycles}/${effectiveGoal.budget.maxCycles}`,
		[effectiveGoal.budget.maxCycles, effectiveGoal.usage.cycles],
	);

	async function runAction(
		kind: "resume" | "cancel",
		operation: () => Promise<AgentGoalState>,
	): Promise<void> {
		try {
			setAction(kind);
			onChange(await operation());
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("goal.errors.action"),
			);
		} finally {
			setAction(null);
		}
	}

	function confirmCancel(): void {
		modal.confirm({
			title: t("goal.cancelConfirm.title"),
			content: t("goal.cancelConfirm.description"),
			cancelText: t("goal.actions.dismiss"),
			okText: t("goal.actions.cancel"),
			okButtonProps: { danger: true },
			onOk: (): Promise<void> =>
				runAction("cancel", () => cancelGoal(goal.goalId)),
		});
	}

	async function handleRollback(): Promise<void> {
		try {
			setAction("rollback");
			const preview = await previewGoalRollback(goal.goalId);
			if (!preview.available || preview.fingerprint === null) {
				modal.warning({
					title: t("goal.rollback.unavailableTitle"),
					content:
						preview.reasons.join("\n") ||
						t("goal.rollback.unavailable"),
				});
				return;
			}
			modal.confirm({
				title: t("goal.rollback.title"),
				content: t("goal.rollback.description", {
					count: preview.files.length,
				}),
				okText: t("goal.actions.rollback"),
				okButtonProps: { danger: true },
				onOk: async (): Promise<void> => {
					await applyGoalRollback(goal.goalId, preview.fingerprint!);
					void message.success(t("goal.rollback.success"));
				},
			});
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("goal.errors.rollback"),
			);
		} finally {
			setAction(null);
		}
	}

	async function handleExtend(): Promise<void> {
		const extension = { cycles, tokens, activeMinutes: minutes };
		if (!hasGoalBudgetAfterExtension(goal, extension)) {
			void message.warning(t("goal.errors.insufficientBudget"));
			return;
		}
		try {
			setBudgetSaving(true);
			const extendedGoal = await extendGoalBudget(
				goal.goalId,
				cycles,
				tokens,
				minutes,
			);
			onChange(extendedGoal);
			setBudgetOpen(false);
			if (
				goal.stage === "paused" &&
				goal.pauseReason === "budget_exhausted"
			) {
				try {
					onChange(await resumeGoal(goal.goalId));
				} catch (error: unknown) {
					void message.error(
						error instanceof Error
							? error.message
							: t("goal.errors.action"),
					);
				}
			}
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("goal.errors.budget"),
			);
		} finally {
			setBudgetSaving(false);
		}
	}

	function handleOpenBudget(): void {
		setCycles(budgetDefaults.cycles);
		setTokens(budgetDefaults.tokens);
		setMinutes(budgetDefaults.activeMinutes);
		setPopoverOpen(false);
		setBudgetOpen(true);
	}

	async function handleDismiss(): Promise<void> {
		try {
			setAction("dismiss");
			await onDismiss(goal);
			setPopoverOpen(false);
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("goal.errors.dismiss"),
			);
		} finally {
			setAction(null);
		}
	}

	const content = (
		<div className={styles.content}>
			<div className={styles.metrics}>
				<div>
					<span>{t("goal.fields.stage")}</span>
					<strong>{t(`goal.stages.${effectiveGoal.stage}`)}</strong>
				</div>
				<div>
					<span>{t("goal.fields.cycles")}</span>
					<strong>{summary}</strong>
				</div>
				<div>
					<span>{t("goal.fields.tokens")}</span>
					<strong>
						{formatTokens(effectiveGoal.usage.tokens)} /{" "}
						{formatTokens(effectiveGoal.budget.maxTokens)}
					</strong>
				</div>
				<div>
					<span>{t("goal.fields.activeTime")}</span>
					<strong>
						{formatDuration(displayedActiveMilliseconds)}
					</strong>
				</div>
			</div>
			{goal.evaluation === null ? null : (
				<div className={styles.section}>
					<Typography.Text strong>
						{t("goal.evaluation")}
					</Typography.Text>
					<Typography.Paragraph>
						{goal.evaluation.summary}
					</Typography.Paragraph>
					{goal.evaluation.unmetCriteria.map((criterion) => (
						<Typography.Text key={criterion} type="secondary">
							• {criterion}
						</Typography.Text>
					))}
				</div>
			)}
			{readinessIssues.length === 0 ? null : (
				<div className={styles.section}>
					<Typography.Text strong>
						{t("goal.readiness")}
					</Typography.Text>
					{readinessIssues.map((check) => (
						<Typography.Text
							key={check.id}
							type={
								check.status === "blocked"
									? "danger"
									: "warning"
							}
						>
							• {check.message}
						</Typography.Text>
					))}
				</div>
			)}
			{todoSteps.length === 0 ? null : (
				<div className={styles.section}>
					<div className={styles.workflowHeading}>
						<Typography.Text strong>
							{workflowTodo?.title ?? t("goal.workflow")}
						</Typography.Text>
						<span className={styles.workflowProgress}>
							<Progress
								type="circle"
								size={14}
								percent={todoProgress.percent}
								showInfo={false}
								strokeColor="var(--ds-accent)"
								strokeWidth={10}
							/>
							<Typography.Text>
								{todoProgress.finished}/{todoSteps.length}
							</Typography.Text>
						</span>
					</div>
					<WorkflowTodoStepList steps={todoSteps} />
				</div>
			)}
			<div className={styles.footer}>
				<Typography.Text type="secondary">
					{t("workflowTodo.changedFiles", {
						count: fileChangeSummary.changedFiles,
					})}
				</Typography.Text>
				<Space size={2}>
					{paused && canResume ? (
						<Button
							type="text"
							size="small"
							loading={action === "resume"}
							icon={<Icon name="play" />}
							onClick={() =>
								void runAction("resume", () =>
									resumeGoal(goal.goalId),
								)
							}
						>
							{t("goal.actions.resume")}
						</Button>
					) : null}
					{paused && !canResume ? (
						<Button
							type="text"
							size="small"
							icon={<Icon name="add" />}
							onClick={handleOpenBudget}
						>
							{t("goal.actions.extend")}
						</Button>
					) : null}
					{active ? (
						<Button
							type="text"
							danger
							size="small"
							loading={action === "cancel"}
							icon={<Icon name="close" />}
							onClick={confirmCancel}
						>
							{t("goal.actions.cancel")}
						</Button>
					) : null}
					{!active && goal.checkpoint.status === "available" ? (
						<Button
							type="text"
							danger
							size="small"
							loading={action === "rollback"}
							icon={<Icon name="undo" />}
							onClick={() => void handleRollback()}
						>
							{t("goal.actions.rollback")}
						</Button>
					) : null}
					{!active ? (
						<Button
							type="text"
							size="small"
							loading={action === "dismiss"}
							icon={<Icon name="close" />}
							onClick={() => void handleDismiss()}
						>
							{t("goal.actions.dismiss")}
						</Button>
					) : null}
				</Space>
			</div>
		</div>
	);

	return (
		<>
			<div className={styles.panel} aria-label={t("goal.aria")}>
				<Popover
					open={popoverOpen}
					onOpenChange={setPopoverOpen}
					placement="top"
					title={goal.title}
					content={content}
				>
					<Button
						type="text"
						size="small"
						className={styles.trigger}
						icon={<Icon name="goal" />}
					>
						{t(`goal.stages.${goal.stage}`)} · {summary}
					</Button>
				</Popover>
				<span className={styles.diff}>
					<span>+{fileChangeSummary.additions}</span>
					<span>-{fileChangeSummary.deletions}</span>
				</span>
			</div>
			<Modal
				title={t("goal.extend.title")}
				open={budgetOpen}
				confirmLoading={budgetSaving}
				destroyOnHidden
				onCancel={() => setBudgetOpen(false)}
				onOk={() => void handleExtend()}
			>
				<div className={styles.budgetFields}>
					<label>
						{t("goal.extend.cycles")}
						<InputNumber
							min={0}
							max={100}
							value={cycles}
							onChange={(value) => setCycles(value ?? 0)}
						/>
					</label>
					<label>
						{t("goal.extend.tokens")}
						<InputNumber
							min={0}
							max={10_000_000}
							step={10_000}
							value={tokens}
							onChange={(value) => setTokens(value ?? 0)}
						/>
					</label>
					<label>
						{t("goal.extend.minutes")}
						<InputNumber
							min={0}
							max={10_080}
							value={minutes}
							onChange={(value) => setMinutes(value ?? 0)}
						/>
					</label>
				</div>
			</Modal>
		</>
	);
}
