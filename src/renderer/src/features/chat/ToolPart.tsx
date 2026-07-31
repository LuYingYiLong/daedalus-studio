import { TimelineBodyPart } from "@/api/types";
import styles from "./ToolPart.module.css"
import { Icon } from "@/assets/icons";
import { Collapse, Tag } from "antd";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getToolDisplayInfo } from "./tool-display";
import { useTimelineDisclosure } from "./timeline-disclosure-state";

export type TimelineToolPart = Extract<TimelineBodyPart, { type: "tool" }>;

type ToolStatus = "running" | "success" | "error" | "approval";

function hasEventType(events: Record<string, unknown>[], eventTypes: string[]): boolean {
	return events.some((event: Record<string, unknown>): boolean => typeof event.type === "string" && eventTypes.includes(event.type));
}

function getToolStatus(events: Record<string, unknown>[]): ToolStatus {
	if (hasEventType(events, ["tool.error"])) {
		return "error";
	}

	if (hasEventType(events, ["tool.result"])) {
		return "success";
	}

	if (hasEventType(events, ["tool.approved", "tool.call", "tool.progress"])) {
		return "running";
	}

	if (hasEventType(events, ["tool.approval_required"])) {
		return "approval";
	}

	return "running";
}

export type ToolPartProps = {
	part: TimelineToolPart;
	disclosureKey?: string;
}

function ToolPart({ part, disclosureKey = "tool" }: ToolPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, false);
	const toolDisplay = getToolDisplayInfo(part.events);
	const status = getToolStatus(part.events);
	const statusText: Record<ToolStatus, string> = {
		running: t("chat.tool.status.running"),
		success: t("chat.tool.status.done"),
		error: t("chat.tool.status.failed"),
		approval: t("chat.tool.status.approvalRequired"),
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
	const eventJson: string = useMemo((): string => {
		return open ? JSON.stringify(part.events, null, 2) : "";
	}, [open, part.events]);
	
	return (
		<Collapse
			size="small"
			bordered={false}
			destroyOnHidden={true}
			activeKey={open ? ["tool"] : []}
			onChange={(keys: string | string[]): void => {
				setOpen((Array.isArray(keys) ? keys : [keys]).includes("tool"));
			}}
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
							{eventJson}
						</pre>
					),
					extra: genStatusTag()
				}
			]}
		/>
	);
}

export default React.memo(ToolPart);
