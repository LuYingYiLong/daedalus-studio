import { useEffect, useState } from "react";
import { Button, Input, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { PlanApprovalState } from "@/platform/rpc/types";
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
	const { t } = useTranslation();
	const [revisionFeedback, setRevisionFeedback] = useState<string>("");

	useEffect((): void => {
		setRevisionFeedback("");
	}, [plan.planId, plan.updatedAt, plan.previewMarkdown]);

	const trimmedFeedback: string = revisionFeedback.trim();
	const isBusy: boolean = isApproving || isRevising;

	return (
		<section className={styles.planApprovalDialog} aria-label={t("approval.plan.aria")}>
			<header className={styles.header}>
				<div className={styles.heading}>
					<Typography.Title level={4} className={styles.title}>
						{t("approval.plan.title")}
					</Typography.Title>
					<Typography.Text type="secondary" className={styles.subtitle}>
						{t("approval.plan.subtitle")}
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
					{t("approval.plan.actions.approveAndExecute")}
				</Button>
				<Space.Compact className={styles.revisionRow}>
					<Input
						value={revisionFeedback}
						placeholder={t("approval.plan.revisionPlaceholder")}
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
						{t("approval.plan.actions.revise")}
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
