import { Card, Tag, Typography } from "antd";
import type React from "react";
import type { TimelineBodyPart } from "@/platform/rpc/types";

type PluginTimelinePartValue = Extract<TimelineBodyPart, { type: "plugin_part" }>;

function safeDataPreview(data: Record<string, unknown>): string {
	try {
		return JSON.stringify(data, null, 2).slice(0, 8_000);
	} catch {
		return "[unavailable plugin data]";
	}
}

export default function PluginTimelinePart({ part }: { part: PluginTimelinePartValue }): React.JSX.Element {
	const title: string = part.title?.trim() || `${part.pluginId}:${part.partType}`;
	return (
		<Card size="small" bordered={false} style={{ margin: "8px 0", background: "var(--ant-color-fill-quaternary)" }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<Typography.Text strong>{title}</Typography.Text>
				<Tag color={part.status === "error" ? "error" : part.status === "warning" ? "warning" : part.status === "success" ? "success" : "default"}>
					External plugin
				</Tag>
			</div>
			{part.summary ? <Typography.Paragraph type="secondary" style={{ margin: "4px 0" }}>{part.summary}</Typography.Paragraph> : null}
			<Typography.Paragraph copyable={{ text: safeDataPreview(part.data) }} style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", fontFamily: "var(--daedalus-code-font-family, monospace)" }}>
				{safeDataPreview(part.data)}
			</Typography.Paragraph>
		</Card>
	);
}
