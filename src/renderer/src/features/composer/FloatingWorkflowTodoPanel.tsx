import { Button, Popover, Progress, Typography } from "antd";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { WorkflowTodoSnapshot, WorkflowTodoStep } from "@/api/types";
import styles from "./FloatingWorkflowTodoPanel.module.css";

export type WorkflowFileChangeSummary = {
	additions: number;
	deletions: number;
	changedFiles: number;
};

export type FloatingWorkflowTodoPanelProps = {
	snapshot: WorkflowTodoSnapshot | null;
	fileChangeSummary: WorkflowFileChangeSummary;
	onDismiss: (snapshot: WorkflowTodoSnapshot) => void;
};

function getWorkflowTodoIconName(status: string): string {
	if (status === "done" || status === "completed" || status === "success") {
		return "status-success";
	}
	if (status === "failed" || status === "error" || status === "cancelled") {
		return "status-failed";
	}
	return "status-unchecked";
}

function getStepTitle(step: WorkflowTodoStep, index: number, t: TFunction<"common">): string {
	return step.title.trim() || step.text?.trim() || t("workflowTodo.stepFallback", { index: index + 1 });
}

function isDoneStep(status: string): boolean {
	return status === "done" || status === "completed" || status === "success";
}

function isFailedStep(status: string): boolean {
	return status === "failed" || status === "error" || status === "cancelled";
}

function isFinishedStep(status: string): boolean {
	return isDoneStep(status) || isFailedStep(status);
}

function getFinishedStepCount(steps: WorkflowTodoStep[]): number {
	return steps.filter((step: WorkflowTodoStep): boolean => isFinishedStep(step.status)).length;
}

function FloatingWorkflowTodoPanel({ snapshot, fileChangeSummary, onDismiss }: FloatingWorkflowTodoPanelProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const steps: WorkflowTodoStep[] = snapshot?.steps ?? [];
	if (snapshot === null || steps.length === 0) {
		return null;
	}

	const finishedStepCount: number = getFinishedStepCount(steps);
	const percent: number = Math.max(0, Math.min(100, Math.round((finishedStepCount / steps.length) * 100)));
	const popoverContent: React.JSX.Element = (
		<div className={styles.popoverContent}>
			<div className={styles.detailSteps}>
				{steps.map((step: WorkflowTodoStep, index: number): React.ReactNode => {
					const title: string = getStepTitle(step, index, t);
					const description: string | undefined = step.text !== undefined && step.text !== title ? step.text : undefined;
					return (
						<div key={step.id} className={styles.detailStep}>
							<Icon name={getWorkflowTodoIconName(step.status)} className={styles.detailIcon} />
							<div className={styles.detailBody}>
								<span className={styles.detailTitle}>{title}</span>
								{description === undefined ? null : (
									<span className={styles.detailDescription}>{description}</span>
								)}
							</div>
						</div>
					);
				})}
			</div>
			<div className={styles.popoverFooter}>
				<span className={styles.changedFiles}>
					{t("workflowTodo.changedFiles", { count: fileChangeSummary.changedFiles })}
				</span>
				<Button
					type="text"
					size="small"
					icon={<Icon name="close" />}
					onClick={(): void => onDismiss(snapshot)}
				>
					{t("workflowTodo.dismiss")}
				</Button>
			</div>
		</div>
	);

	return (
		<div className={styles.panel} aria-label={t("workflowTodo.aria.progress")}>
			<Popover
				trigger="hover"
				placement="top"
				title={snapshot.title ?? t("workflowTodo.titleFallback")}
				content={popoverContent}
			>
				<button type="button" className={styles.progressTrigger}>
					<Progress
						type="circle"
						size={14}
						percent={percent}
						showInfo={false}
						strokeColor="var(--ds-accent)"
						strokeWidth={10}
					/>
					<Typography.Text className={styles.phaseText}>{finishedStepCount}/{steps.length}</Typography.Text>
				</button>
			</Popover>
			<span className={styles.diffSummary} aria-label={t("workflowTodo.aria.fileChanges")}>
				<span className={styles.additions}>+{fileChangeSummary.additions}</span>
				<span className={styles.deletions}>-{fileChangeSummary.deletions}</span>
			</span>
		</div>
	);
}

export default FloatingWorkflowTodoPanel;
