import { Alert, Badge, Button, Divider, Dropdown, Flex, Input, Spin, Tooltip, Typography } from "antd";
import type { InputRef, MenuProps } from "antd";
import {
	Background,
	Controls,
	Position,
	ReactFlow,
	applyNodeChanges,
	getBezierPath,
	type Connection,
	type ConnectionLineComponentProps,
	type Edge,
	type FinalConnectionState,
	type NodeChange,
	type OnConnectStartParams,
	type OnNodeDrag,
	type OnReconnect,
	type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { HomeFlowController } from "@/features/home/flow/useHomeFlowController";
import { getCachedClientPreferences, updateClientPreferences } from "@/platform/rpc/client-preferences-api";
import {
	listProviderModels,
	type ProviderModelInfo,
	type ProviderModelSelection,
} from "@/platform/rpc/provider-api";
import {
	detectShortcutPlatform,
	getEffectiveShortcutBinding,
	matchesShortcutKeyboardEvent,
	type KeyboardShortcutOverrides,
	type ShortcutCommandId,
} from "@/platform/rpc/keyboard-shortcuts";
import type {
	FlowDocumentNode,
	FlowDocumentNodeRun,
	FlowNodeTypeId,
	FlowNodePortDefinition,
	FlowNodeTypeDefinition,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import ConversationSearchPanel from "@/widgets/conversation/ConversationSearchPanel";
import { createApprovalModeItems, isApprovalMode } from "@/widgets/composer/composer-menu-items";
import FlowNodePicker from "./FlowNodePicker";
import FlowWelcome from "./FlowWelcome";
import {
	FlowDocumentNodeView,
	resolveFlowCanvasPorts,
	resolveFlowDefinitionPorts,
	type FlowCanvasNode,
	type FlowNodeEditorOptions,
} from "./FlowNodes";
import styles from "./HomeFlowSurface.module.css";

export type FlowSearchHandle = {
	openSearch: (selectedQuery?: string) => void;
	closeSearch: () => boolean;
};
export type HomeFlowSurfaceProps = {
	controller: HomeFlowController;
	keyboardShortcuts: KeyboardShortcutOverrides;
	providerModelSelection: ProviderModelSelection | null;
	workspaceOptions: WorkspaceConfig[];
	searchHandleRef?: MutableRefObject<FlowSearchHandle | null>;
};
type PickerConnection = {
	direction: "from_existing" | "to_existing";
	existingNodeId: string;
	existingPort: string;
};
type PickerState = {
	position: { x: number; y: number };
	flowPosition: { x: number; y: number };
	definitions: FlowNodeTypeDefinition[];
	connection: PickerConnection | null;
};
type InteractionSample = {
	kind: "node-drag" | "viewport";
	startedAt: number;
};
type DetachedConnectionSource = {
	edgeId: string;
	sourceNodeId: string;
	sourcePort: string;
};

const nodeTypes = { flowNode: FlowDocumentNodeView };
const FLOW_NODE_WIDTH = 320;
const FLOW_NODE_HEIGHT = 220;
const FLOW_NODE_GAP = 28;
const FLOW_SNAP_GRID: [number, number] = [24, 24];
const FLOW_NODE_CREATE_OFFSET = 32;
const EMPTY_CONNECTED_INPUT_IDS: ReadonlySet<string> = new Set<string>();

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
	const occupied: Array<{
		x: number;
		y: number;
		width: number;
		height: number;
	}> = [];
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
		return {
			x: event.changedTouches[0].clientX,
			y: event.changedTouches[0].clientY,
		};
	return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
}
function portFor(
	node: FlowDocumentNode | undefined,
	definitions: FlowNodeTypeDefinition[],
	id: string | null | undefined,
	direction: "input" | "output",
): FlowNodePortDefinition | undefined {
	if (node === undefined || id === null || id === undefined) return undefined;
	const definition = definitions.find((candidate): boolean => candidate.typeId === node.typeId) ?? null;
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

function HomeFlowSurface({
	controller,
	keyboardShortcuts,
	providerModelSelection,
	workspaceOptions,
	searchHandleRef,
}: HomeFlowSurfaceProps): React.JSX.Element {
	const { t } = useTranslation();
	const snapshot = controller.snapshot;
	const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
	const [picker, setPicker] = useState<PickerState | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchIndex, setSearchIndex] = useState(0);
	const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowCanvasNode, Edge> | null>(null);
	const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null);
	const [snapToGrid, setSnapToGrid] = useState<boolean>((): boolean => getCachedClientPreferences().flowSnapToGrid);
	const [consentText, setConsentText] = useState<Record<string, string>>({});
	const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModelInfo[]>>({});
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<InputRef | null>(null);
	const connectStartRef = useRef<OnConnectStartParams | null>(null);
	const detachedEdgeIdRef = useRef<string | null>(null);
	const detachedConnectionSourceRef = useRef<DetachedConnectionSource | null>(null);
	const interactionSampleRef = useRef<InteractionSample | null>(null);
	const loadingProviderModelsRef = useRef<Set<string>>(new Set());
	const resolvedPositions = useMemo(
		(): Map<string, { x: number; y: number }> => resolveNodePositions(snapshot?.nodes ?? []),
		[snapshot?.nodes],
	);
	const definitionsByType = useMemo(
		(): Map<string, FlowNodeTypeDefinition> =>
			new Map(
				controller.nodeDefinitions.map((definition): [string, FlowNodeTypeDefinition] => [
					definition.typeId,
					definition,
				]),
			),
		[controller.nodeDefinitions],
	);
	const connectedInputIdsByNode = useMemo((): Map<string, ReadonlySet<string>> => {
		const mutable = new Map<string, Set<string>>();
		for (const edge of snapshot?.edges ?? []) {
			const current = mutable.get(edge.targetNodeId) ?? new Set<string>();
			current.add(edge.targetPort);
			mutable.set(edge.targetNodeId, current);
		}
		return new Map(mutable);
	}, [snapshot?.edges]);
	const editorOptions = useMemo<FlowNodeEditorOptions>(
		(): FlowNodeEditorOptions => ({ modelSelection: providerModelSelection, modelsByProvider }),
		[modelsByProvider, providerModelSelection],
	);
	const latestRun = snapshot?.runs[0];
	const running =
		latestRun?.status === "running" || latestRun?.status === "queued" || latestRun?.status === "waiting";
	const shortcutPlatform = useMemo(() => detectShortcutPlatform(), []);
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
		const providerIds = new Set<string>();
		for (const node of snapshot?.nodes ?? []) {
			const providerId = node.config.provider;
			if (typeof providerId === "string" && providerId.length > 0) providerIds.add(providerId);
		}
		if (providerModelSelection?.activeModel.providerId !== undefined)
			providerIds.add(providerModelSelection.activeModel.providerId);
		for (const providerId of providerIds) {
			if (modelsByProvider[providerId] !== undefined || loadingProviderModelsRef.current.has(providerId)) continue;
			loadingProviderModelsRef.current.add(providerId);
			void listProviderModels(providerId)
				.then((result): void => {
					setModelsByProvider((current): Record<string, ProviderModelInfo[]> => ({
						...current,
						[providerId]: result.models,
					}));
				})
				.catch((): void => {
					setModelsByProvider((current): Record<string, ProviderModelInfo[]> => ({
						...current,
						[providerId]: [],
					}));
				})
				.finally((): void => {
					loadingProviderModelsRef.current.delete(providerId);
				});
		}
	}, [modelsByProvider, providerModelSelection?.activeModel.providerId, snapshot?.nodes]);
	const commitActiveEditor = useCallback(async (): Promise<void> => {
		const activeElement = document.activeElement;
		if (activeElement instanceof HTMLElement && canvasRef.current?.contains(activeElement)) activeElement.blur();
		await new Promise<void>((resolve): void => {
			window.setTimeout(resolve, 0);
		});
	}, []);
	const startRequestedRun = useCallback(
		async (forceNodeIds?: string[]): Promise<void> => {
			await commitActiveEditor();
			await controller.startRun(forceNodeIds);
		},
		[commitActiveEditor, controller.startRun],
	);
	const updateCanvasNode = useCallback(
		(nodeId: string, patch: Record<string, unknown>): void => {
			void controller.updateNode(nodeId, patch);
		},
		[controller.updateNode],
	);
	const runCanvasNodeAction = useCallback(
		(nodeId: string, action: string): void => {
			if (action === "run") void startRequestedRun([nodeId]);
		},
		[startRequestedRun],
	);

	useEffect((): void => {
		setNodes((current): FlowCanvasNode[] => {
			const currentById = new Map(current.map((node): [string, FlowCanvasNode] => [node.id, node]));
			return (snapshot?.nodes ?? []).map((flowNode): FlowCanvasNode => {
				const existing = currentById.get(flowNode.nodeId);
				const position = resolvedPositions.get(flowNode.nodeId) ?? { x: flowNode.x, y: flowNode.y };
				const registeredDefinition = definitionsByType.get(flowNode.typeId);
				const definition =
					registeredDefinition !== undefined &&
					registeredDefinition.pluginVersion === flowNode.pluginVersion &&
					registeredDefinition.pluginFingerprint === flowNode.pluginFingerprint &&
					registeredDefinition.configVersion === flowNode.configVersion
						? registeredDefinition
						: null;
				const matched = matchingIds.has(flowNode.nodeId);
				const connectedInputIds = connectedInputIdsByNode.get(flowNode.nodeId) ?? EMPTY_CONNECTED_INPUT_IDS;
				if (
					existing !== undefined &&
					existing.data.flowNode === flowNode &&
					existing.data.definition === definition &&
					existing.data.editorOptions === editorOptions &&
					existing.data.connectedInputIds === connectedInputIds &&
					existing.data.matched === matched &&
					existing.data.locked === controller.isGraphLocked &&
					existing.position.x === position.x &&
					existing.position.y === position.y
				)
					return existing;
				return {
					...(existing ?? {}),
					id: flowNode.nodeId,
					type: "flowNode",
					position,
					data: {
						flowNode,
						nodeRun: existing?.data.nodeRun ?? null,
						definition,
						editorOptions,
						connectedInputIds,
						matched,
						locked: controller.isGraphLocked,
						onUpdate: updateCanvasNode,
						onAction: runCanvasNodeAction,
					},
				};
			});
		});
	}, [
		controller.isGraphLocked,
		connectedInputIdsByNode,
		definitionsByType,
		editorOptions,
		matchingIds,
		resolvedPositions,
		runCanvasNodeAction,
		snapshot?.nodes,
		updateCanvasNode,
	]);
	useEffect((): void => {
		const runByNode = new Map(
			(latestRun?.nodes ?? []).map((nodeRun): [string, FlowDocumentNodeRun] => [nodeRun.nodeId, nodeRun]),
		);
		setNodes((current): FlowCanvasNode[] =>
			current.map((node): FlowCanvasNode => {
				const nextRun = runByNode.get(node.id) ?? null;
				return node.data.nodeRun === nextRun ? node : { ...node, data: { ...node.data, nodeRun: nextRun } };
			}),
		);
	}, [latestRun?.nodes]);
	const edges = useMemo(
		(): Edge[] =>
			(snapshot?.edges ?? []).filter((edge): boolean => edge.edgeId !== reconnectingEdgeId).map(
				(edge): Edge => ({
					id: edge.edgeId,
					source: edge.sourceNodeId,
					target: edge.targetNodeId,
					sourceHandle: edge.sourcePort,
					targetHandle: edge.targetPort,
					type: "default",
				}),
			),
		[reconnectingEdgeId, snapshot?.edges],
	);
	const connectionLineComponent = useCallback(
		(props: ConnectionLineComponentProps<FlowCanvasNode>): React.JSX.Element => {
			const source = detachedConnectionSourceRef.current;
			let sourceX = props.fromX;
			let sourceY = props.fromY;
			let sourcePosition = props.fromPosition;
			if (source !== null) {
				const internalNode = flowInstance?.getInternalNode(source.sourceNodeId);
				const sourceHandle = internalNode?.internals.handleBounds?.source?.find(
					(handle): boolean => handle.id === source.sourcePort,
				);
				if (internalNode !== undefined && sourceHandle !== undefined) {
					sourceX = internalNode.internals.positionAbsolute.x + sourceHandle.x + sourceHandle.width / 2;
					sourceY = internalNode.internals.positionAbsolute.y + sourceHandle.y + sourceHandle.height / 2;
					sourcePosition = sourceHandle.position ?? Position.Right;
				}
			}
			const [path] = getBezierPath({
				sourceX,
				sourceY,
				sourcePosition,
				targetX: props.toX,
				targetY: props.toY,
				targetPosition: props.toPosition,
			});
			return (
				<path
					d={path}
					fill="none"
					className="react-flow__connection-path"
					style={props.connectionLineStyle}
				/>
			);
		},
		[flowInstance],
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
					x: clientX - rect.left + 8,
					y: clientY - rect.top + 8,
				},
				flowPosition: flowInstance.screenToFlowPosition(
					{ x: clientX + FLOW_NODE_CREATE_OFFSET, y: clientY + FLOW_NODE_CREATE_OFFSET },
					{ snapToGrid, snapGrid: FLOW_SNAP_GRID },
				),
				definitions,
				connection,
			});
		},
		[controller.nodeDefinitions, flowInstance, snapToGrid],
	);
	const selectPickerNode = useCallback(
		(type: FlowNodeTypeId): void => {
			if (picker === null) return;
			const connection = picker.connection;
			if (connection === null) void controller.createNode(type, picker.flowPosition.x, picker.flowPosition.y);
			else {
				const definition = picker.definitions.find((candidate): boolean => candidate.typeId === type);
				const neededDirection = connection.direction === "from_existing" ? "input" : "output";
				const newPort =
					definition === undefined
						? undefined
						: resolveFlowDefinitionPorts(definition, definition.defaultConfig).find(
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
	const deleteSelectedElements = useCallback((): void => {
		if (controller.isGraphLocked || flowInstance === null) return;
		const selectedNodes = flowInstance.getNodes().filter((node): boolean => node.selected === true);
		const selectedNodeIds = new Set(selectedNodes.map((node): string => node.id));
		const selectedEdges = flowInstance
			.getEdges()
			.filter(
				(edge): boolean =>
					edge.selected === true && !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target),
			);
		if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
		setNodes((current): FlowCanvasNode[] => current.filter((node): boolean => !selectedNodeIds.has(node.id)));
		for (const node of selectedNodes) void controller.deleteNode(node.id);
		for (const edge of selectedEdges) void controller.deleteEdge(edge.id);
	}, [controller.deleteEdge, controller.deleteNode, controller.isGraphLocked, flowInstance]);
	const matchesFlowShortcut = useCallback(
		(event: KeyboardEvent, commandId: ShortcutCommandId): boolean =>
			matchesShortcutKeyboardEvent(
				event,
				getEffectiveShortcutBinding(keyboardShortcuts, commandId),
				shortcutPlatform,
			),
		[keyboardShortcuts, shortcutPlatform],
	);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent): void => {
			const target = event.target as HTMLElement | null;
			if (matchesFlowShortcut(event, "flow.run")) {
				event.preventDefault();
				if (running) void controller.stopRun();
				else void startRequestedRun();
				return;
			}
			if (target?.matches('input, textarea, [contenteditable="true"]')) return;
			if (matchesFlowShortcut(event, "flow.undo")) {
				event.preventDefault();
				controller.undo();
				return;
			}
			if (matchesFlowShortcut(event, "flow.redo")) {
				event.preventDefault();
				controller.redo();
				return;
			}
			if (matchesFlowShortcut(event, "flow.fitCanvas")) {
				event.preventDefault();
				flowInstance?.fitView({ duration: 250, padding: 0.2 });
				return;
			}
			if (matchesFlowShortcut(event, "flow.addNode") || matchesFlowShortcut(event, "flow.searchNodes")) {
				event.preventDefault();
				const rect = canvasRef.current?.getBoundingClientRect();
				if (rect !== undefined)
					openPickerAt(rect.left + rect.width / 2, rect.top + Math.min(180, rect.height / 2));
				return;
			}
			if (matchesFlowShortcut(event, "flow.deleteSelection")) {
				event.preventDefault();
				deleteSelectedElements();
			}
		},
		[
			controller.redo,
			controller.stopRun,
			controller.undo,
			deleteSelectedElements,
			flowInstance,
			matchesFlowShortcut,
			openPickerAt,
			running,
			startRequestedRun,
		],
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
			if (dataType === null) return;
			const detachedEdgeId = detachedEdgeIdRef.current;
			if (detachedEdgeId !== null)
				void controller.reconnectEdge(
					detachedEdgeId,
					connection.source,
					connection.target,
					connection.sourceHandle,
					connection.targetHandle,
					dataType,
				);
			else
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
	const onReconnect = useCallback<OnReconnect<Edge>>(
		(edge, connection): void => {
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
			if (dataType === null) return;
			void controller.reconnectEdge(
				edge.id,
				connection.source,
				connection.target,
				connection.sourceHandle,
				connection.targetHandle,
				dataType,
			);
		},
		[controller, snapshot],
	);
	const onReconnectEnd = useCallback(
		(_event: MouseEvent | TouchEvent, edge: Edge, _handleType: "source" | "target", state: FinalConnectionState): void => {
			if (state.toHandle === null) void controller.deleteEdge(edge.id);
		},
		[controller.deleteEdge],
	);
	const onConnectEnd = useCallback(
		(event: MouseEvent | TouchEvent, state: FinalConnectionState): void => {
			const started = connectStartRef.current;
			const detachedEdgeId = detachedEdgeIdRef.current;
			connectStartRef.current = null;
			detachedEdgeIdRef.current = null;
			detachedConnectionSourceRef.current = null;
			setReconnectingEdgeId(null);
			if (
				started === null ||
				started.nodeId === null ||
				started.handleId === null ||
				snapshot === null
			)
				return;
			if (detachedEdgeId !== null) {
				if (state.toHandle === null) void controller.deleteEdge(detachedEdgeId);
				return;
			}
			if (state.toHandle !== null) return;
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
				const candidate = resolveFlowDefinitionPorts(definition, definition.defaultConfig).find(
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
		[controller.deleteEdge, controller.nodeDefinitions, openPickerAt, snapshot],
	);
	const finishInteractionSample = useCallback((kind?: InteractionSample["kind"]): void => {
		const sample = interactionSampleRef.current;
		if (sample === null || (kind !== undefined && sample.kind !== kind)) return;
		interactionSampleRef.current = null;
		performance.clearMeasures("daedalus.flow.interaction");
		performance.measure("daedalus.flow.interaction", {
			start: sample.startedAt,
			end: performance.now(),
			detail: {
				kind: sample.kind,
			},
		});
	}, []);
	const startInteractionSample = useCallback(
		(kind: InteractionSample["kind"]): void => {
			finishInteractionSample();
			interactionSampleRef.current = { kind, startedAt: performance.now() };
		},
		[finishInteractionSample],
	);
	useEffect(
		(): (() => void) =>
			(): void => {
				finishInteractionSample();
				canvasRef.current?.removeAttribute("data-flow-moving");
			},
		[finishInteractionSample],
	);
	const onNodeDragStop = useCallback<OnNodeDrag<FlowCanvasNode>>(
		(_event, node): void => {
			finishInteractionSample("node-drag");
			const { x, y } = node.position;
			void controller.updateNodePosition(node.id, x, y);
		},
		[controller.updateNodePosition, finishInteractionSample],
	);
	const onMoveStart = useCallback((): void => {
		startInteractionSample("viewport");
		canvasRef.current?.setAttribute("data-flow-moving", "true");
	}, [startInteractionSample]);
	const onMoveEnd = useCallback(
		(_event: unknown, viewport: { x: number; y: number; zoom: number }): void => {
			finishInteractionSample("viewport");
			canvasRef.current?.removeAttribute("data-flow-moving");
			void controller.updateViewport(viewport);
		},
		[controller.updateViewport, finishInteractionSample],
	);

	if (snapshot === null)
		return (
			<section className={styles.flowSurface} data-studio-flow-surface="true">
				<header className={styles.flowHeader}>
					<Typography.Text className={styles.flowTitle}>
						{t("flow.welcome.nodeTitle", {
							defaultValue: "Build a workflow from nodes",
						})}
					</Typography.Text>
				</header>
				<div className={`${styles.canvasRegion} ${styles.flowWelcomeCanvasRegion}`}>
					<FlowWelcome
						mode="create"
						workspaces={workspaceOptions}
						isCreating={controller.isMutating}
						errorMessage={controller.error}
						onCreate={(workspaceId): void => {
							void controller.createNewFlow(workspaceId);
						}}
					/>
				</div>
			</section>
		);
	return (
		<section className={styles.flowSurface} data-studio-flow-surface="true">
			<header className={styles.flowHeader}>
				<Typography.Text className={styles.flowTitle}>{snapshot.flow.title}</Typography.Text>
				<Flex align="center" gap="small" className={styles.flowHeaderActions}>
					<Tooltip title={t("files.editorMenu.undo")} placement="bottom">
						<Button
							type="text"
							shape="circle"
							disabled={!controller.canUndo || controller.isGraphLocked}
							icon={<Icon name="undo" />}
							onClick={controller.undo}
						/>
					</Tooltip>
					<Tooltip title={t("files.editorMenu.redo")} placement="bottom">
						<Button
							type="text"
							shape="circle"
							disabled={!controller.canRedo || controller.isGraphLocked}
							icon={<Icon name="redo" />}
							onClick={controller.redo}
						/>
					</Tooltip>
					<Tooltip
						title={t(snapToGrid ? "flow.editor.disableSnap" : "flow.editor.enableSnap")}
						placement="bottom"
					>
						<Button
							type="text"
							shape="circle"
							icon={<Icon name={snapToGrid ? "snap-on" : "snap-off"} />}
							aria-label={t(snapToGrid ? "flow.editor.disableSnap" : "flow.editor.enableSnap")}
							aria-pressed={snapToGrid}
							onClick={(): void => {
								const previous = snapToGrid;
								const next = !previous;
								setSnapToGrid(next);
								void updateClientPreferences({ flowSnapToGrid: next }).catch((): void => {
									setSnapToGrid(previous);
								});
							}}
						/>
					</Tooltip>
					<Tooltip title={t("flow.editor.search")} placement="bottom">
						<Button
							type="text"
							shape="circle"
							icon={<Icon name="search" />}
							aria-label={t("flow.editor.search")}
							onClick={(): void => openSearch()}
						/>
					</Tooltip>
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
							else void startRequestedRun();
						}}
					>
						{running ? t("flow.editor.stop") : t("flow.editor.run")}
					</Button>
				</Flex>
			</header>
			{controller.error !== null ? (
				<Alert className={styles.flowAlert} type="error" showIcon title={controller.error} />
			) : null}
			<div
				ref={canvasRef}
				className={styles.canvasRegion}
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
							mode="empty"
							errorMessage={null}
							onAddPrompt={(): void => {
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
					onNodeDragStart={(): void => startInteractionSample("node-drag")}
					onNodeDragStop={onNodeDragStop}
					onConnect={onConnect}
					onConnectStart={(_event, params): void => {
						closePicker();
						connectStartRef.current = params;
						detachedEdgeIdRef.current = null;
						detachedConnectionSourceRef.current = null;
						setReconnectingEdgeId(null);
						if (params.handleType !== "target" || params.nodeId === null || params.handleId === null)
							return;
						const targetNode = snapshot.nodes.find((node): boolean => node.nodeId === params.nodeId);
						const targetPort = portFor(targetNode, controller.nodeDefinitions, params.handleId, "input");
						if (targetPort?.multiple === true) return;
						const detachedEdge = snapshot.edges.find(
								(edge): boolean =>
									edge.targetNodeId === params.nodeId && edge.targetPort === params.handleId,
							);
						if (detachedEdge === undefined) return;
						detachedEdgeIdRef.current = detachedEdge.edgeId;
						detachedConnectionSourceRef.current = {
							edgeId: detachedEdge.edgeId,
							sourceNodeId: detachedEdge.sourceNodeId,
							sourcePort: detachedEdge.sourcePort,
						};
						setReconnectingEdgeId(detachedEdge.edgeId);
					}}
					onConnectEnd={onConnectEnd}
					connectionLineComponent={connectionLineComponent}
					onReconnect={onReconnect}
					onReconnectStart={closePicker}
					onReconnectEnd={onReconnectEnd}
					edgesReconnectable={!controller.isGraphLocked}
					reconnectRadius={18}
					onMoveStart={onMoveStart}
					onMoveEnd={onMoveEnd}
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
					onlyRenderVisibleElements={nodes.length >= 80}
					snapToGrid={snapToGrid}
					snapGrid={FLOW_SNAP_GRID}
					deleteKeyCode={null}
				>
					<Background gap={24} size={1} />
					<Controls showInteractive={false} />
				</ReactFlow>
				<FlowNodePicker
					open={picker !== null}
					position={picker?.position ?? { x: 0, y: 0 }}
					definitions={picker?.definitions ?? controller.nodeDefinitions}
					workspaceAvailable={snapshot.flow.workspaceId !== null}
					onSelect={selectPickerNode}
					onClose={closePicker}
				/>
			</div>
		</section>
	);
}

export default HomeFlowSurface;
