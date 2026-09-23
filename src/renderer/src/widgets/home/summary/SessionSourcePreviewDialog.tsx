import { useEffect, useState, type JSX } from "react";
import { Modal, Spin, theme, Typography } from "antd";
import { useTranslation } from "react-i18next";
import {
	fetchFlowOverviewSourcePreviewDataUrl,
	type SessionOverviewSourceItem,
} from "@/platform/rpc/session-overview-api";
import MarkdownContent from "@/widgets/markdown/MarkdownContent";
import styles from "../HomePage.module.css";

type SessionSourcePreviewDialogProps = {
	source: SessionOverviewSourceItem | null;
	onClose: () => void;
};

export default function SessionSourcePreviewDialog({ source, onClose }: SessionSourcePreviewDialogProps): JSX.Element {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const [flowPreviewUrl, setFlowPreviewUrl] = useState<string | null>(null);
	const [flowPreviewError, setFlowPreviewError] = useState<string | null>(null);
	useEffect((): (() => void) | void => {
		if (source?.kind !== "flow_media_artifact") {
			setFlowPreviewUrl(null);
			setFlowPreviewError(null);
			return;
		}
		let cancelled = false;
		setFlowPreviewUrl(null);
		setFlowPreviewError(null);
		void fetchFlowOverviewSourcePreviewDataUrl(source)
			.then((url): void => {
				if (!cancelled) setFlowPreviewUrl(url);
			})
			.catch((error: unknown): void => {
				if (!cancelled) setFlowPreviewError(error instanceof Error ? error.message : String(error));
			});
		return (): void => { cancelled = true; };
	}, [source]);

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
				source.kind === "flow_media_artifact" ? (
					flowPreviewError !== null ? (
						<Typography.Text type="danger">{flowPreviewError}</Typography.Text>
					) : flowPreviewUrl === null ? (
						<div className={styles.summaryLoading}><Spin /></div>
					) : source.mimeType.startsWith("video/") ? (
						<video src={flowPreviewUrl} controls preload="metadata" style={{ display: "block", maxWidth: "100%", maxHeight: "70vh", marginInline: "auto" }} />
					) : (
						<img src={flowPreviewUrl} alt={source.title} className={styles.sourcePreviewImage} />
					)
				) : source.thumbnailDataUrl !== undefined ? (
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
