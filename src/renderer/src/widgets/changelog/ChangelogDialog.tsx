import { Button, Modal, Typography } from "antd";
import { useTranslation } from "react-i18next";
import MarkdownContent from "@/widgets/markdown/MarkdownContent";
import { CHANGELOG_MARKDOWN, getReleaseNotesForVersion } from "./changelog-data";
import styles from "./ChangelogDialog.module.css";

export type ChangelogDialogProps = {
	open: boolean;
	version?: string | null;
	full?: boolean;
	onClose: () => void;
	onOpenFull?: () => void;
};

function ChangelogDialog({ open, version = null, full = false, onClose, onOpenFull }: ChangelogDialogProps): React.JSX.Element {
	const { t } = useTranslation();
	const releaseNotes: string | null = version === null ? null : getReleaseNotesForVersion(version);
	const markdown: string = full || releaseNotes === null ? CHANGELOG_MARKDOWN : releaseNotes;

	return (
		<Modal
			open={open}
			onCancel={onClose}
			footer={(
				<div className={styles.footer}>
					{!full && onOpenFull !== undefined ? (
						<Button type="link" onClick={onOpenFull}>
							{t("changelog.actions.viewFull")}
						</Button>
					) : null}
					<Button type="primary" onClick={onClose}>
						{t("changelog.actions.close")}
					</Button>
				</div>
			)}
			title={full ? t("changelog.title") : t("changelog.whatsNew", { version: version ?? "" })}
			width={720}
		>
			<div className={styles.content}>
				{!full && releaseNotes === null ? (
					<Typography.Paragraph type="secondary">
						{t("changelog.noReleaseNotes", { version: version ?? "" })}
					</Typography.Paragraph>
				) : null}
				<MarkdownContent>{markdown}</MarkdownContent>
			</div>
		</Modal>
	);
}

export default ChangelogDialog;
