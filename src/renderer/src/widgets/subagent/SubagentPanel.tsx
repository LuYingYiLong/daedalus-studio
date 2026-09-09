import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Menu, Select, Spin, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	useSubagentConversationBlocks,
	subagentConversationStore,
} from "@/domain/subagent/subagent-conversation-store";
import type { SubagentGraphView } from "@/domain/subagent/subagent-graph-store";
import { subagentGraphStore, useSubagentGraphs } from "@/domain/subagent/subagent-graph-store";
import { fetchSessionTimeline } from "@/platform/rpc/session-api";
import { listSubagentGraphs } from "@/platform/rpc/subagent-api";
import { cancelSubagentGraph, retrySubagentNode } from "@/platform/rpc/subagent-api";
import type { SubagentNode, TimelineBlock, TimelineBodyPart, TimelineUserBlock } from "@/platform/rpc/types";
import MessageList from "@/widgets/conversation/MessageList";
import styles from "./SubagentPanel.module.css";

type SubagentPanelProps = { sessionId: string | null };

function statusColor(status: string): string {
	if (status === "completed" || status === "merged") return "success";
	if (status === "failed" || status === "conflicted") return "error";
	if (status === "waiting_approval" || status === "approval_required") return "warning";
	if (status === "queued") return "warning";
	if (status === "running" || status === "merging") return "processing";
	return "default";
}

function statusLabel(status: string, t: (key: string) => string): string {
	return t(`subagent.status.${status}`);
}

function nodeName(node: SubagentNode): string {
	return node.name;
}

function nodeLabel(node: SubagentNode, t: (key: string) => string): React.JSX.Element {
	return (
		<div className={styles.nodeMenuItem}>
			<div className={styles.nodeMenuTitle}>
				<Typography.Text>{nodeName(node)}</Typography.Text>
				<Tag color={statusColor(node.status)}>{statusLabel(node.status, t)}</Tag>
			</div>
		</div>
	);
}

function createObjectiveBlock(node: SubagentNode): TimelineUserBlock {
	return {
		id: `subagent:${node.graphId}:${node.nodeId}:objective`,
		type: "user",
		requestId: node.runId,
		content: node.objective,
		sentAtUtc: node.createdAt,
	};
}

function addObjectiveBlock(node: SubagentNode, blocks: readonly TimelineBlock[]): TimelineBlock[] {
	if (blocks.some((block: TimelineBlock): boolean => block.type === "user" && block.requestId === node.runId)) {
		return [...blocks];
	}
	return [createObjectiveBlock(node), ...blocks];
}

function compactConversationBlocks(blocks: readonly TimelineBlock[]): TimelineBlock[] {
	return blocks.map((block: TimelineBlock): TimelineBlock => {
		if (block.type !== "assistant") return block;
		const bodyParts: TimelineBodyPart[] = block.bodyParts.filter(
			(part: TimelineBodyPart): boolean => part.type === "markdown" || part.type === "status",
		);
		return { ...block, bodyParts };
	});
}

function graphLabel(view: SubagentGraphView, index: number, t: (key: string) => string): string {
	return `${t("subagent.graph")} ${index + 1} · ${view.snapshot.nodes.length} ${t("subagent.agents")}`;
}

export default function SubagentPanel({ sessionId }: SubagentPanelProps): React.JSX.Element {
	const { t } = useTranslation();
	const graphs: readonly SubagentGraphView[] = useSubagentGraphs(sessionId);
	const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [conversationError, setConversationError] = useState<string | null>(null);
	const [actionLoading, setActionLoading] = useState<boolean>(false);

	useEffect((): (() => void) => {
		if (sessionId === null) return (): void => undefined;
		let cancelled: boolean = false;
		setLoading(true);
		setError(null);
		setConversationError(null);
		void listSubagentGraphs(sessionId)
			.then((graphResult): Promise<void> => {
				if (cancelled) return Promise.resolve();
				subagentGraphStore.replaceSession(sessionId, graphResult.graphs);
				setLoading(false);
				return fetchSessionTimeline(sessionId, 200)
					.then((timelineResult): void => {
						if (cancelled) return;
						for (const view of graphResult.graphs) {
							for (const node of view.nodes) {
								const blocks: TimelineBlock[] = timelineResult.timelineBlocks.filter(
									(block: TimelineBlock): boolean => block.requestId === node.runId,
								);
								subagentConversationStore.replaceBlocks(
									sessionId,
									view.graph.graphId,
									node.nodeId,
									blocks,
								);
							}
						}
					})
					.catch((reason: unknown): void => {
						if (!cancelled)
							setConversationError(
								reason instanceof Error ? reason.message : t("subagent.conversationLoadFailed"),
							);
					});
			})
			.catch((reason: unknown): void => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : t("subagent.loadFailed"));
			})
			.finally((): void => {
				if (!cancelled) setLoading(false);
			});
		return (): void => {
			cancelled = true;
		};
	}, [sessionId, t]);

	const selectedGraph: SubagentGraphView | undefined =
		graphs.find((view: SubagentGraphView): boolean => view.snapshot.graph.graphId === selectedGraphId) ?? graphs[0];
	const selectedNode: SubagentNode | undefined =
		selectedGraph?.snapshot.nodes.find((node: SubagentNode): boolean => node.nodeId === selectedNodeId) ??
		selectedGraph?.snapshot.nodes[0];
	const graphOptions = useMemo(
		(): Array<{ value: string; label: string }> =>
			graphs.map((view: SubagentGraphView, index: number): { value: string; label: string } => ({
				value: view.snapshot.graph.graphId,
				label: graphLabel(view, index, t),
			})),
		[graphs, t],
	);
	const nodeItems: MenuProps["items"] = useMemo(
		(): MenuProps["items"] =>
			selectedGraph?.snapshot.nodes.map((node: SubagentNode) => ({
				key: node.nodeId,
				label: nodeLabel(node, t),
			})) ?? [],
		[selectedGraph, t],
	);
	const conversationBlocks: readonly TimelineBlock[] = useSubagentConversationBlocks(
		sessionId,
		selectedGraph?.snapshot.graph.graphId ?? null,
		selectedNode?.nodeId ?? null,
	);
	const messageBlocks: TimelineBlock[] = useMemo(
		(): TimelineBlock[] =>
			selectedNode === undefined
				? []
				: compactConversationBlocks(addObjectiveBlock(selectedNode, conversationBlocks)),
		[conversationBlocks, selectedNode],
	);

	useEffect((): void => {
		if (selectedGraph !== undefined && selectedGraph.snapshot.graph.graphId !== selectedGraphId) {
			setSelectedGraphId(selectedGraph.snapshot.graph.graphId);
		}
		if (selectedNode !== undefined && selectedNode.nodeId !== selectedNodeId) {
			setSelectedNodeId(selectedNode.nodeId);
		}
	}, [selectedGraph, selectedGraphId, selectedNode, selectedNodeId]);

	if (sessionId === null) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("subagent.noSession")} />;
	if (loading && graphs.length === 0) {
		return (
			<div className={styles.loading}>
				<Spin size="small" />
				{t("subagent.loading")}
			</div>
		);
	}
	if (graphs.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("subagent.empty")} />;

	const totalAgents: number = graphs.reduce(
		(total: number, view: SubagentGraphView): number => total + view.snapshot.nodes.length,
		0,
	);
	const runningCount: number = graphs.reduce(
		(total: number, view: SubagentGraphView): number =>
			total + view.snapshot.nodes.filter((node: SubagentNode): boolean => node.status === "running").length,
		0,
	);
	const waitingCount: number = graphs.reduce(
		(total: number, view: SubagentGraphView): number =>
			total +
			view.snapshot.nodes.filter((node: SubagentNode): boolean => node.status === "waiting_approval").length,
		0,
	);
	const queuedCount: number = graphs.reduce(
		(total: number, view: SubagentGraphView): number =>
			total + view.snapshot.nodes.filter((node: SubagentNode): boolean => node.status === "queued").length,
		0,
	);
	const failedCount: number = graphs.reduce(
		(total: number, view: SubagentGraphView): number =>
			total +
			view.snapshot.nodes.filter(
				(node: SubagentNode): boolean => node.status === "failed" || node.status === "blocked",
			).length,
		0,
	);
	const graphTerminal: boolean = ["completed", "completed_with_warnings", "failed", "cancelled"].includes(
		selectedGraph?.snapshot.graph.status ?? "",
	);
	const nodeRetryable: boolean =
		selectedNode !== undefined && ["failed", "blocked", "cancelled"].includes(selectedNode.status);
	const nodeCancellable: boolean =
		selectedNode !== undefined &&
		["pending", "ready", "queued", "running", "waiting_approval"].includes(selectedNode.status);
	const runSubagentAction = async (action: () => Promise<unknown>): Promise<void> => {
		setActionLoading(true);
		setError(null);
		try {
			const result = await action();
			if (
				sessionId !== null &&
				typeof result === "object" &&
				result !== null &&
				"graph" in result &&
				"nodes" in result
			) {
				subagentGraphStore.replaceSession(sessionId, [
					result as Parameters<typeof subagentGraphStore.replaceSession>[1][number],
				]);
			}
		} catch (reason: unknown) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setActionLoading(false);
		}
	};

	return (
		<section className={styles.panel} data-testid="subagent-panel">
			<header className={styles.header}>
				<div className={styles.headerTitle}>
					<Typography.Text type="secondary">
						{t("subagent.summary", {
							total: totalAgents,
							running: runningCount,
							queued: queuedCount,
							waiting: waitingCount,
							failed: failedCount,
						})}
					</Typography.Text>
				</div>
				<Space size={4}>
					{nodeRetryable && selectedGraph !== undefined && selectedNode !== undefined ? (
						<Button
							size="small"
							loading={actionLoading}
							onClick={(): void => {
								void runSubagentAction(() =>
									retrySubagentNode(selectedGraph.snapshot.graph.graphId, selectedNode.nodeId),
								);
							}}
						>
							{t("subagent.actions.retry")}
						</Button>
					) : null}
					{nodeCancellable && selectedGraph !== undefined && selectedNode !== undefined ? (
						<Button
							size="small"
							danger
							loading={actionLoading}
							onClick={(): void => {
								void runSubagentAction(() =>
									cancelSubagentGraph(selectedGraph.snapshot.graph.graphId, selectedNode.nodeId),
								);
							}}
						>
							{t("subagent.actions.cancel")}
						</Button>
					) : null}
					{!graphTerminal && selectedGraph !== undefined ? (
						<Button
							size="small"
							danger
							loading={actionLoading}
							onClick={(): void => {
								void runSubagentAction(() => cancelSubagentGraph(selectedGraph.snapshot.graph.graphId));
							}}
						>
							{t("subagent.actions.cancelGraph")}
						</Button>
					) : null}
				</Space>
				{selectedGraph !== undefined && graphs.length > 1 ? (
					<Select
						size="small"
						value={selectedGraph.snapshot.graph.graphId}
						options={graphOptions}
						onChange={(value: string): void => {
							setSelectedGraphId(value);
							setSelectedNodeId(null);
						}}
						className={styles.graphSelect}
					/>
				) : null}
			</header>
			{error !== null ? <Alert type="warning" showIcon title={error} className={styles.alert} /> : null}
			{conversationError !== null ? (
				<Alert type="info" showIcon title={conversationError} className={styles.alert} />
			) : null}
			<div className={styles.body}>
				<main className={styles.conversationPane}>
					{selectedNode === undefined ? (
						<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("subagent.noNode")} />
					) : (
						<MessageList
							key={`${selectedGraph?.snapshot.graph.graphId ?? ""}:${selectedNode.nodeId}`}
							blocks={messageBlocks}
							isLoading={conversationBlocks.length === 0 && loading}
							errorMessage={conversationError}
							hideInlineDiff={true}
						/>
					)}
				</main>
				<aside className={styles.nodeList}>
					{selectedGraph !== undefined ? (
						<div className={styles.graphStatus}>
							<Typography.Text type="secondary">
								{selectedGraph.snapshot.nodes.length} {t("subagent.agents")}
							</Typography.Text>
							<Tag color={statusColor(selectedGraph.snapshot.graph.status)}>
								{statusLabel(selectedGraph.snapshot.graph.status, t)}
							</Tag>
						</div>
					) : null}
					{selectedNode?.status === "queued" && selectedNode.queueReason !== null ? (
						<Typography.Text type="secondary" className={styles.queueHint}>
							{t(`subagent.queueReasons.${selectedNode.queueReason}`)}
						</Typography.Text>
					) : null}
					<Menu
						mode="inline"
						selectedKeys={selectedNode === undefined ? [] : [selectedNode.nodeId]}
						items={nodeItems}
						onClick={({ key }): void => setSelectedNodeId(key)}
						className={styles.subagentMenu}
					/>
				</aside>
			</div>
		</section>
	);
}
