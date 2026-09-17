import { Alert, Badge, Button, Divider, Dropdown, Flex, Input, Spin, Tooltip, Typography } from "antd";
import type { InputRef, MenuProps } from "antd";
import {
	Background,
	Controls,
	MiniMap,
	ReactFlow,
	applyNodeChanges,
	type Connection,
	type Edge,
	type FinalConnectionState,
	type NodeChange,
	type OnConnectStartParams,
	type OnNodeDrag,
	type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { HomeFlowController } from "@/features/home/flow/useHomeFlowController";
import type {
	FlowDocumentNode,
	FlowDocumentNodeType,
	FlowNodePortDefinition,
	FlowNodeTypeDefinition,
} from "@/platform/rpc/types";
import ConversationSearchPanel from "@/widgets/conversation/ConversationSearchPanel";
import { createApprovalModeItems, isApprovalMode } from "@/widgets/composer/composer-menu-items";
import FlowNodePicker from "./FlowNodePicker";
import FlowWelcome from "./FlowWelcome";
import { FlowDocumentNodeView, resolveFlowCanvasPorts, type FlowCanvasNode } from "./FlowNodes";
import styles from "./HomeFlowSurface.module.css";

export type FlowSearchHandle = { openSearch: (selectedQuery?: string) => void; closeSearch: () => boolean };
export type HomeFlowSurfaceProps = {
	controller: HomeFlowController;
	searchHandleRef?: MutableRefObject<FlowSearchHandle | null>;
	chatSurfaceProps?: unknown;
};
type PickerConnection = { direction: "from_existing" | "to_existing"; existingNodeId: string; existingPort: string };
type PickerState = {
	position: { x: number; y: number };
	flowPosition: { x: number; y: number };
	definitions: FlowNodeTypeDefinition[];
	connection: PickerConnection | null;
};

const nodeTypes = { flowNode: FlowDocumentNodeView };
const FLOW_NODE_WIDTH = 320;
const FLOW_NODE_HEIGHT = 220;
const FLOW_NODE_GAP = 28;

function intersectsNode(
	left: { x: number; y: number; width: number; height: number },
	right: { x: number; y: number; width: number; height: number },
): boolean {
	return (
		left.x < right.x + right.width + FLOW_NODE_GAP &&
		left.x + left.width + FLOW_NODE_GAP > right.x &&
		left.y < right.y + right.height + FLOW_NODE_GAP &&
		left.y + left.height + FLOW_NODE_GAP > right.y
	);
}
function resolveNodePositions(flowNodes: readonly FlowDocumentNode[]): Map<string, { x: number; y: number }> {
	const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
	const positions = new Map<string, { x: number; y: number }>();
	for (const node of flowNodes) {
		const width = node.width > 0 ? node.width : FLOW_NODE_WIDTH;
		const height = node.height > 0 ? node.height : FLOW_NODE_HEIGHT;
		let x = node.x;
		let y = node.y;
		let attempt = 0;
		while (occupied.some((candidate): boolean => intersectsNode({ x, y, width, height }, candidate))) {
			x = node.x + (attempt % 3) * (FLOW_NODE_WIDTH + FLOW_NODE_GAP);
			y = node.y + Math.floor(attempt / 3) * (FLOW_NODE_HEIGHT + FLOW_NODE_GAP);
			attempt += 1;
		}
		occupied.push({ x, y, width, height });
		positions.set(node.nodeId, { x, y });
	}
	return positions;
}
function nodeText(node: FlowDocumentNode): string {
	return `${node.title} ${JSON.stringify(node.config)}`.toLocaleLowerCase();
}
function eventPoint(event: MouseEvent | TouchEvent): { x: number; y: number } {
	if ("changedTouches" in event && event.changedTouches[0] !== undefined)
		return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
	return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
}
function portFor(
	node: FlowDocumentNode | undefined,
	definitions: FlowNodeTypeDefinition[],
	id: string | null | undefined,
	direction: "input" | "output",
): FlowNodePortDefinition | undefined {
	if (node === undefined || id === null || id === undefined) return undefined;
	const definition = definitions.find((candidate): boolean => candidate.type === node.type) ?? null;
	return resolveFlowCanvasPorts(node, definition).find(
		(port): boolean => port.id === id && port.direction === direction,
	);
}
function compatibleType(
	source: FlowNodePortDefinition,
	target: FlowNodePortDefinition,
): "text" | "json" | "artifact" | null {
	return source.dataTypes.find((dataType): boolean => target.dataTypes.includes(dataType)) ?? null;
}

function HomeFlowSurface({ controller, searchHandleRef }: HomeFlowSurfaceProps): React.JSX.Element {
	const { t } = useTranslation();
	const snapshot = controller.snapshot;
	const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
	const [picker, setPicker] = useState<PickerState | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchIndex, setSearchIndex] = useState(0);
	const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowCanvasNode, Edge> | null>(null);
	const [isViewportMoving, setIsViewportMoving] = useState(false);
	const [consentText, setConsentText] = useState<Record<string, string>>({});
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<InputRef | null>(null);
	const viewportSaveTimerRef = useRef<number | null>(null);
	const nodePositionSaveTimersRef = useRef<Map<string, number>>(new Map());
	const connectStartRef = useRef<OnConnectStartParams | null>(null);
	const resolvedPositions = useMemo(
		(): Map<string, { x: number; y: number }> => resolveNodePositions(snapshot?.nodes ?? []),
		[snapshot?.nodes],
	);
	const latestRun = snapshot?.runs[0];
	const running =
		latestRun?.status === "running" || latestRun?.status === "queued" || latestRun?.status === "waiting";
	const matchingNodes = useMemo((): FlowDocumentNode[] => {
		const query = searchQuery.trim().toLocaleLowerCase();
		return query.length === 0 || snapshot === null
			? []
			: snapshot.nodes.filter((node): boolean => nodeText(node).includes(query));
	}, [searchQuery, snapshot?.nodes]);
	const matchingIds = useMemo(
		(): Set<string> => new Set(matchingNodes.map((node): string => node.nodeId)),
		[matchingNodes],
	);
	const approvalModeLabel =
		snapshot?.flow.approvalMode === "full-trust"
			? t("composer.approvalMode.fullTrust")
			: snapshot?.flow.approvalMode === "auto-safe"
				? t("composer.approvalMode.autoSafe")
				: t("composer.approvalMode.manual");
	const approvalModeMenu = useMemo<MenuProps>(
		() => ({
			items: createApprovalModeItems(t),
			selectedKeys: snapshot === null ? [] : [snapshot.flow.approvalMode],
			onClick: ({ key }): void => {
				if (isApprovalMode(key)) void controller.setApprovalMode(key);
			},
		}),
		[controller.setApprovalMode, snapshot?.flow.approvalMode, t],
	);

	useEffect((): void => {
		setNodes(
			(snapshot?.nodes ?? []).map(
				(flowNode): FlowCanvasNode => ({
					id: flowNode.nodeId,
					type: "flowNode",
					position: resolvedPositions.get(flowNode.nodeId) ?? { x: flowNode.x, y: flowNode.y },
					data: {
						flowNode,
						nodeRun:
							latestRun?.nodes.find((nodeRun): boolean => nodeRun.nodeId === flowNode.nodeId) ?? null,
						definition:
							controller.nodeDefinitions.find(
								(definition): boolean => definition.type === flowNode.type,
							) ?? null,
						tools: controller.tools,
						matched: matchingIds.has(flowNode.nodeId),
						locked: controller.isGraphLocked,
						onUpdate: (nodeId, patch): void => {
							void controller.updateNode(nodeId, patch);
						},
						onDelete: (nodeId): void => {
							void controller.deleteNode(nodeId);
						},
					},
				}),
			),
		);
	}, [
		controller.deleteNode,
		controller.isGraphLocked,
		controller.nodeDefinitions,
		controller.tools,
		controller.updateNode,
		latestRun?.nodes,
		matchingIds,
		resolvedPositions,
		snapshot?.nodes,
	]);
	const edges = useMemo(
		(): Edge[] =>
			(snapshot?.edges ?? []).map(
				(edge): Edge => ({
					id: edge.edgeId,
					source: edge.sourceNodeId,
					target: edge.targetNodeId,
					sourceHandle: edge.sourcePort,
					targetHandle: edge.targetPort,
					type: "smoothstep",
					animated: running,
				}),
			),
		[running, snapshot?.edges],
	);

	const closePicker = useCallback((): void => setPicker(null), []);
	const openPickerAt = useCallback(
		(
			clientX: number,
			clientY: number,
			definitions = controller.nodeDefinitions,
			connection: PickerConnection | null = null,
		): void => {
			const rect = canvasRef.current?.getBoundingClientRect();
			if (rect === undefined || flowInstance === null) return;
			setPicker({
				position: {
					x: Math.max(8, Math.min(clientX - rect.left, rect.width - 360)),
					y: Math.max(8, Math.min(clientY - rect.top, rect.height - 480)),
				},
				flowPosition: flowInstance.screenToFlowPosition({ x: clientX, y: clientY }),
				definitions,
				connection,
			});
		},
		[controller.nodeDefinitions, flowInstance],
	);
	const selectPickerNode = useCallback(
		(type: FlowDocumentNodeType): void => {
			if (picker === null) return;
			const connection = picker.connection;
			if (connection === null) void controller.createNode(type, picker.flowPosition.x, picker.flowPosition.y);
			else {
				const definition = picker.definitions.find((candidate): boolean => candidate.type === type);
				const neededDirection = connection.direction === "from_existing" ? "input" : "output";
				const newPort = definition?.ports.find(
					(port): boolean => port.direction === neededDirection && port.defaultConnect,
				);
				const existingNode = snapshot?.nodes.find((node): boolean => node.nodeId === connection.existingNodeId);
				const existingPort = portFor(
					existingNode,
					controller.nodeDefinitions,
					connection.existingPort,
					connection.direction === "from_existing" ? "output" : "input",
				);
				const dataType =
					newPort === undefined || existingPort === undefined
						? null
						: connection.direction === "from_existing"
							? compatibleType(existingPort, newPort)
							: compatibleType(newPort, existingPort);
				if (newPort !== undefined && dataType !== null)
					void controller.createConnectedNode({
						type,
						x: picker.flowPosition.x,
						y: picker.flowPosition.y,
						...connection,
						newPort: newPort.id,
						dataType,
					});
			}
			setPicker(null);
		},
		[controller, picker, snapshot?.nodes],
	);
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
		return (): void => {
			if (searchHandleRef.current?.openSearch === openSearch) searchHandleRef.current = null;
		};
	}, [closeSearch, openSearch, searchHandleRef]);
	useEffect((): void => {
		if (searchIndex >= matchingNodes.length && matchingNodes.length > 0) setSearchIndex(0);
		const target = matchingNodes[searchIndex];
		if (target !== undefined && flowInstance !== null)
			flowInstance.setCenter(target.x + target.width / 2, target.y + target.height / 2, {
				zoom: 1,
				duration: 250,
			});
	}, [flowInstance, matchingNodes, searchIndex]);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent): void => {
			const target = event.target as HTMLElement | null;
			if (target?.matches('input, textarea, [contenteditable="true"]')) return;
			if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
				event.preventDefault();
				void controller.startRun();
				return;
			}
			if (event.key === "Home") {
				event.preventDefault();
				flowInstance?.fitView({ duration: 250, padding: 0.2 });
				return;
			}
			if (event.key === "F3" || (event.shiftKey && event.key.toLowerCase() === "a")) {
				event.preventDefault();
				const rect = canvasRef.current?.getBoundingClientRect();
				if (rect !== undefined)
					openPickerAt(rect.left + rect.width / 2, rect.top + Math.min(180, rect.height / 2));
			}
		},
		[controller.startRun, flowInstance, openPickerAt],
	);
	useEffect((): (() => void) => {
		window.addEventListener("keydown", handleKeyDown);
		return (): void => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	const onConnect = useCallback(
		(connection: Connection): void => {
			if (
				connection.source === null ||
				connection.target === null ||
				connection.sourceHandle === null ||
				connection.targetHandle === null ||
				snapshot === null
			)
				return;
			const sourceNode = snapshot.nodes.find((node): boolean => node.nodeId === connection.source);
			const targetNode = snapshot.nodes.find((node): boolean => node.nodeId === connection.target);
			const sourcePort = portFor(sourceNode, controller.nodeDefinitions, connection.sourceHandle, "output");
			const targetPort = portFor(targetNode, controller.nodeDefinitions, connection.targetHandle, "input");
			if (sourcePort === undefined || targetPort === undefined) return;
			const dataType = compatibleType(sourcePort, targetPort);
			if (dataType !== null)
				void controller.createEdge(
					connection.source,
					connection.target,
					connection.sourceHandle,
					connection.targetHandle,
					dataType,
				);
		},
		[controller, snapshot],
	);
	const onConnectEnd = useCallback(
		(event: MouseEvent | TouchEvent, state: FinalConnectionState): void => {
			const started = connectStartRef.current;
			connectStartRef.current = null;
			if (
				state.toHandle !== null ||
				started === null ||
				started.nodeId === null ||
				started.handleId === null ||
				snapshot === null
			)
				return;
			const point = eventPoint(event);
			const element = document.elementFromPoint(point.x, point.y);
			if (
				!(element instanceof Element) ||
				element.closest(".react-flow__pane") === null ||
				element.closest(".react-flow__node") !== null
			)
				return;
			const existingNode = snapshot.nodes.find((node): boolean => node.nodeId === started.nodeId);
			const direction = started.handleType === "source" ? "from_existing" : "to_existing";
			const existingPort = portFor(
				existingNode,
				controller.nodeDefinitions,
				started.handleId,
				started.handleType === "source" ? "output" : "input",
			);
			if (existingPort === undefined) return;
			const compatible = controller.nodeDefinitions.filter((definition): boolean => {
				if (definition.workspaceRequired && snapshot.flow.workspaceId === null) return false;
				const candidate = definition.ports.find(
					(port): boolean =>
						port.direction === (direction === "from_existing" ? "input" : "output") && port.defaultConnect,
				);
				return (
					candidate !== undefined &&
					(direction === "from_existing"
						? compatibleType(existingPort, candidate)
						: compatibleType(candidate, existingPort)) !== null
				);
			});
			if (compatible.length === 0) return;
			openPickerAt(point.x, point.y, compatible, {
				direction,
				existingNodeId: started.nodeId,
				existingPort: started.handleId,
			});
		},
		[controller.nodeDefinitions, openPickerAt, snapshot],
	);
	const onNodeDragStop = useCallback<OnNodeDrag<FlowCanvasNode>>(
		(_event, node): void => {
			const old = nodePositionSaveTimersRef.current.get(node.id);
			if (old !== undefined) window.clearTimeout(old);
			const { x, y } = node.position;
			nodePositionSaveTimersRef.current.set(
				node.id,
				window.setTimeout((): void => {
					nodePositionSaveTimersRef.current.delete(node.id);
					void controller.updateNodePosition(node.id, x, y);
				}, 300),
			);
		},
		[controller.updateNodePosition],
	);
	const onMoveStart = useCallback((): void => {
		setIsViewportMoving(true);
	}, []);
	const onMoveEnd = useCallback(
		(_event: unknown, viewport: { x: number; y: number; zoom: number }): void => {
			setIsViewportMoving(false);
			if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current);
			viewportSaveTimerRef.current = window.setTimeout((): void => {
				viewportSaveTimerRef.current = null;
				void controller.updateViewport(viewport);
			}, 450);
		},
		[controller.updateViewport],
	);
	useEffect(
		(): (() => void) => (): void => {
			if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current);
			for (const timer of nodePositionSaveTimersRef.current.values()) window.clearTimeout(timer);
			nodePositionSaveTimersRef.current.clear();
		},
		[snapshot?.flow.flowId],
	);

	if (snapshot === null)
		return (
			<section className={styles.flowSurface} data-studio-flow-surface="true">
				<header className={styles.flowHeader}>
					<Typography.Text className={styles.flowTitle}>
						{t("flow.welcome.nodeTitle", { defaultValue: "Build a workflow from nodes" })}
					</Typography.Text>
				</header>
				<div className={`${styles.canvasRegion} ${styles.flowWelcomeCanvasRegion}`}>
					<FlowWelcome errorMessage={controller.error} onStarterSelect={(): void => undefined} />
				</div>
			</section>
		);
	return (
		<section className={styles.flowSurface} data-studio-flow-surface="true">
			<header className={styles.flowHeader}>
				<Typography.Text className={styles.flowTitle}>{snapshot.flow.title}</Typography.Text>
				<Flex align="center" gap="small" className={styles.flowHeaderActions}>
					<Tooltip title={t("composer.tooltips.approvalMode")} placement="bottom">
						<Dropdown menu={approvalModeMenu} trigger={["click"]}>
							<Button
								type="text"
								aria-label={approvalModeLabel}
								icon={
									<Icon
										name={
											snapshot.flow.approvalMode === "full-trust"
												? "warning"
												: snapshot.flow.approvalMode === "auto-safe"
													? "shield"
													: "hand"
										}
									/>
								}
								className={styles.approvalModeButton}
							>
								<span className={styles.approvalModeText}>{approvalModeLabel}</span>
							</Button>
						</Dropdown>
					</Tooltip>
					<Button
						type="primary"
						danger={running}
						icon={<Icon name={running ? "stop" : "play"} />}
						onClick={(): void => {
							if (running) void controller.stopRun();
							else void controller.startRun();
						}}
					>
						{running ? t("flow.editor.stop") : t("flow.editor.run")}
					</Button>
					<Tooltip title={t("flow.editor.search")} placement="bottom">
						<Button
							type="text"
							shape="circle"
							icon={<Icon name="search" />}
							aria-label={t("flow.editor.search")}
							onClick={(): void => openSearch()}
						/>
					</Tooltip>
				</Flex>
			</header>
			{controller.error !== null ? (
				<Alert className={styles.flowAlert} type="error" showIcon message={controller.error} />
			) : null}
			<div
				ref={canvasRef}
				className={`${styles.canvasRegion} ${isViewportMoving ? styles.canvasMoving : ""}`}
				onContextMenu={(event): void => {
					if (controller.isGraphLocked || (event.target as Element).closest(".react-flow__node") !== null)
						return;
					event.preventDefault();
					openPickerAt(event.clientX, event.clientY);
				}}
			>
				<ConversationSearchPanel
					open={searchOpen}
					query={searchQuery}
					current={matchingNodes.length === 0 ? 0 : searchIndex + 1}
					total={matchingNodes.length}
					loading={false}
					inputRef={searchInputRef}
					onQueryChange={(query): void => {
						setSearchQuery(query);
						setSearchIndex(0);
					}}
					onPrevious={(): void =>
						setSearchIndex((current): number =>
							matchingNodes.length === 0
								? 0
								: (current - 1 + matchingNodes.length) % matchingNodes.length,
						)
					}
					onNext={(): void =>
						setSearchIndex((current): number =>
							matchingNodes.length === 0 ? 0 : (current + 1) % matchingNodes.length,
						)
					}
					onClose={closeSearch}
				/>
				{controller.isLoading ? <Spin className={styles.canvasSpinner} /> : null}
				{snapshot.nodes.length === 0 && nodes.length === 0 ? (
					<div className={styles.emptyCanvasHint}>
						<FlowWelcome
							errorMessage={null}
							onStarterSelect={(): void => {
								const rect = canvasRef.current?.getBoundingClientRect();
								if (rect !== undefined)
									openPickerAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
							}}
						/>
					</div>
				) : null}
				{controller.approvals.some((approval): boolean => approval.status === "pending") ? (
					<div className={styles.approvalQueue}>
						<Typography.Text strong>
							<Badge status="warning" /> {t("flow.editor.pendingApprovals")}
						</Typography.Text>
						{controller.approvals
							.filter((approval): boolean => approval.status === "pending")
							.map(
								(approval): React.JSX.Element => (
									<div key={approval.approvalId} className={styles.approvalItem}>
										<Typography.Text>{approval.toolName}</Typography.Text>
										<Typography.Text type="secondary">{approval.reason}</Typography.Text>
										{approval.requiredConsent !== null ? (
											<>
												<Typography.Text type="secondary">
													{approval.requiredConsent.prompt}
												</Typography.Text>
												<Input
													size="small"
													value={consentText[approval.approvalId] ?? ""}
													onChange={(event): void =>
														setConsentText(
															(current): Record<string, string> => ({
																...current,
																[approval.approvalId]: event.target.value,
															}),
														)
													}
												/>
											</>
										) : null}
										<Flex gap="small">
											<Button
												size="small"
												danger
												onClick={(): void => {
													void controller.resolveApproval(approval.approvalId, "reject");
												}}
											>
												{t("flow.editor.reject")}
											</Button>
											<Button
												size="small"
												type="primary"
												disabled={
													approval.requiredConsent !== null &&
													consentText[approval.approvalId] !==
														approval.requiredConsent.expectedText
												}
												onClick={(): void => {
													void controller.resolveApproval(
														approval.approvalId,
														"approve",
														consentText[approval.approvalId],
													);
												}}
											>
												{t("flow.editor.approve")}
											</Button>
										</Flex>
									</div>
								),
							)}
					</div>
				) : null}
				<ReactFlow
					key={snapshot.flow.flowId}
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					defaultViewport={snapshot.flow.viewport}
					onInit={setFlowInstance}
					onNodesChange={(changes: NodeChange<FlowCanvasNode>[]): void =>
						setNodes((current): FlowCanvasNode[] => applyNodeChanges(changes, current))
					}
					onNodeDragStop={onNodeDragStop}
					onConnect={onConnect}
					onConnectStart={(_event, params): void => {
						closePicker();
						connectStartRef.current = params;
					}}
					onConnectEnd={onConnectEnd}
					onMoveStart={onMoveStart}
					onMoveEnd={onMoveEnd}
					onNodesDelete={(deleted): void => {
						if (!controller.isGraphLocked) for (const node of deleted) void controller.deleteNode(node.id);
					}}
					onEdgesDelete={(deleted): void => {
						if (!controller.isGraphLocked) for (const edge of deleted) void controller.deleteEdge(edge.id);
					}}
					nodesDraggable
					nodesConnectable={!controller.isGraphLocked}
					elementsSelectable
					panOnDrag={[1, 2]}
					panOnScroll={false}
					zoomOnScroll
					zoomOnPinch
					zoomOnDoubleClick
					selectionOnDrag
					fitView={snapshot.nodes.length > 0}
					fitViewOptions={{ padding: 0.2 }}
					minZoom={0.2}
					maxZoom={2}
					deleteKeyCode={controller.isGraphLocked ? null : ["Backspace", "Delete"]}
				>
					<Background gap={24} size={1} />
					{isViewportMoving ? null : <MiniMap pannable={false} zoomable={false} nodeStrokeWidth={3} />}
					<Controls showInteractive={false} />
				</ReactFlow>
				<FlowNodePicker
					open={picker !== null}
					position={picker?.position ?? { x: 0, y: 0 }}
					definitions={picker?.definitions ?? []}
					workspaceAvailable={snapshot.flow.workspaceId !== null}
					onSelect={selectPickerNode}
					onClose={closePicker}
				/>
			</div>
		</section>
	);
}

export default HomeFlowSurface;
