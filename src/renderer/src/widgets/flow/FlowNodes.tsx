import { Button, Tag, Typography } from "antd";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { ConversationFlowNode } from "@/platform/rpc/types";
import styles from "./HomeFlowSurface.module.css";

export type FlowNodeData = {
	flowNode: ConversationFlowNode;
	active: boolean;
	disabled: boolean;
	onOpen: (node: ConversationFlowNode) => void;
	onDerive: (node: ConversationFlowNode) => void;
};

export type FlowCanvasNode = Node<FlowNodeData, "userNode" | "assistantNode">;

function FlowNodeCard({ data }: NodeProps<FlowCanvasNode>): React.JSX.Element {
	const { t } = useTranslation();
	const { flowNode } = data;
	const canDerive: boolean = flowNode.role === "user"
		? flowNode.status === "completed"
		: ["completed", "failed", "stopped"].includes(flowNode.status) && flowNode.contentPreview.length > 0;
	return (
		<article
			className={`${styles.nodeCard} ${data.active ? styles.nodeCardActive : ""}`}
			data-flow-node-id={flowNode.nodeId}
			data-role={flowNode.role}
			data-status={flowNode.status}
			onDoubleClick={(): void => data.onOpen(flowNode)}
		>
			<Handle type="target" position={Position.Left} isConnectable={false} className={styles.nodeHandle} />
			<header className={styles.nodeHeader}>
				<span className={styles.nodeRole}>
					<Icon name={flowNode.role === "user" ? "user" : "agent"} />
					{t(flowNode.role === "user" ? "flow.nodes.user" : "flow.nodes.assistant")}
				</span>
				<Tag bordered={false} color={flowNode.status === "failed" ? "error" : flowNode.status === "completed" ? "success" : "processing"}>
					{t(`flow.status.${flowNode.status}`)}
				</Tag>
			</header>
			<Typography.Paragraph className={styles.nodePreview} ellipsis={{ rows: 5 }}>
				{flowNode.contentPreview || t("flow.nodes.emptyResponse")}
			</Typography.Paragraph>
			<footer className={styles.nodeActions}>
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
