import { TimelineBodyPart } from "@/api/types";
import styles from "./ToolPart.module.css"
import { Icon } from "@/assets/icons";
import { Collapse, Tag } from "antd";
import React from "react";
import { getToolDisplayInfo } from "./tool-display";

export type TimelineToolPart = Extract<TimelineBodyPart, { type: "tool" }>;

type ToolStatus = "running" | "success" | "error" | "approval";

function hasEventType(events: Record<string, unknown>[], eventTypes: string[]): boolean {
	return events.some((event: Record<string, unknown>): boolean => typeof event.type === "string" && eventTypes.includes(event.type));
}

function getToolStatus(events: Record<string, unknown>[]): ToolStatus {
	if (hasEventType(events, ["agent.tool.error", "tool.error"])) {
		return "error";
	}

	if (hasEventType(events, ["agent.tool.result", "tool.result"])) {
		return "success";
	}

	if (hasEventType(events, ["agent.tool.approved", "tool.approved", "agent.tool.call", "tool.call", "agent.tool.progress", "tool.progress"])) {
		return "running";
	}

	if (hasEventType(events, ["agent.tool.approval_required", "tool.approval_required"])) {
		return "approval";
	}

	return "running";
}

export type ToolPartProps = {
	part: TimelineToolPart
}


function ToolPart({ part }: ToolPartProps): React.JSX.Element {
	const toolDisplay = getToolDisplayInfo(part.events);
	const status = getToolStatus(part.events);
	const statusText: Record<ToolStatus, string> = {
		running: "Running",
		success: "Done",
		error: "Failed",
		approval: "Approval required",
	}
	const statusColor: Record<ToolStatus, string> = {
		running: "lime",
		success: "green",
		error: "red",
		approval: "gold"
	}
	const genStatusTag = () => (
		<Tag color={statusColor[status]}>
			{statusText[status]}
		</Tag>
	)
	const label = (
		<span className={styles.toolLabel} title={toolDisplay.label}>
			<span className={styles.toolLabelText}>{toolDisplay.label}</span>
		</span>
	);
	
	return (
		<Collapse
			size="small"
			bordered={false}
			
			className={styles.toolCollapse}
			expandIcon={() => (
				<Icon name={toolDisplay.iconName} className={styles.toolIcon} />
			)}
			items={[
				{
					key: "tool",
					label,
					children: (
						<pre className={styles.eventJson}>
							{JSON.stringify(part.events, null, 2)}
						</pre>
					),
					extra: genStatusTag()
				}
			]}
		/>
	);
}

export default React.memo(ToolPart);
