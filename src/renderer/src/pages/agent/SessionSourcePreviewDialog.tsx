import type { JSX } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import type { SessionOverviewSourceItem } from "@/api/session-overview-api";
import styles from "./AgentPage.module.css";

type SessionSourcePreviewDialogProps = {
	source: SessionOverviewSourceItem | null;
	onClose: () => void;
};

export default function SessionSourcePreviewDialog({ source, onClose }: SessionSourcePreviewDialogProps): JSX.Element {
	const { t } = useTranslation();

	return (
		<Modal
			title={source?.title ?? t("agentPage.summary.fallbackImageSourceTitle")}
			open={source !== null}
			footer={null}
			onCancel={onClose}
			width={720}
		>
			{source !== null ? (
				<img
					src={source.thumbnailDataUrl}
					alt={source.title}
					className={styles.sourcePreviewImage}
				/>
			) : null}
		</Modal>
	);
}
