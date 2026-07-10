import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./AssistantBubble.module.css";
import { Button, Divider, Typography } from "antd";
import { Icon } from "@/assets/icons";

export type AssistantBubbleProps = {
	message: string;
	elapsedTime?: number;
	endTime?: string;
};


function AssistantBubble({ message, elapsedTime, endTime }: AssistantBubbleProps): React.JSX.Element {
	return (
		<article className={styles.root}>
			{elapsedTime ? (
				<div className={styles.timingRow}>
					<Typography.Text type="secondary">{elapsedTime.toString() + "s"}</Typography.Text>
					<Divider size="small" className={styles.antDivider} />
				</div>
			) : null}
			<div className={styles.content}>
				<Markdown remarkPlugins={[remarkGfm]}>
					{message}
				</Markdown>
			</div>
			<div className={styles.toolbar}>
				<Button
					type="text"
					size="small"
					icon={<Icon name="copy" />}
					onClick={async () => {
						await navigator.clipboard.writeText(message);
					}}
				/>
				{endTime ? (
					<Typography.Text type="secondary">{endTime}</Typography.Text>
				) : null}
			</div>
		</article>
	);
}

export default AssistantBubble;
