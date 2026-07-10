import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./AssistantBubble.module.css";
import { Button, Collapse, Divider, Typography } from "antd";
import { Icon } from "@/assets/icons";
import { TimelineBodyPart } from "@/api/types";
import React from "react";
import ToolPart from "../chat/ToolPart";

export type AssistantBubbleProps = {
	content?: string;
	bodyParts?: TimelineBodyPart[];
	message?: string;
	elapsedTime?: number;
	endTime?: string;
};


function AssistantBubble({ content, bodyParts, message, elapsedTime, endTime }: AssistantBubbleProps): React.JSX.Element {
	function renderBodyPart(part: TimelineBodyPart, index: number): React.ReactNode {
		if (part.type === "markdown") {
			return (
				<div key={index} className={styles.markdownPart}>
					<Markdown remarkPlugins={[remarkGfm]}>
						{part.text}
					</Markdown>
				</div>
			);
		}

		if (part.type === "thinking" && part.text.trim().length > 0) {
			return (
				<Collapse
					key={index}
					size="small"
					className={styles.thinkingCollapse}
					bordered={false}
					expandIcon={(): React.ReactNode => (
						<Icon
							name="thinking"
							style={{
								width: 16
							}}
						/>
					)}
					defaultActiveKey={part.done ? [] : ["thinking"]}
					items={[
						{
							key: "thinking",
							label: part.done ? "Thinking": "Thinking...",
							children: (
								<Markdown remarkPlugins={[remarkGfm]}>
									{part.text}
								</Markdown>
							)
						}
					]}
				/>
			)
		}

		if (part.type === "tool") {
			return <ToolPart key={index} part={part} />
		}
	}

	return (
		<article className={styles.root}>
			{elapsedTime ? (
				<div className={styles.timingRow}>
					<Typography.Text type="secondary">{elapsedTime.toString() + "s"}</Typography.Text>
					<Divider size="small" className={styles.antDivider} />
				</div>
			) : null}
			<div className={styles.content}>
				{bodyParts ? (
					bodyParts.map(renderBodyPart)
				) : (
					<Markdown remarkPlugins={[remarkGfm]}>
						{message ?? content ?? ""}
					</Markdown>
				)}
			</div>
			<div className={styles.toolbar}>
				<Button
					type="text"
					size="small"
					icon={<Icon name="copy" />}
					onClick={async () => {
						await navigator.clipboard.writeText(String(message));
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
