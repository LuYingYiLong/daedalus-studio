import styles from "./AssistantBubble.module.css";
import { Button, Collapse, Divider, Tooltip, Typography } from "antd";
import { Icon } from "@/assets/icons";
import { TimelineBodyPart } from "@/api/types";
import React from "react";
import { useTranslation } from "react-i18next";
import ToolPart from "./ToolPart";
import TerminalPart, { isTerminalCommandPart } from "./TerminalPart";
import StatusPart from "./StatusPart";
import PlanPart from "./PlanPart";
import InlineDiffPart from "./InlineDiffPart";
import ThinkingPart from "./ThinkingPart";
import ImageGenerationPart from "./ImageGenerationPart";
import ProviderReconnectPart from "./ProviderReconnectPart";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import MarkdownContent from "../markdown/MarkdownContent";
import { useTimelineDisclosure } from "./timeline-disclosure-state";

export type AssistantBubbleProps = {
	entryId?: string;
	requestId?: string;
	searchBlockOffset?: number;
	content?: string;
	bodyParts?: TimelineBodyPart[];
	message?: string;
	elapsedTime?: string;
	completionStatus?: "responded" | "stopped";
	endTime?: string;
	streaming?: boolean;
	selectionEnabled?: boolean;
	hideInlineDiff?: boolean;
	onInlineDiffReview?: () => void;
	onTerminalWheelPassThrough?: (deltaY: number) => void;
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

function AssistantBubble({ entryId, requestId, searchBlockOffset, content, bodyParts, message, elapsedTime, completionStatus, endTime, streaming = false, selectionEnabled = false, hideInlineDiff = false, onInlineDiffReview, onTerminalWheelPassThrough }: AssistantBubbleProps): React.JSX.Element {
	const { t } = useTranslation();
	const [copied, setCopied] = React.useState<boolean>(false);
	const disclosurePrefix: string = entryId ?? "assistant";
	const [summaryOpen, setSummaryOpen] = useTimelineDisclosure(`${disclosurePrefix}:summary`, false);
	const timingLabel: string | undefined = elapsedTime === undefined
		? undefined
		: completionStatus === "stopped"
			? t("chat.assistant.stoppedIn", { elapsed: elapsedTime })
			: completionStatus === "responded"
				? t("chat.assistant.respondedIn", { elapsed: elapsedTime })
				: elapsedTime;

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
				<div
					key={index}
					className={`${styles.markdownPart} markdown-body`}
					data-chat-search-text="true"
					data-chat-search-block-offset={searchBlockOffset}
					data-message-selection-enabled={selectionEnabled}
					data-message-selection-entry-id={entryId}
					data-message-selection-request-id={requestId}
					data-message-selection-role="assistant"
					data-message-selection-segment={`assistant:markdown:${index}`}
				>
					<MarkdownContent streaming={streaming} stickyCodeHeaders>{part.text}</MarkdownContent>
				</div>
			);
		}

		if (part.type === "thinking") {
			return part.text.trim().length > 0
				? <ThinkingPart key={index} part={part} disclosureKey={`${disclosurePrefix}:thinking:${index}`} />
				: null;
		}

		if (part.type === "tool") {
			return isTerminalCommandPart(part)
				? <TerminalPart key={index} part={part} disclosureKey={`${disclosurePrefix}:tool:${index}`} onScrollWheelPassThrough={onTerminalWheelPassThrough} />
				: <ToolPart key={index} part={part} disclosureKey={`${disclosurePrefix}:tool:${index}`} />
		}

		if (part.type === "provider_reconnect") {
			return (
				<ProviderReconnectPart
					key={part.reconnectId}
					part={part}
					disclosureKey={`${disclosurePrefix}:provider-reconnect:${part.reconnectId}`}
					streaming={streaming}
				/>
			);
		}

		if (part.type === "status") {
			return <StatusPart key={index} part={part} />
		}

		if (part.type === "plan") {
			return <PlanPart key={index} part={part} />
		}

		if (part.type === "inline_diff") {
			return hideInlineDiff ? null : <InlineDiffPart key={index} part={part} onReview={onInlineDiffReview} />
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
						destroyOnHidden={true}
						activeKey={summaryOpen ? [summaryStartPart.stepRunId || "summary-process"] : []}
						onChange={(keys: string | string[]): void => {
							setSummaryOpen((Array.isArray(keys) ? keys : [keys]).length > 0);
						}}
						expandIcon={({ isActive }) => (
							<span className={`collapseExpandIcon ${isActive ? "collapseExpandIconActive" : ""}`}>
								<Icon name="arrow-down" />
							</span>
						)}
						items={[
							{
								key: summaryStartPart.stepRunId || "summary-process",
								label: summaryStartPart.foldTitle || t("chat.assistant.process"),
								children: <div className={styles.summaryContent}>{foldedChildren}</div>
							}
						]}
					/>
				) : null}
				{visibleParts.map(renderBodyPart)}
			</>
		);
	}

	return (
		<article id={entryId} className={styles.root} data-entry-id={entryId} data-entry-kind="assistant">
			{timingLabel !== undefined ? (
				<div className={styles.timingRow}>
					<Typography.Text type="secondary">{timingLabel}</Typography.Text>
					<Divider size="small" className={styles.antDivider} />
				</div>
			) : null}
			<div className={styles.content}>
				{bodyParts ? (
					renderBodyParts(bodyParts)
				) : (
					<div
						data-chat-search-text="true"
						data-chat-search-block-offset={searchBlockOffset}
						data-message-selection-enabled={selectionEnabled}
						data-message-selection-entry-id={entryId}
						data-message-selection-request-id={requestId}
						data-message-selection-role="assistant"
						data-message-selection-segment="assistant:content"
					>
						<MarkdownContent streaming={streaming} stickyCodeHeaders>{message ?? content ?? ""}</MarkdownContent>
					</div>
				)}
			</div>
			<div className={styles.toolbar}>
				<Tooltip title={copied ? t("chat.common.copied") : t("chat.common.copy")}>
					<Button
						type="text"
						size="small"
						shape="circle"
						aria-label={t("chat.assistant.copyAria")}
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

export default React.memo(AssistantBubble);
