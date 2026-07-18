import { TimelineBodyPart } from "@/api/types";
import styles from "./ToolPart.module.css"
import { Icon } from "@/assets/icons";
import { Collapse, Tag } from "antd";
import React from "react";

export type TimelineToolPart = Extract<TimelineBodyPart, { type: "tool" }>;

type ToolStatus = "running" | "success" | "error" | "approval";

function getToolName(events: Record<string, unknown>[]): string {
	for (const event of events) {
		if (typeof event.toolName === "string") {
			return event.toolName;
		}
	}

	return "Tool";
}

function getToolStatus(events: Record<string, unknown>[]): "running" | "success" | "error" | "approval" {
	if (events.some((event) => event.type === "agent.tool.error" || event.type === "tool.error")) {
		return "error";
	}

	if (events.some((event) => event.type === "agent.tool.approval_required" || event.type === "tool.approval_required")) {
		return "approval";
	}

	if (events.some((event) => event.type === "agent.tool.result" || event.type === "tool.result")) {
		return "success";
	}

	return "running";
}

export type ToolPartProps = {
	part: TimelineToolPart
}


function ToolPart({ part }: ToolPartProps): React.JSX.Element {
	const toolName: string = getToolName(part.events);
	const status = getToolStatus(part.events);
	const statusText: Record<ToolStatus, string> = {
		running: "Running",
		success: "Done",
		error: "Failed",
		approval: "Approval required",
	}
	const genStatusTag = () => (
		<Tag color={
			statusText[status] === "Running" ? "lime" :
			statusText[status] === "Done" ? "green" :
			statusText[status] === "Failed" ? "red" :
			statusText[status] === "Approval required" ? "green" :
			""
		}>
			{statusText[status]}
		</Tag>
	)
	
	return (
		<Collapse
			size="small"
			bordered={false}
			className={styles.toolCollapse}
			expandIcon={(): React.ReactNode => (
				<Icon
					name="mcp"
					style={{
						width: 16
					}}
				/>
			)}
			items={[
				{
					key: "tool",
					label: toolName,
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

export default ToolPart;
