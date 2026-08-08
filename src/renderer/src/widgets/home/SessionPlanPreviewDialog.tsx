import type { JSX } from "react";
import { Alert, Modal, Spin, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { SessionOverviewPlanItem } from "@/platform/rpc/session-overview-api";
import MarkdownContent from "@/widgets/markdown/MarkdownContent";
import styles from "./HomePage.module.css";

type SessionPlanPreviewDialogProps = {
	plan: SessionOverviewPlanItem | null;
	loading: boolean;
	error: string | null;
	onClose: () => void;
};

export default function SessionPlanPreviewDialog({ plan, loading, error, onClose }: SessionPlanPreviewDialogProps): JSX.Element {
	const { t } = useTranslation();
	const { token } = theme.useToken();

	return (
		<Modal
			title={plan?.title ?? t("agentPage.summary.fallbackPlanTitle")}
			open={plan !== null}
			footer={null}
			onCancel={onClose}
			width={800}
			zIndex={token.zIndexPopupBase + 10}
		>
			{loading ? (
				<div className={styles.planPreviewStatus}><Spin /></div>
			) : error !== null ? (
				<Alert type="error" showIcon message={error} />
			) : plan !== null ? (
				<div className={`${styles.planPreviewMarkdown} markdown-body`}>
					<MarkdownContent>{plan.previewMarkdown}</MarkdownContent>
				</div>
			) : null}
		</Modal>
	);
}
