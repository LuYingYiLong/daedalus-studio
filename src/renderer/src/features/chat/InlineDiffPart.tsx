import { TimelineBodyPart } from "@/api/types";
import { Button, Card, List, Typography } from "antd";
import styles from "./InlineDiffPart.module.css";
import { Icon } from "@/assets/icons";

export type TimelineInlineDiffPart = Extract<TimelineBodyPart, { type: "inline_diff" }>;
export type InlineDiffPartPorps = {
	part: TimelineInlineDiffPart;
};

function getFilePath(item: TimelineInlineDiffPart["editedFiles"][number]): string {
	return item.displayPath ?? item.path ?? item.absolutePath ?? "Unknown file";
}

function InlineDiffPart({ part }: InlineDiffPartPorps): React.JSX.Element {
	const extra: React.ReactNode = (
		<div>
			<Button
				type="text"
				size="small"
				icon={<Icon name="undo" />}
			>Undo</Button>
			<Button
				type="text"
				size="small"
			>Review</Button>
		</div>
	);

	return (
		<Card
			size="small"
			title={`Edited ${part.editedFileCount} files`}
			className={styles.diffCard}
			extra={extra}
		>
			<List
				dataSource={part.editedFiles}
				renderItem={(item) => (
					<List.Item className={styles.fileItem}>
						<Typography.Text className={styles.filePath} ellipsis={true}>
							{getFilePath(item)}
						</Typography.Text>
						<span className={styles.fileStats}>
							<span className={styles.additions}>+{item.additions ?? 0}</span>
							<span className={styles.deletions}> -{item.deletions ?? 0}</span>
						</span>
					</List.Item>
				)}
			/>
		</Card>
	);
}

export default InlineDiffPart;
