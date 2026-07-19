import { useEffect, useState } from "react";
import { Button, Input, Space, Typography } from "antd";
import type { PlanApprovalState } from "@/api/types";
import styles from "./PlanApprovalDialog.module.css";

export type PlanApprovalDialogProps = {
	plan: PlanApprovalState;
	isApproving: boolean;
	isRevising: boolean;
	errorMessage: string | null;
	onApprove: (planId: string) => void;
	onRevise: (planId: string, feedback: string) => void;
};

function PlanApprovalDialog({
	plan,
	isApproving,
	isRevising,
	errorMessage,
	onApprove,
	onRevise
}: PlanApprovalDialogProps): React.JSX.Element {
	const [revisionFeedback, setRevisionFeedback] = useState<string>("");

	useEffect((): void => {
		setRevisionFeedback("");
	}, [plan.planId, plan.updatedAt, plan.previewMarkdown]);

	const trimmedFeedback: string = revisionFeedback.trim();
	const isBusy: boolean = isApproving || isRevising;

	return (
		<section className={styles.planApprovalDialog} aria-label="Plan approval">
			<header className={styles.header}>
				<div className={styles.heading}>
					<Typography.Title level={4} className={styles.title}>
						Approve plan?
					</Typography.Title>
					<Typography.Text type="secondary" className={styles.subtitle}>
						Review the plan above, then approve it or ask for changes.
					</Typography.Text>
				</div>
			</header>

			<div className={styles.actions}>
				<Button
					block={true}
					type="primary"
					loading={isApproving}
					disabled={isBusy}
					className={styles.approveActionButton}
					onClick={(): void => onApprove(plan.planId)}
				>
					Approve and Execute
				</Button>
				<Space.Compact className={styles.revisionRow}>
					<Input
						value={revisionFeedback}
						placeholder="Tell the assistant how to change the plan"
						className={styles.revisionInput}
						disabled={isBusy}
						onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
							setRevisionFeedback(event.target.value);
						}}
					/>
					<Button
						loading={isRevising}
						disabled={isBusy || trimmedFeedback.length === 0}
						onClick={(): void => onRevise(plan.planId, trimmedFeedback)}
					>
						Revise
					</Button>
				</Space.Compact>
			</div>

			{errorMessage ? (
				<Typography.Text type="danger" className={styles.errorText}>
					{errorMessage}
				</Typography.Text>
			) : null}
		</section>
	);
}

export default PlanApprovalDialog;
