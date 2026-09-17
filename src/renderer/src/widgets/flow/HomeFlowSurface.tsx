import { Alert, Button, Divider, Dropdown, Flex, Spin, Tooltip, Typography } from "antd";
import type { InputRef } from "antd";
import { Background, Controls, MiniMap, ReactFlow, type Connection, type Edge, type NodeChange, type OnNodeDrag, type ReactFlowInstance, applyNodeChanges } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import ConversationSearchPanel from "@/widgets/conversation/ConversationSearchPanel";
import type { HomeFlowController } from "@/features/home/flow/useHomeFlowController";
import type { FlowDocumentNode } from "@/platform/rpc/types";
import FlowWelcome from "./FlowWelcome";
import { FlowDocumentNodeView, type FlowCanvasNode } from "./FlowNodes";
import styles from "./HomeFlowSurface.module.css";

export type FlowSearchHandle = { openSearch: (selectedQuery?: string) => void; closeSearch: () => boolean };
export type HomeFlowSurfaceProps = {
	controller: HomeFlowController;
	searchHandleRef?: MutableRefObject<FlowSearchHandle | null>;
	chatSurfaceProps?: unknown;
};

const nodeTypes = { flowNode: FlowDocumentNodeView };

const FLOW_NODE_WIDTH = 320;
const FLOW_NODE_HEIGHT = 220;
const FLOW_NODE_GAP = 28;

function intersectsNode(
	left: { x: number; y: number; width: number; height: number },
	right: { x: number; y: number; width: number; height: number },
): boolean {
	return left.x < right.x + right.width + FLOW_NODE_GAP &&
		left.x + left.width + FLOW_NODE_GAP > right.x &&
		left.y < right.y + right.height + FLOW_NODE_GAP &&
		left.y + left.height + FLOW_NODE_GAP > right.y;
}

function resolveNodePositions(flowNodes: readonly FlowDocumentNode[]): Map<string, { x: number; y: number }> {
	const resolved: Array<{ x: number; y: number; width: number; height: number }> = [];
	const positions = new Map<string, { x: number; y: number }>();
	for (const flowNode of flowNodes) {
		const width = flowNode.width > 0 ? flowNode.width : FLOW_NODE_WIDTH;
		const height = flowNode.height > 0 ? flowNode.height : FLOW_NODE_HEIGHT;
		let x = flowNode.x;
		let y = flowNode.y;
		let attempt = 0;
		while (resolved.some((candidate): boolean => intersectsNode({ x, y, width, height }, candidate))) {
			const column = attempt % 3;
			const row = Math.floor(attempt / 3);
			x = flowNode.x + column * (FLOW_NODE_WIDTH + FLOW_NODE_GAP);
			y = flowNode.y + row * (FLOW_NODE_HEIGHT + FLOW_NODE_GAP);
			attempt += 1;
		}
		resolved.push({ x, y, width, height });
		positions.set(flowNode.nodeId, { x, y });
	}
	return positions;
}

function nodeText(node: FlowDocumentNode): string {
	return `${node.title} ${JSON.stringify(node.config)}`.toLocaleLowerCase();
}

function HomeFlowSurface({ controller, searchHandleRef }: HomeFlowSurfaceProps): React.JSX.Element {
	const { t } = useTranslation();
	const snapshot = controller.snapshot;
	const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchIndex, setSearchIndex] = useState(0);
	const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowCanvasNode, Edge> | null>(null);
	const searchInputRef = useRef<InputRef | null>(null);
	const viewportSaveTimerRef = useRef<number | null>(null);
	const nodePositionSaveTimersRef = useRef<Map<string, number>>(new Map());
	const createNode = controller.createNode;
	const updateNode = controller.updateNode;
	const updateNodePosition = controller.updateNodePosition;
	const deleteNode = controller.deleteNode;
	const createEdge = controller.createEdge;
	const deleteEdge = controller.deleteEdge;
	const updateViewport = controller.updateViewport;
	const startRun = controller.startRun;
	const resolvedPositions = useMemo((): Map<string, { x: number; y: number }> => resolveNodePositions(snapshot?.nodes ?? []), [snapshot?.nodes]);
	const latestRun = snapshot?.runs[0];
	const running = latestRun?.status === "running" || latestRun?.status === "queued";
	const matchingNodes = useMemo((): FlowDocumentNode[] => {
		const query = searchQuery.trim().toLocaleLowerCase();
		return query.length === 0 || snapshot === null ? [] : snapshot.nodes.filter((node): boolean => nodeText(node).includes(query));
	}, [searchQuery, snapshot?.nodes]);
	const matchingIds = useMemo((): Set<string> => new Set(matchingNodes.map((node): string => node.nodeId)), [matchingNodes]);

	useEffect((): void => {
		setNodes((snapshot?.nodes ?? []).map((flowNode): FlowCanvasNode => ({
			id: flowNode.nodeId,
			type: "flowNode",
			position: resolvedPositions.get(flowNode.nodeId) ?? { x: flowNode.x, y: flowNode.y },
			data: {
				flowNode,
				matched: matchingIds.has(flowNode.nodeId),
				onUpdate: (nodeId, patch): void => { void updateNode(nodeId, patch); },
				onDelete: (nodeId): void => { void deleteNode(nodeId); },
			},
		})));
	}, [deleteNode, matchingIds, resolvedPositions, snapshot?.nodes, updateNode]);

	const edges = useMemo((): Edge[] => (snapshot?.edges ?? []).map((edge): Edge => ({
		id: edge.edgeId,
		source: edge.sourceNodeId,
		target: edge.targetNodeId,
		sourceHandle: "output",
		targetHandle: "input",
		type: "smoothstep",
		animated: running,
	})), [running, snapshot?.edges]);

	const openSearch = useCallback((selectedQuery?: string): void => {
		setSearchQuery(selectedQuery ?? "");
		setSearchIndex(0);
		setSearchOpen(true);
		window.setTimeout((): void => searchInputRef.current?.focus(), 0);
	}, []);
	const closeSearch = useCallback((): boolean => {
		if (!searchOpen) return false;
		setSearchOpen(false);
		setSearchQuery("");
		setSearchIndex(0);
		return true;
	}, [searchOpen]);
	useEffect((): (() => void) => {
		if (searchHandleRef === undefined) return (): void => undefined;
		searchHandleRef.current = { openSearch, closeSearch };
		return (): void => { if (searchHandleRef.current?.openSearch === openSearch) searchHandleRef.current = null; };
	}, [closeSearch, openSearch, searchHandleRef]);
	useEffect((): void => {
		if (searchIndex >= matchingNodes.length && matchingNodes.length > 0) setSearchIndex(0);
		const target = matchingNodes[searchIndex];
		if (target === undefined || flowInstance === null) return;
		flowInstance.setCenter(target.x + target.width / 2, target.y + target.height / 2, { zoom: 1, duration: 250 });
	}, [flowInstance, matchingNodes, searchIndex]);

	const addNode = useCallback((type: "prompt" | "llm" | "output" | "note"): void => {
		const center = flowInstance?.screenToFlowPosition({ x: 520, y: 300 }) ?? { x: 120 + (snapshot?.nodes.length ?? 0) * 40, y: 160 };
		const index = snapshot?.nodes.length ?? 0;
		const column = index % 3;
		const row = Math.floor(index / 3);
		void createNode(type, center.x + column * (FLOW_NODE_WIDTH + FLOW_NODE_GAP), center.y + row * (FLOW_NODE_HEIGHT + FLOW_NODE_GAP));
	}, [createNode, flowInstance, snapshot?.nodes.length]);
	const handleKeyDown = useCallback((event: KeyboardEvent): void => {
		const target = event.target as HTMLElement | null;
		if (target?.matches("input, textarea, [contenteditable=\"true\"]")) return;
		if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void startRun(); return; }
		if (event.key === "Home") { event.preventDefault(); flowInstance?.fitView({ duration: 250, padding: 0.2 }); return; }
		if (event.key === "F3" || (event.shiftKey && event.key.toLowerCase() === "a")) { event.preventDefault(); addNode("prompt"); }
	}, [addNode, flowInstance, startRun]);
	useEffect((): (() => void) => { window.addEventListener("keydown", handleKeyDown); return (): void => window.removeEventListener("keydown", handleKeyDown); }, [handleKeyDown]);

	const onNodesChange = useCallback((changes: NodeChange<FlowCanvasNode>[]): void => {
		setNodes((current): FlowCanvasNode[] => applyNodeChanges(changes, current));
	}, []);
	const onNodeDragStop = useCallback<OnNodeDrag<FlowCanvasNode>>((_event, node): void => {
		const currentTimer = nodePositionSaveTimersRef.current.get(node.id);
		if (currentTimer !== undefined) window.clearTimeout(currentTimer);
		const { x, y } = node.position;
		const timer = window.setTimeout((): void => {
			nodePositionSaveTimersRef.current.delete(node.id);
			void updateNodePosition(node.id, x, y);
		}, 300);
		nodePositionSaveTimersRef.current.set(node.id, timer);
	}, [updateNodePosition]);
	const onConnect = useCallback((connection: Connection): void => {
		if (connection.source === null || connection.target === null) return;
		void createEdge(connection.source, connection.target, "output", "input");
	}, [createEdge]);
	const onMoveEnd = useCallback((_event: unknown, viewport: { x: number; y: number; zoom: number }): void => {
		if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current);
		viewportSaveTimerRef.current = window.setTimeout((): void => {
			viewportSaveTimerRef.current = null;
			void updateViewport(viewport);
		}, 450);
	}, [updateViewport]);
	useEffect((): (() => void) => (): void => {
		if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current);
		for (const timer of nodePositionSaveTimersRef.current.values()) window.clearTimeout(timer);
		nodePositionSaveTimersRef.current.clear();
	}, [snapshot?.flow.flowId]);

	if (snapshot === null) {
		return <section className={styles.flowSurface} data-studio-flow-surface="true"><header className={styles.flowHeader}><Typography.Text className={styles.flowTitle}>{t("flow.welcome.nodeTitle", { defaultValue: "Build a workflow from nodes" })}</Typography.Text></header><div className={`${styles.canvasRegion} ${styles.flowWelcomeCanvasRegion}`}><FlowWelcome errorMessage={controller.error} onStarterSelect={(): void => addNode("prompt")} /></div></section>;
	}

	return (
		<section className={styles.flowSurface} data-studio-flow-surface="true">
			<header className={styles.flowHeader}>
				<Flex align="center" gap="small" className={styles.flowHeaderTitle}><Typography.Text className={styles.flowTitle}>{snapshot.flow.title}</Typography.Text><Typography.Text type="secondary">{snapshot.nodes.length} nodes</Typography.Text></Flex>
				<Flex align="center" gap="small" className={styles.flowHeaderActions}>
					<Button type="primary" icon={<Icon name="play" />} loading={running} onClick={(): void => { void controller.startRun(); }}>Run</Button>
					<Button icon={<Icon name="stop" />} disabled={!running} onClick={(): void => { void controller.stopRun(); }}>Stop</Button>
					<Divider type="vertical" />
					<Dropdown menu={{ items: [{ key: "prompt", label: "Prompt", onClick: (): void => addNode("prompt") }, { key: "llm", label: "LLM", onClick: (): void => addNode("llm") }, { key: "output", label: "Output", onClick: (): void => addNode("output") }, { key: "note", label: "Note", onClick: (): void => addNode("note") }] }} trigger={["click"]}><Button icon={<Icon name="add" />}>Add node</Button></Dropdown>
					<Tooltip title="Search"><Button type="text" icon={<Icon name="search" />} aria-label="Search" onClick={(): void => openSearch()} /></Tooltip>
					<Button type="text" icon={<Icon name="layout-bottom" />} aria-label="Fit canvas" onClick={(): void => { void flowInstance?.fitView({ duration: 250, padding: 0.2 }); }} />
				</Flex>
			</header>
			{controller.error !== null ? <Alert className={styles.flowAlert} type="error" showIcon message={controller.error} /> : null}
			<div className={styles.canvasRegion}>
				<ConversationSearchPanel open={searchOpen} query={searchQuery} current={matchingNodes.length === 0 ? 0 : searchIndex + 1} total={matchingNodes.length} loading={false} inputRef={searchInputRef} onQueryChange={(query): void => { setSearchQuery(query); setSearchIndex(0); }} onPrevious={(): void => setSearchIndex((current): number => matchingNodes.length === 0 ? 0 : (current - 1 + matchingNodes.length) % matchingNodes.length)} onNext={(): void => setSearchIndex((current): number => matchingNodes.length === 0 ? 0 : (current + 1) % matchingNodes.length)} onClose={closeSearch} />
				{controller.isLoading ? <Spin className={styles.canvasSpinner} /> : null}
				{snapshot.nodes.length === 0 && nodes.length === 0 ? <div className={styles.emptyCanvasHint}><FlowWelcome errorMessage={null} onStarterSelect={(): void => addNode("prompt")} /></div> : null}
				<ReactFlow key={snapshot.flow.flowId} nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultViewport={snapshot.flow.viewport} onInit={setFlowInstance} onNodesChange={onNodesChange} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onMoveEnd={onMoveEnd} onNodesDelete={(deleted): void => { for (const node of deleted) void deleteNode(node.id); }} onEdgesDelete={(deleted): void => { for (const edge of deleted) void deleteEdge(edge.id); }} nodesDraggable nodesConnectable panOnDrag zoomOnScroll zoomOnPinch zoomOnDoubleClick selectionOnDrag={false} fitView={snapshot.nodes.length > 0} fitViewOptions={{ padding: 0.2 }} minZoom={0.2} maxZoom={2} deleteKeyCode={["Backspace", "Delete"]}>
					<Background gap={24} size={1} /><MiniMap pannable zoomable nodeStrokeWidth={3} /><Controls showInteractive={false} />
				</ReactFlow>
			</div>
		</section>
	);
}

export default HomeFlowSurface;
