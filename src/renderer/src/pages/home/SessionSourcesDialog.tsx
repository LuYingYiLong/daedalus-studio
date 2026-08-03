import type { JSX } from "react";
import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { SessionOverviewResult, SessionOverviewSourceItem } from "@/api/session-overview-api";
import { formatSourceSubtitle } from "./session-overview-formatters";
import styles from "./SessionSourcesDialog.module.css";

type SessionSourcesDialogProps = {
	overview: SessionOverviewResult | null;
	open: boolean;
	onClose: () => void;
	onSourceSelect: (source: SessionOverviewSourceItem) => void;
};

export default function SessionSourcesDialog({ overview, open, onClose, onSourceSelect }: SessionSourcesDialogProps): JSX.Element {
	const { t } = useTranslation();

	return (
		<Modal
			title={t("agentPage.summary.sections.source")}
			open={open}
			footer={null}
			onCancel={onClose}
			width={640}
			className={styles.modal}
		>
			<div className={styles.summarySourceGrid}>
				{overview?.sources.items.map((source: SessionOverviewSourceItem): JSX.Element => (
					<Button
						key={`${source.kind}:${source.id}`}
						type="text"
						className={styles.sourceGridButton}
						onClick={(): void => onSourceSelect(source)}
					>
						{source.thumbnailDataUrl !== undefined ? (
							<img src={source.thumbnailDataUrl} alt="" className={styles.sourceGridThumbnail} />
						) : (
							<span className={styles.sourceGridTextIcon}><Icon name="txt" /></span>
						)}
						<span className={styles.sourceGridText}>
							<span className={styles.summaryItemTitle}>{source.title}</span>
							<span className={styles.summaryMeta}>{formatSourceSubtitle(source, t)}</span>
						</span>
					</Button>
				))}
			</div>
		</Modal>
	);
}
