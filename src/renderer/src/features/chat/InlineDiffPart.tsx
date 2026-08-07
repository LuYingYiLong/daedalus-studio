import { TimelineBodyPart } from "@/api/types";
import { Button, Card } from "antd";
import styles from "./InlineDiffPart.module.css";
import { Icon } from "@/assets/icons";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

export type TimelineInlineDiffPart = Extract<TimelineBodyPart, { type: "inline_diff" }>;
export type InlineDiffPartProps = {
	part: TimelineInlineDiffPart;
	onReview?: () => void;
};

function getFilePath(item: TimelineInlineDiffPart["editedFiles"][number], unknownFileLabel: string): string {
	return item.displayPath ?? item.path ?? item.absolutePath ?? unknownFileLabel;
}

function InlineDiffPart({ part, onReview }: InlineDiffPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const [showAllFiles, setShowAllFiles] = useState<boolean>(false);
	const visibleFileLimit: number = 3;
	const hasHiddenFiles: boolean = part.editedFiles.length > visibleFileLimit;
	const visibleFiles = showAllFiles || !hasHiddenFiles
		? part.editedFiles
		: part.editedFiles.slice(0, visibleFileLimit);
	const hiddenFileCount: number = Math.max(0, part.editedFiles.length - visibleFileLimit);
	const extra: React.ReactNode = (
		<div>
			<Button
				type="text"
				icon={<Icon name="undo" />}
			>{t("chat.inlineDiff.actions.undo")}</Button>
			<Button
				type="text"
				icon={<Icon name="layout-right" />}
				onClick={onReview}
			>{t("chat.inlineDiff.actions.review")}</Button>
		</div>
	);

	return (
		<Card
			title={t("chat.inlineDiff.title", { count: part.editedFileCount })}
			className={styles.diffCard}
			extra={extra}
		>
			<ul className={styles.fileList}>
				{visibleFiles.map((item, index) => {
					const filePath: string = getFilePath(item, t("chat.inlineDiff.unknownFile"));
					return (
					<li key={`${filePath}:${index}`} className={styles.fileItem}>
						<Button
							type="text"
							className={styles.filePathButton}
							disabled={onReview === undefined}
							title={filePath}
							aria-label={t("chat.inlineDiff.openReviewAria", { filePath })}
							onClick={onReview}
						>
							<span className={styles.filePath}>{filePath}</span>
							<span className={styles.fileStats}>
								<span className={styles.additions}>+{item.additions ?? 0}</span>
								<span className={styles.deletions}> -{item.deletions ?? 0}</span>
							</span>
						</Button>
					</li>
				);
				})}
			</ul>
			{hasHiddenFiles && !showAllFiles && (
				<Button
					type="text"
					size="small"
					className={styles.fileListToggle}
					onClick={(): void => setShowAllFiles(true)}
					aria-expanded={false}
				>
					{t("chat.inlineDiff.showMoreFiles", { count: hiddenFileCount })}
				</Button>
			)}
			{hasHiddenFiles && showAllFiles && (
				<Button
					type="text"
					size="small"
					className={styles.fileListToggle}
					onClick={(): void => setShowAllFiles(false)}
					aria-expanded={true}
				>
					{t("chat.inlineDiff.collapseFiles")}
				</Button>
			)}
		</Card>
	);
}

export default memo(InlineDiffPart);
