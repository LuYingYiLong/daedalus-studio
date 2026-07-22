import { TimelineBodyPart } from "@/api/types";
import { Button, Card } from "antd";
import styles from "./InlineDiffPart.module.css";
import { Icon } from "@/assets/icons";

export type TimelineInlineDiffPart = Extract<TimelineBodyPart, { type: "inline_diff" }>;
export type InlineDiffPartProps = {
	part: TimelineInlineDiffPart;
	onReview?: () => void;
};

function getFilePath(item: TimelineInlineDiffPart["editedFiles"][number]): string {
	return item.displayPath ?? item.path ?? item.absolutePath ?? "Unknown file";
}

function InlineDiffPart({ part, onReview }: InlineDiffPartProps): React.JSX.Element {
	const extra: React.ReactNode = (
		<div>
			<Button
				type="text"
				icon={<Icon name="undo" />}
			>Undo</Button>
			<Button
				type="text"
				icon={<Icon name="layout-right" />}
				onClick={onReview}
			>Review</Button>
		</div>
	);

	return (
		<Card
			title={`Edited ${part.editedFileCount} files`}
			className={styles.diffCard}
			extra={extra}
		>
			<ul className={styles.fileList}>
				{part.editedFiles.map((item, index) => (
					<li key={`${getFilePath(item)}:${index}`} className={styles.fileItem}>
						<Button
							type="text"
							className={styles.filePathButton}
							disabled={onReview === undefined}
							title={getFilePath(item)}
							aria-label={`Open review for ${getFilePath(item)}`}
							onClick={onReview}
						>
							<span className={styles.filePath}>{getFilePath(item)}</span>
							<span className={styles.fileStats}>
								<span className={styles.additions}>+{item.additions ?? 0}</span>
								<span className={styles.deletions}> -{item.deletions ?? 0}</span>
							</span>
						</Button>
					</li>
				))}
			</ul>
		</Card>
	);
}

export default InlineDiffPart;
