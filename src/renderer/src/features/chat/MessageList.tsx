import { TimelineAssistantBlock, TimelineBlock } from "@/api/types";
import AssistantBubble from "../bubble/AssistantBubble";
import UserBubble from "../bubble/UserBubble";
import styles from "./MessageList.module.css";
import { Spin, Alert } from "antd";

export type MessageListProps = {
	blocks: TimelineBlock[];
	isLoading?: boolean;
	errorMessage?: string | null;
}

function MessageList({ blocks, isLoading, errorMessage }: MessageListProps): React.JSX.Element {
	function getAssistantMarkdown(block: TimelineAssistantBlock): string {
		const markdown: string = block.bodyParts
			.filter((part) => part.type === "markdown")
			.map((part) => part.text)
			.join("");
		
		return markdown.length > 0 ? markdown : block.content;
	}

	function formatTime(isoTime: string): string {
		return new Intl.DateTimeFormat(undefined, {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).format(new Date(isoTime));
	}

	return (
		<section className={styles.messageList}>
			{errorMessage ? (
				<Alert description={errorMessage} type="error" showIcon={true} />
			) : null}
			{isLoading ? (
				<Spin className={styles.loadingIcon} />
			) : blocks.map((block) => {
					if (block.type === "user") {
						return <UserBubble
							key={block.id}
							message={block.content}
							sentTime={formatTime(block.sentAtUtc)}
						/>
					}

					return (
						<AssistantBubble
							key={block.id}
							bodyParts={block.bodyParts}
							message={getAssistantMarkdown(block)}
							endTime={formatTime(block.completedAtUtc)}
						/>
					);
				})
			}
		</section>
	)
}

export default MessageList;