import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./UserBubble.module.css";
import { Button, Typography } from "antd";
import { Icon } from "@/assets/icons";

export type UserBubbleProps = {
	message: string;
	sentTime?: string;
	showEditButton?: boolean;
};

function UserBubble({ message, sentTime, showEditButton }: UserBubbleProps): React.JSX.Element {
	return (
		<article className={styles.root}>
			<div className={styles.content}>
				<Markdown remarkPlugins={[remarkGfm]}>
					{message}
				</Markdown>
			</div>
			<div className={styles.toolbar}>
				{sentTime ? (
					<Typography.Text type="secondary">{sentTime}</Typography.Text>
				) : null}
				<Button
					type="text"
					size="small"
					icon={<Icon name="copy" />}
				/>
				{showEditButton ? (
					<Button
						type="text"
						size="small"
						icon={<Icon name="edit" />}
						onClick={async () => {
							await navigator.clipboard.writeText(message);
						}}
					/>
				) : null}
			</div>
		</article>
	);
}

export default UserBubble;
