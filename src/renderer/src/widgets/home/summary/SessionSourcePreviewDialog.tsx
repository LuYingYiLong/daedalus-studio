import type { JSX } from "react";
import { Modal, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { SessionOverviewSourceItem } from "@/platform/rpc/session-overview-api";
import MarkdownContent from "@/widgets/markdown/MarkdownContent";
import styles from "../HomePage.module.css";

type SessionSourcePreviewDialogProps = {
	source: SessionOverviewSourceItem | null;
	onClose: () => void;
};

export default function SessionSourcePreviewDialog({ source, onClose }: SessionSourcePreviewDialogProps): JSX.Element {
	const { t } = useTranslation();
	const { token } = theme.useToken();

	return (
		<Modal
			title={source?.title ?? t("agentPage.summary.fallbackImageSourceTitle")}
			open={source !== null}
			footer={null}
			onCancel={onClose}
			width={720}
			zIndex={token.zIndexPopupBase + 10}
		>
			{source !== null ? (
				source.thumbnailDataUrl !== undefined ? (
					<img
						src={source.thumbnailDataUrl}
						alt={source.title}
						className={styles.sourcePreviewImage}
					/>
				) : (
					<div className={`${styles.sourcePreviewText} markdown-body`}>
						<MarkdownContent>{source.textPreview ?? ""}</MarkdownContent>
					</div>
				)
			) : null}
		</Modal>
	);
}
