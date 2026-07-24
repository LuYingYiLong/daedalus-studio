import { Button, Popover, Progress, Typography } from "antd";
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

function getStepTitle(step: WorkflowTodoStep, index: number): string {
	return step.title.trim() || step.text?.trim() || `Step ${index + 1}`;
}

function isRunningStep(status: string): boolean {
	return status === "running" || status === "in_progress" || status === "paused";
}

function isDoneStep(status: string): boolean {
	return status === "done" || status === "completed" || status === "success";
}

function isFailedStep(status: string): boolean {
	return status === "failed" || status === "error" || status === "cancelled";
}

function getCurrentStepNumber(steps: WorkflowTodoStep[]): number {
	const runningIndex: number = steps.findIndex((step: WorkflowTodoStep): boolean => isRunningStep(step.status));
	if (runningIndex >= 0) {
		return runningIndex + 1;
	}

	const firstPendingIndex: number = steps.findIndex((step: WorkflowTodoStep): boolean => !isDoneStep(step.status));
	return firstPendingIndex >= 0 ? firstPendingIndex + 1 : steps.length;
}

function getProgressStatus(steps: WorkflowTodoStep[]): "normal" | "exception" | "success" {
	if (steps.some((step: WorkflowTodoStep): boolean => isFailedStep(step.status))) {
		return "exception";
	}
	if (steps.every((step: WorkflowTodoStep): boolean => isDoneStep(step.status))) {
		return "success";
	}
	return "normal";
}

function FloatingWorkflowTodoPanel({ snapshot, fileChangeSummary, onDismiss }: FloatingWorkflowTodoPanelProps): React.JSX.Element | null {
	const steps: WorkflowTodoStep[] = snapshot?.steps ?? [];
	if (snapshot === null || steps.length === 0) {
		return null;
	}

	const currentStepNumber: number = getCurrentStepNumber(steps);
	const percent: number = Math.max(0, Math.min(100, Math.round((currentStepNumber / steps.length) * 100)));
	const popoverContent: React.JSX.Element = (
		<div className={styles.popoverContent}>
			<div className={styles.detailSteps}>
				{steps.map((step: WorkflowTodoStep, index: number): React.ReactNode => {
					const title: string = getStepTitle(step, index);
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
				<span className={styles.changedFiles}>{fileChangeSummary.changedFiles} files</span>
				<Button
					type="text"
					size="small"
					icon={<Icon name="close" />}
					onClick={(): void => onDismiss(snapshot)}
				>
					Dismiss
				</Button>
			</div>
		</div>
	);

	return (
		<div className={styles.panel} aria-label="Workflow progress">
			<Popover
				trigger="hover"
				placement="top"
				title={snapshot.title ?? "Todo"}
				content={popoverContent}
			>
				<button type="button" className={styles.progressTrigger}>
					<Progress
						type="circle"
						size={14}
						percent={percent}
						showInfo={false}
						status={getProgressStatus(steps)}
						strokeWidth={10}
					/>
					<Typography.Text className={styles.phaseText}>{currentStepNumber}/{steps.length}</Typography.Text>
				</button>
			</Popover>
			<span className={styles.diffSummary} aria-label="File changes">
				<span className={styles.additions}>+{fileChangeSummary.additions}</span>
				<span className={styles.deletions}>-{fileChangeSummary.deletions}</span>
			</span>
		</div>
	);
}

export default FloatingWorkflowTodoPanel;
