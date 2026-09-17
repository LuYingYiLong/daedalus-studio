import { Button, Typography } from "antd";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { ConversationFlowNode } from "@/platform/rpc/types";
import styles from "./FlowNodes.module.css";

function parseRgbColor(color: string): [number, number, number, number] | null {
	const match = color.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[, /]+\s*([\d.]+))?\s*\)$/u);
	if (match === null) return null;
	const alpha: number = match[4] === undefined ? 1 : Number(match[4]);
	return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
}

function getContrastingTextColor(backgroundColor: string): "#000000" | "#ffffff" {
	const rgb: [number, number, number, number] | null = parseRgbColor(backgroundColor);
	if (rgb === null) return "#ffffff";
	const channels: number[] = rgb.slice(0, 3).map((channel: number): number => channel / 255);
	const alpha: number = rgb[3];
	const compositedChannels: number[] = channels.map((channel: number): number => channel * alpha + (1 - alpha));
	const luminance: number = compositedChannels
		.map((channel: number): number => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
		.reduce(
			(sum: number, channel: number, index: number): number => sum + channel * [0.2126, 0.7152, 0.0722][index],
			0,
		);
	const blackContrast: number = (luminance + 0.05) / 0.05;
	const whiteContrast: number = 1.05 / (luminance + 0.05);
	return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}

export type FlowNodeData = {
	flowNode: ConversationFlowNode;
	active: boolean;
	matched: boolean;
	disabled: boolean;
	onOpen: (node: ConversationFlowNode) => void;
	onDerive: (node: ConversationFlowNode) => void;
};

export type FlowCanvasNode = Node<FlowNodeData, "userNode" | "assistantNode">;

function FlowNodeCard({ data }: NodeProps<FlowCanvasNode>): React.JSX.Element {
	const { t } = useTranslation();
	const { flowNode } = data;
	const headerRef = useRef<HTMLElement | null>(null);
	const [headerTextColor, setHeaderTextColor] = useState<"#000000" | "#ffffff">("#ffffff");
	useLayoutEffect((): (() => void) => {
		const header: HTMLElement | null = headerRef.current;
		if (header === null) return (): void => undefined;
		const updateTextColor = (): void => {
			setHeaderTextColor(getContrastingTextColor(window.getComputedStyle(header).backgroundColor));
		};
		updateTextColor();
		const observer: MutationObserver = new MutationObserver(updateTextColor);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme", "data-theme-variant"],
		});
		return (): void => observer.disconnect();
	}, [flowNode.role]);
	const updatedAtTimestamp: number = Date.parse(flowNode.updatedAt);
	const updatedAtLabel: string = Number.isNaN(updatedAtTimestamp)
		? ""
		: new Intl.DateTimeFormat(undefined, {
				hour: "2-digit",
				minute: "2-digit",
			}).format(updatedAtTimestamp);
	const canDerive: boolean =
		flowNode.role === "user"
			? flowNode.status === "completed"
			: ["completed", "failed", "stopped"].includes(flowNode.status) && flowNode.contentPreview.length > 0;
	return (
		<article
			className={`${styles.nodeCard} ${data.active ? styles.nodeCardActive : ""} ${data.matched ? styles.nodeCardMatched : ""}`}
			data-flow-node-id={flowNode.nodeId}
			data-role={flowNode.role}
			data-status={flowNode.status}
			onDoubleClick={(): void => data.onOpen(flowNode)}
		>
			<Handle type="target" position={Position.Left} isConnectable={false} className={styles.nodeHandle} />
			<header
				ref={headerRef}
				className={styles.header}
				data-role={flowNode.role}
				style={{ color: headerTextColor }}
			>
				<span className={styles.role}>
					<Icon name={flowNode.role === "user" ? "user" : "agent"} />
					{t(flowNode.role === "user" ? "flow.nodes.user" : "flow.nodes.assistant")}
				</span>
			</header>
			<div className={styles.body}>
				<Typography.Text className={styles.nodeMeta} type="secondary">
					{updatedAtLabel}
				</Typography.Text>
				<Typography.Paragraph
					className={styles.nodePreview}
					data-chat-search-text="true"
					ellipsis={{ rows: 4 }}
				>
					{flowNode.contentPreview || t("flow.nodes.emptyResponse")}
				</Typography.Paragraph>
			</div>
			<footer className={styles.footer}>
				<Button type="text" size="small" onClick={(): void => data.onOpen(flowNode)}>
					{t("flow.actions.details")}
				</Button>
				<Button
					type="text"
					size="small"
					icon={<Icon name="fork" />}
					disabled={!canDerive || data.disabled}
					aria-label={t(flowNode.role === "user" ? "flow.actions.regenerate" : "flow.actions.derive")}
					onClick={(): void => data.onDerive(flowNode)}
				>
					{t(flowNode.role === "user" ? "flow.actions.regenerate" : "flow.actions.derive")}
				</Button>
			</footer>
			<Handle type="source" position={Position.Right} isConnectable={false} className={styles.nodeHandle} />
		</article>
	);
}

export function UserFlowNode(props: NodeProps<FlowCanvasNode>): React.JSX.Element {
	return <FlowNodeCard {...props} />;
}

export function AssistantFlowNode(props: NodeProps<FlowCanvasNode>): React.JSX.Element {
	return <FlowNodeCard {...props} />;
}
