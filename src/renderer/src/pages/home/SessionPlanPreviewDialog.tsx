import type { JSX } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import type { SessionOverviewPlanItem } from "@/api/session-overview-api";
import MarkdownContent from "@/features/markdown/MarkdownContent";
import styles from "./HomePage.module.css";

type SessionPlanPreviewDialogProps = {
	plan: SessionOverviewPlanItem | null;
	onClose: () => void;
};

export default function SessionPlanPreviewDialog({ plan, onClose }: SessionPlanPreviewDialogProps): JSX.Element {
	const { t } = useTranslation();

	return (
		<Modal
			title={plan?.title ?? t("agentPage.summary.fallbackPlanTitle")}
			open={plan !== null}
			footer={null}
			onCancel={onClose}
			width={800}
		>
			{plan !== null ? (
				<div className={`${styles.planPreviewMarkdown} markdown-body`}>
					<MarkdownContent>{plan.previewMarkdown}</MarkdownContent>
				</div>
			) : null}
		</Modal>
	);
}
