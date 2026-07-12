import { TimelineAssistantBlock, TimelineBlock } from "@/api/types";
import AssistantBubble from "../bubble/AssistantBubble";
import UserBubble from "../bubble/UserBubble";
import styles from "./MessageList.module.css";
import { formatElapsedTime, formatShortDateTime } from "@/utils/time-format";
import { Spin, Alert } from "antd";
import { useEffect, useRef, useState } from "react";

export type MessageListProps = {
	blocks: TimelineBlock[];
	isLoading?: boolean;
	errorMessage?: string | null;
}

function getAssistantMarkdown(block: TimelineAssistantBlock): string {
		const markdown: string = block.bodyParts
			.filter((part) => part.type === "markdown")
			.map((part) => part.text)
			.join("");
		
		return markdown.length > 0 ? markdown : block.content;
	}

function MessageList({ blocks, isLoading, errorMessage }: MessageListProps): React.JSX.Element {
	const listRef = useRef<HTMLElement | null>(null);
	const [nowMs, setNowMs] = useState<number>(() => Date.now());
	const hasRunningAssistantBlock: boolean = blocks.some((block: TimelineBlock): boolean => {
		return block.type === "assistant" && block.status === "running";
	});

	useEffect((): void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null) {
			return;
		}

		element.scrollTo({
			top: element.scrollHeight,
			behavior: "smooth"
		});
	}, [blocks, isLoading, errorMessage]);

	useEffect((): (() => void) | void => {
		if (!hasRunningAssistantBlock) {
			return;
		}

		setNowMs(Date.now());

		const timerId: number = window.setInterval((): void => {
			setNowMs(Date.now());
		}, 1000);

		return (): void => {
			window.clearInterval(timerId);
		};
	}, [hasRunningAssistantBlock]);

	const nowIsoTime: string = new Date(nowMs).toISOString();

	return (
		<section ref={listRef} className={styles.messageList}>
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
							sentTime={formatShortDateTime(block.sentAtUtc)}
						/>
					}

					return (
						<AssistantBubble
							key={block.id}
							bodyParts={block.bodyParts}
							message={getAssistantMarkdown(block)}
							elapsedTime={formatElapsedTime(
								block.startedAtUtc,
								block.status === "running" ? nowIsoTime : block.completedAtUtc
							) ?? undefined}
							endTime={block.status === "running" ? undefined : formatShortDateTime(block.completedAtUtc)}
						/>
					);
				})
			}
		</section>
	)
}

export default MessageList;
