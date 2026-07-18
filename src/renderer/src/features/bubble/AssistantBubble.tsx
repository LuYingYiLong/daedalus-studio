import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./AssistantBubble.module.css";
import { Button, Collapse, Divider, Tooltip, Typography } from "antd";
import { Icon } from "@/assets/icons";
import { TimelineBodyPart } from "@/api/types";
import React from "react";
import ToolPart from "../chat/ToolPart";
import StatusPart from "../chat/StatusPart";
import PlanPart from "../chat/PlanPart";
import InlineDiffPart from "../chat/InlineDiffPart";
import ThinkingPart from "../chat/ThinkingPart";
import ImageGenerationPart from "../chat/ImageGenerationPart";
import { copyTextToClipboard } from "@/utils/clipboard";

export type AssistantBubbleProps = {
	entryId?: string;
	content?: string;
	bodyParts?: TimelineBodyPart[];
	message?: string;
	elapsedTime?: string;
	endTime?: string;
};

function createAssistantCopyText(message?: string, content?: string, bodyParts?: TimelineBodyPart[]): string {
	const explicitText: string = message ?? content ?? "";
	if (explicitText.trim().length > 0) {
		return explicitText;
	}

	if (bodyParts === undefined) {
		return "";
	}

	return bodyParts
		.map((part: TimelineBodyPart): string => {
			if (part.type === "markdown") {
				return part.text;
			}
			if (part.type === "plan") {
				return part.previewMarkdown;
			}
			if (part.type === "image_generation") {
				return part.prompt;
			}
			if (part.type === "status") {
				return [part.title, part.details].filter((text: string): boolean => text.trim().length > 0).join("\n");
			}
			return "";
		})
		.filter((text: string): boolean => text.trim().length > 0)
		.join("\n\n");
}

function AssistantBubble({ entryId, content, bodyParts, message, elapsedTime, endTime }: AssistantBubbleProps): React.JSX.Element {
	const [copied, setCopied] = React.useState<boolean>(false);

	async function copyMessage(): Promise<void> {
		try {
			await copyTextToClipboard(createAssistantCopyText(message, content, bodyParts));
			setCopied(true);
			window.setTimeout((): void => setCopied(false), 1200);
		} catch (error: unknown) {
			console.error("[AssistantBubble] copy failed", error);
		}
	}

	function renderBodyPart(part: TimelineBodyPart, index: number): React.ReactNode {
		if (part.type === "markdown") {
			return (
				<div key={index} className={`${styles.markdownPart} markdown-body`}>
					<Markdown remarkPlugins={[remarkGfm]}>
						{part.text}
					</Markdown>
				</div>
			);
		}

		if (part.type === "thinking" && part.text.trim().length > 0) {
			return <ThinkingPart key={index} part={part} />
		}

		if (part.type === "tool") {
			return <ToolPart key={index} part={part} />
		}

		if (part.type === "status") {
			return <StatusPart key={index} part={part} />
		}

		if (part.type === "plan") {
			return <PlanPart key={index} part={part} />
		}

		if (part.type === "inline_diff") {
			return <InlineDiffPart key={index} part={part} />
		}

		if (part.type === "image_generation") {
			return <ImageGenerationPart key={index} part={part} />
		}

		if (part.type === "summary_start") {
			return null;
		}

		return (
			<pre key={index} className={styles.unknownPart}>
				{JSON.stringify(part, null, 2)}
			</pre>
		);
	}

	function renderBodyParts(parts: TimelineBodyPart[]): React.ReactNode {
		const summaryStartIndex: number = parts.findIndex((part: TimelineBodyPart): boolean => part.type === "summary_start");

		if (summaryStartIndex < 0) {
			return parts.map(renderBodyPart);
		}

		const summaryStartPart: Extract<TimelineBodyPart, { type: "summary_start" }> = parts[summaryStartIndex] as Extract<TimelineBodyPart, { type: "summary_start" }>;
		const foldedParts: TimelineBodyPart[] = parts.slice(0, summaryStartIndex);
		const visibleParts: TimelineBodyPart[] = parts.slice(summaryStartIndex + 1);
		const foldedChildren: React.ReactNode[] = foldedParts.map(renderBodyPart).filter((child: React.ReactNode): boolean => child !== null && child !== undefined);

		return (
			<>
				{foldedChildren.length > 0 ? (
					<Collapse
						size="small"
						className={styles.summaryCollapse}
						bordered={false}
						defaultActiveKey={[]}
						items={[
							{
								key: summaryStartPart.stepRunId || "summary-process",
								label: summaryStartPart.foldTitle || "Process",
								children: foldedChildren
							}
						]}
					/>
				) : null}
				{visibleParts.map(renderBodyPart)}
			</>
		);
	}

	return (
		<article className={styles.root} data-entry-id={entryId}>
			{elapsedTime !== undefined ? (
				<div className={styles.timingRow}>
					<Typography.Text type="secondary">{elapsedTime}</Typography.Text>
					<Divider size="small" className={styles.antDivider} />
				</div>
			) : null}
			<div className={styles.content}>
				{bodyParts ? (
					renderBodyParts(bodyParts)
				) : (
					<div className="markdown-body">
						<Markdown remarkPlugins={[remarkGfm]}>
							{message ?? content ?? ""}
						</Markdown>
					</div>
				)}
			</div>
			<div className={styles.toolbar}>
				<Tooltip title={copied ? "Copied" : "Copy"}>
					<Button
						type="text"
						size="small"
						aria-label="Copy assistant message"
						icon={<Icon name="copy" />}
						onClick={(): void => {
							void copyMessage();
						}}
					/>
				</Tooltip>
				{endTime ? (
					<Typography.Text type="secondary">{endTime}</Typography.Text>
				) : null}
			</div>
		</article>
	);
}

export default AssistantBubble;
