import type { JSX } from "react";
import { Alert, Button, Modal, Spin } from "antd";
import { useTranslation } from "react-i18next";
import type { SessionOverviewPlanItem, SessionOverviewResult } from "@/api/session-overview-api";
import styles from "./HomePage.module.css";

type SessionPlansDialogProps = {
	overview: SessionOverviewResult | null;
	open: boolean;
	loading: boolean;
	error: string | null;
	onClose: () => void;
	onPlanSelect: (plan: SessionOverviewPlanItem) => void;
};

function formatOverviewDate(value: string): string {
	if (value.trim().length === 0) {
		return "";
	}
	const date: Date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function SessionPlansDialog({ overview, open, loading, error, onClose, onPlanSelect }: SessionPlansDialogProps): JSX.Element {
	const { t } = useTranslation();

	return (
		<Modal
			title={t("agentPage.summary.sections.plans")}
			open={open}
			footer={null}
			onCancel={onClose}
			width={640}
		>
			{error !== null ? <Alert type="error" showIcon message={error} className={styles.summaryModalStatus} /> : null}
			<div className={styles.summaryModalList}>
				{overview?.plans.items.map((plan: SessionOverviewPlanItem): JSX.Element => (
					<Button
						key={plan.planId}
						type="text"
						block
						className={styles.summaryPlanButton}
						onClick={(): void => onPlanSelect(plan)}
					>
						<span className={styles.summaryPlanButtonContent}>
							<span className={styles.summaryItemTitle}>{plan.title}</span>
							<span className={styles.summaryMeta}>
								{plan.status} / {formatOverviewDate(plan.updatedAt)}
							</span>
							<span className={styles.summaryPath}>{plan.planPath}</span>
						</span>
					</Button>
				))}
			</div>
			{loading ? <div className={styles.summaryModalStatus}><Spin size="small" /></div> : null}
		</Modal>
	);
}
