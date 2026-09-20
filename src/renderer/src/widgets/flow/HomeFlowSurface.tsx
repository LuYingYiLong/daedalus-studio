import { Alert, Badge, Button, Divider, Dropdown, Flex, Input, Spin, Tooltip, Typography } from "antd";
import type { InputRef, MenuProps } from "antd";
import {
	BaseEdge,
	Controls,
	Position,
	ReactFlow,
	SelectionMode,
	getBezierPath,
	type Connection,
	type ConnectionLineComponentProps,
	type Edge,
	type EdgeProps,
	type FinalConnectionState,
	type HandleType,
	type OnConnectStartParams,
	type OnNodeDrag,
	type OnReconnect,
	type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type MutableRefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { HomeFlowController } from "@/features/home/flow/useHomeFlowController";
import { getCachedClientPreferences, updateClientPreferences } from "@/platform/rpc/client-preferences-api";
import { listProviderModels, type ProviderModelInfo, type ProviderModelSelection } from "@/platform/rpc/provider-api";
import {
	detectShortcutPlatform,
	getEffectiveShortcutBinding,
	matchesShortcutKeyboardEvent,
	type KeyboardShortcutOverrides,
	type ShortcutCommandId,
} from "@/platform/rpc/keyboard-shortcuts";
import type {
	FlowDocumentEdge,
	FlowDocumentNode,
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
	resolveFlowCanvasPorts,
	resolveFlowDefinitionPorts,
	type FlowCanvasNodeData,
	type FlowNodeEditorOptions,
} from "./FlowNodes";
import { flowPortColor } from "./flow-port-colors";
import FlowNodeShell, { type FlowInteractionNode as FlowCanvasNode } from "./FlowNodeShell";
import FlowCanvasLayer from "./FlowCanvasLayer";
import { FlowRenderRuntime } from "./flow-render-runtime";
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
	sideDockOpen: boolean;
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

const nodeTypes = { flowNode: FlowNodeShell };
type FlowEdgeData = { sourceColor: string; targetColor: string };
export type FlowCanvasEdge = Edge<FlowEdgeData, "flowGradient">;

function oppositeFlowPosition(position: Position): Position {
	switch (position) {
		case Position.Left:
			return Position.Right;
		case Position.Right:
			return Position.Left;
		case Position.Top:
			return Position.Bottom;
		case Position.Bottom:
			return Position.Top;
	}
}

function FlowGradientEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
	style,
	markerStart,
	markerEnd,
	interactionWidth,
}: EdgeProps<FlowCanvasEdge>): React.JSX.Element {
	const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
	const gradientId = `flow-edge-gradient-${id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
	return (
		<>
			<defs>
				<linearGradient
					id={gradientId}
					gradientUnits="userSpaceOnUse"
					x1={sourceX}
					y1={sourceY}
					x2={targetX}
					y2={targetY}
				>
					<stop offset="0%" stopColor={data?.sourceColor ?? "hsl(215 14% 65%)"} />
					<stop offset="100%" stopColor={data?.targetColor ?? "hsl(215 14% 65%)"} />
				</linearGradient>
			</defs>
			<BaseEdge
				path={path}
				markerStart={markerStart}
				markerEnd={markerEnd}
				interactionWidth={interactionWidth ?? 24}
				// Canvas 始终绘制渐变；SVG 只保留命中、选择和重连，不叠加第二条可见描边
				style={{ ...style, stroke: `url(#${gradientId})`, strokeWidth: 2, strokeOpacity: 0 }}
			/>
		</>
	);
}

const edgeTypes = { flowGradient: FlowGradientEdge };
const FLOW_NODE_WIDTH = 320;
const FLOW_NODE_HEIGHT = 220;
const FLOW_NODE_GAP = 28;
const FLOW_SNAP_GRID: [number, number] = [24, 24];
const FLOW_NODE_CREATE_OFFSET = 32;
const EMPTY_CONNECTED_INPUT_IDS: ReadonlySet<string> = new Set<string>();
const EMPTY_EDITOR_OPTIONS: FlowNodeEditorOptions = { modelSelection: null, modelsByProvider: {} };

function usesEditorResources(definition: FlowNodeTypeDefinition | null): boolean {
	const properties = definition?.configSchema.properties;
	if (!properties || typeof properties !== "object" || Array.isArray(properties)) return false;
	return Object.entries(properties).some(([key, field]) => {
		if (["provider", "model", "reasoningEffort"].includes(key)) return true;
		if (!field || typeof field !== "object" || Array.isArray(field)) return false;
		const schema = field as Record<string, unknown>;
		return (
			["provider", "model", "reasoning-effort", "workspace-file"].includes(String(schema["x-daedalus-control"])) ||
			schema.format === "workspace-file" ||
			(definition?.typeId === "builtin/file-input" && key === "path")
		);
	});
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
): "text" | "json" | "image" | "video" | "audio" | "frames" | "artifact" | null {
	return source.dataTypes.find((dataType): boolean => target.dataTypes.includes(dataType)) ?? null;
}

type FlowRunEntryGroup = {
	label: string;
	nodeIds: string[];
	targetNodeIds: string[];
};

function groupFlowRunEntries(
	nodes: readonly FlowDocumentNode[],
	edges: readonly FlowDocumentEdge[],
): FlowRunEntryGroup[] {
	const groups = new Map<string, FlowDocumentNode[]>();
	for (const node of nodes.filter((candidate): boolean => candidate.typeId === "builtin/flow-input")) {
		const configuredLabel = typeof node.config.label === "string" ? node.config.label.trim() : "";
		const label = configuredLabel.length > 0 ? configuredLabel : node.title;
		const group = groups.get(label) ?? [];
		group.push(node);
		groups.set(label, group);
	}
	return [...groups.entries()].map(([label, entries]): FlowRunEntryGroup => {
		const nodeIds = entries.map((entry): string => entry.nodeId);
		return {
			label,
			nodeIds,
			targetNodeIds: reachableOutputNodeIds(nodeIds, nodes, edges),
		};
	});
}

function reachableOutputNodeIds(
	entryNodeIds: readonly string[],
	nodes: readonly FlowDocumentNode[],
	edges: readonly FlowDocumentEdge[],
): string[] {
	const outputNodeIds = new Set(
		nodes.filter((node): boolean => node.typeId === "builtin/output").map((node): string => node.nodeId),
	);
	const outgoing = new Map<string, string[]>();
	for (const edge of edges) {
		const targets = outgoing.get(edge.sourceNodeId) ?? [];
		targets.push(edge.targetNodeId);
		outgoing.set(edge.sourceNodeId, targets);
	}
	const reachable = new Set(entryNodeIds);
	const queue = [...entryNodeIds];
	while (queue.length > 0) {
		const sourceNodeId = queue.shift()!;
		for (const targetNodeId of outgoing.get(sourceNodeId) ?? []) {
			if (reachable.has(targetNodeId)) continue;
			reachable.add(targetNodeId);
			queue.push(targetNodeId);
		}
	}
	return [...reachable].filter((nodeId): boolean => outputNodeIds.has(nodeId));
}

function HomeFlowSurface({
	controller,
	keyboardShortcuts,
	providerModelSelection,
	workspaceOptions,
	sideDockOpen,
	searchHandleRef,
}: HomeFlowSurfaceProps): React.JSX.Element {
	const { t } = useTranslation();
	const snapshot = controller.snapshot;
	const runtime = useMemo(
		() => new FlowRenderRuntime(controller.documentStore, controller.runStore),
		[controller.documentStore, controller.runStore, snapshot?.flow.flowId],
	);
	const [overlayEdgeIds, setOverlayEdgeIds] = useState<readonly string[]>([]);
	useEffect(() => {
		const flush = (): void => runtime.canvas.flush();
		controller.documentStore.editorFlushers.add(flush);
		window.addEventListener("blur", flush);
		window.addEventListener("beforeunload", flush);
		return () => {
			controller.documentStore.editorFlushers.delete(flush);
			window.removeEventListener("blur", flush);
			window.removeEventListener("beforeunload", flush);
			runtime.dispose();
		};
	}, [runtime]);
	const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
	const [picker, setPicker] = useState<PickerState | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchIndex, setSearchIndex] = useState(0);
	const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowCanvasNode, FlowCanvasEdge> | null>(null);
	const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null);
	const reconnectingOverlayEdgeRef = useRef<string | null>(null);
	const [snapToGrid, setSnapToGrid] = useState<boolean>((): boolean => getCachedClientPreferences().flowSnapToGrid);
	const [runEntryByFlowId, setRunEntryByFlowId] = useState<Record<string, string>>(
		(): Record<string, string> => getCachedClientPreferences().flowRunEntryByFlowId,
	);
	const [consentText, setConsentText] = useState<Record<string, string>>({});
	const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModelInfo[]>>({});
	const canvasNodeMembershipKey = useMemo(
		(): string =>
			nodes
				.map((node): string => node.id)
				.sort()
				.join("\u0000"),
		[nodes],
	);
	const canvasNodeIds = useMemo(
		(): ReadonlySet<string> =>
			new Set(canvasNodeMembershipKey.length === 0 ? [] : canvasNodeMembershipKey.split("\u0000")),
		[canvasNodeMembershipKey],
	);
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const lastPointerPositionRef = useRef<{ x: number; y: number } | null>(null);
	const searchInputRef = useRef<InputRef | null>(null);
	const connectStartRef = useRef<OnConnectStartParams | null>(null);
	const detachedEdgeIdRef = useRef<string | null>(null);
	const detachedConnectionSourceRef = useRef<DetachedConnectionSource | null>(null);
	const interactionSampleRef = useRef<InteractionSample | null>(null);
	const loadingProviderModelsRef = useRef<Set<string>>(new Set());
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
		(): FlowNodeEditorOptions => ({
			modelSelection: providerModelSelection,
			modelsByProvider,
			selectWorkspaceFile:
				snapshot?.flow.workspaceId === null
					? undefined
					: async (): Promise<string | null> => {
							const workspace = workspaceOptions.find(
								(candidate): boolean => candidate.id === snapshot?.flow.workspaceId,
							);
							if (workspace === undefined || window.electronAPI === undefined) return null;
							const entries = await window.electronAPI.workspaceFs.pickWorkspaceFiles({
								workspaceRoot: workspace.rootPath,
							});
							return entries?.[0]?.relativePath ?? null;
						},
		}),
		[modelsByProvider, providerModelSelection, snapshot?.flow.workspaceId, workspaceOptions],
	);
	const latestRun = snapshot?.runs[0];
	const running = latestRun?.status === "running" || latestRun?.status === "queued" || latestRun?.status === "waiting";
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
	const runEntryGroups = useMemo(
		(): FlowRunEntryGroup[] => groupFlowRunEntries(snapshot?.nodes ?? [], snapshot?.edges ?? []),
		[snapshot?.edges, snapshot?.nodes],
	);
	const outputNodeIds = useMemo(
		(): string[] =>
			snapshot?.nodes.filter((node): boolean => node.typeId === "builtin/output").map((node): string => node.nodeId) ??
			[],
		[snapshot?.nodes],
	);
	const selectedRunEntryGroup = useMemo((): FlowRunEntryGroup | null => {
		if (snapshot === null) return null;
		const savedLabel = runEntryByFlowId[snapshot.flow.flowId];
		const saved = runEntryGroups.find((group): boolean => group.label === savedLabel);
		return saved?.targetNodeIds.length
			? saved
			: (runEntryGroups.find((group): boolean => group.targetNodeIds.length > 0) ?? saved ?? runEntryGroups[0] ?? null);
	}, [runEntryByFlowId, runEntryGroups, snapshot?.flow.flowId]);
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
					setModelsByProvider(
						(current): Record<string, ProviderModelInfo[]> => ({
							...current,
							[providerId]: result.models,
						}),
					);
				})
				.catch((): void => {
					setModelsByProvider(
						(current): Record<string, ProviderModelInfo[]> => ({
							...current,
							[providerId]: [],
						}),
					);
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
		async (request?: Parameters<HomeFlowController["startRun"]>[0]): Promise<boolean> => {
			await commitActiveEditor();
			return controller.startRun(request);
		},
		[commitActiveEditor, controller.startRun],
	);
	const rememberRunEntry = useCallback(
		(entryLabel: string): void => {
			if (snapshot === null || runEntryByFlowId[snapshot.flow.flowId] === entryLabel) return;
			const previous = runEntryByFlowId;
			const next = { ...previous, [snapshot.flow.flowId]: entryLabel };
			setRunEntryByFlowId(next);
			void updateClientPreferences({ flowRunEntryByFlowId: next }).catch((): void => {
				setRunEntryByFlowId(
					(current): Record<string, string> => (current[snapshot.flow.flowId] === entryLabel ? previous : current),
				);
			});
		},
		[runEntryByFlowId, snapshot?.flow.flowId],
	);
	const runEntryGroup = useCallback(
		async (group: FlowRunEntryGroup, forceNodeIds?: string[]): Promise<boolean> => {
			rememberRunEntry(group.label);
			return startRequestedRun({
				entryNodeIds: group.nodeIds,
				targetNodeIds: group.targetNodeIds,
				forceNodeIds: forceNodeIds ?? snapshot?.nodes.map((node): string => node.nodeId) ?? [],
			});
		},
		[rememberRunEntry, snapshot?.nodes, startRequestedRun],
	);
	const runSelectedEntry = useCallback(
		async (forceNodeIds?: string[]): Promise<boolean> => {
			if (selectedRunEntryGroup !== null) return runEntryGroup(selectedRunEntryGroup, forceNodeIds);
			return startRequestedRun({
				targetNodeIds: outputNodeIds,
				forceNodeIds: forceNodeIds ?? snapshot?.nodes.map((node): string => node.nodeId) ?? [],
			});
		},
		[outputNodeIds, runEntryGroup, selectedRunEntryGroup, snapshot?.nodes, startRequestedRun],
	);
	const runEntryMenu = useMemo<MenuProps>(
		() => ({
			items:
				runEntryGroups.length === 0
					? [{ key: "no-entry", label: t("flow.editor.noRunInputs"), disabled: true }]
					: runEntryGroups.map((group): NonNullable<MenuProps["items"]>[number] => ({
							key: group.label,
							label:
								group.nodeIds.length > 1
									? t("flow.editor.runEntryConcurrent", {
											input: group.label,
											count: group.nodeIds.length,
										})
									: t("flow.editor.runEntry", { input: group.label }),
							disabled: group.targetNodeIds.length === 0,
						})),
			selectedKeys: selectedRunEntryGroup === null ? [] : [selectedRunEntryGroup.label],
			onClick: ({ key }): void => {
				const group = runEntryGroups.find((candidate): boolean => candidate.label === key);
				if (group !== undefined) void runEntryGroup(group);
			},
		}),
		[runEntryGroup, runEntryGroups, selectedRunEntryGroup, t],
	);
	const canRunSelectedEntry =
		selectedRunEntryGroup === null ? outputNodeIds.length > 0 : selectedRunEntryGroup.targetNodeIds.length > 0;
	const updateCanvasNode = useCallback(
		(nodeId: string, patch: Record<string, unknown>): void => {
			void controller.updateNode(nodeId, patch);
		},
		[controller.updateNode],
	);
	const runCanvasNodeActionImpl = useCallback(
		(nodeId: string, action: string): void => {
			if (action === "run-input") {
				const flowNodes = snapshot?.nodes ?? [];
				const flowEdges = snapshot?.edges ?? [];
				const node = flowNodes.find((candidate): boolean => candidate.nodeId === nodeId);
				if (node?.typeId !== "builtin/flow-input") return;
				void startRequestedRun({
					entryNodeIds: [nodeId],
					targetNodeIds: reachableOutputNodeIds([nodeId], flowNodes, flowEdges),
					forceNodeIds: flowNodes.map((candidate): string => candidate.nodeId),
				});
				return;
			}
			if (action === "run") void runSelectedEntry([nodeId]);
		},
		[runSelectedEntry, snapshot?.edges, snapshot?.nodes, startRequestedRun],
	);
	const actionRef = useRef(runCanvasNodeActionImpl);
	actionRef.current = runCanvasNodeActionImpl;
	const runCanvasNodeAction = useCallback(
		(nodeId: string, action: string): void => actionRef.current(nodeId, action),
		[],
	);

	useEffect((): void => {
		const retained = new Set(snapshot?.nodes.map((node) => node.nodeId) ?? []);
		for (const [id] of runtime.views.entries())
			if (!retained.has(id)) {
				runtime.views.delete(id);
				runtime.canvas.removeNode(id);
			}
		const runDisabled = controller.isGraphLocked || controller.runRequestStage !== "idle";
		for (const flowNode of snapshot?.nodes ?? []) {
			const registered = definitionsByType.get(flowNode.typeId);
			const definition =
				registered?.pluginVersion === flowNode.pluginVersion &&
				registered.pluginFingerprint === flowNode.pluginFingerprint &&
				registered.configVersion === flowNode.configVersion
					? registered
					: null;
			const previous = runtime.views.get(flowNode.nodeId);
			let connectedInputIds = connectedInputIdsByNode.get(flowNode.nodeId) ?? EMPTY_CONNECTED_INPUT_IDS;
			if (
				previous &&
				previous.connectedInputIds.size === connectedInputIds.size &&
				[...connectedInputIds].every((id) => previous.connectedInputIds.has(id))
			)
				connectedInputIds = previous.connectedInputIds;
			const value: FlowCanvasNodeData = {
				flowNode,
				nodeRun: null,
				definition,
				editorOptions: usesEditorResources(definition) ? editorOptions : EMPTY_EDITOR_OPTIONS,
				connectedInputIds,
				matched: matchingIds.has(flowNode.nodeId),
				locked: controller.isGraphLocked,
				runDisabled,
				onUpdate: updateCanvasNode,
				onAction: runCanvasNodeAction,
			};
			if (
				!previous ||
				(Object.keys(value) as Array<keyof FlowCanvasNodeData>).some((key) => value[key] !== previous[key])
			)
				runtime.views.set(flowNode.nodeId, value);
			runtime.canvas.acceptConfig(flowNode.nodeId, flowNode.config);
		}
		setNodes((current) => {
			const byId = new Map((flowInstance?.getNodes() ?? current).map((node) => [node.id, node]));
			const next = (snapshot?.nodes ?? []).map((node): FlowCanvasNode => {
				const previous = byId.get(node.nodeId);
				if (
					previous?.data.runtime === runtime &&
					(previous.dragging || (previous.position.x === node.x && previous.position.y === node.y))
				)
					return previous;
				return {
					...previous,
					id: node.nodeId,
					type: "flowNode",
					position: { x: node.x, y: node.y },
					data: previous?.data.runtime === runtime ? previous.data : { nodeId: node.nodeId, runtime },
				};
			});
			return next.length === current.length && next.every((node, index) => node === current[index]) ? current : next;
		});
	}, [
		runtime,
		flowInstance,
		controller.isGraphLocked,
		controller.runRequestStage,
		connectedInputIdsByNode,
		definitionsByType,
		editorOptions,
		matchingIds,
		runCanvasNodeAction,
		snapshot?.nodes,
		updateCanvasNode,
	]);
	useEffect(() => {
		flowInstance?.setNodes(nodes);
	}, [flowInstance, nodes]);
	useEffect((): void => {
		if (reconnectingEdgeId === null) return;
		if ((snapshot?.edges ?? []).some((edge): boolean => edge.edgeId === reconnectingEdgeId)) return;
		// The backend may acknowledge a replacement before ReactFlow emits its
		// reconnect-end callback. Do not keep filtering the old edge id.
		setReconnectingEdgeId(null);
	}, [reconnectingEdgeId, snapshot?.edges]);
	const previousEdgesRef = useRef<FlowCanvasEdge[]>([]);
	const edges = useMemo((): FlowCanvasEdge[] => {
		const nodeById = new Map(snapshot?.nodes.map((node) => [node.nodeId, node]));
		const previousById = new Map(previousEdgesRef.current.map((edge) => [edge.id, edge]));
		const next = (snapshot?.edges ?? [])
			.filter((edge): boolean => canvasNodeIds.has(edge.sourceNodeId) && canvasNodeIds.has(edge.targetNodeId))
			.map((edge): FlowCanvasEdge => {
				const sourceNode = nodeById.get(edge.sourceNodeId);
				const targetNode = nodeById.get(edge.targetNodeId);
				const sourcePort = portFor(sourceNode, controller.nodeDefinitions, edge.sourcePort, "output");
				const targetPort = portFor(targetNode, controller.nodeDefinitions, edge.targetPort, "input");
				const sourceColor = flowPortColor(sourcePort?.dataTypes ?? [edge.dataType]);
				const targetColor = flowPortColor(targetPort?.dataTypes ?? [edge.dataType]);
				const previous = previousById.get(edge.edgeId);
				if (
					previous?.source === edge.sourceNodeId &&
					previous.target === edge.targetNodeId &&
					previous.sourceHandle === edge.sourcePort &&
					previous.targetHandle === edge.targetPort &&
					previous.data?.sourceColor === sourceColor &&
					previous.data?.targetColor === targetColor
				)
					return previous;
				return {
					id: edge.edgeId,
					source: edge.sourceNodeId,
					target: edge.targetNodeId,
					sourceHandle: edge.sourcePort,
					targetHandle: edge.targetPort,
					type: "flowGradient",
					data: {
						sourceColor,
						targetColor,
					},
				};
			});
		if (
			next.length !== previousEdgesRef.current.length ||
			next.some((edge, index) => edge !== previousEdgesRef.current[index])
		)
			previousEdgesRef.current = next;
		return previousEdgesRef.current;
	}, [canvasNodeIds, controller.nodeDefinitions, snapshot?.edges, snapshot?.nodes]);
	const connectionLineComponent = useCallback(
		(props: ConnectionLineComponentProps<FlowCanvasNode>): React.JSX.Element => {
			const source = detachedConnectionSourceRef.current;
			let sourceX = props.fromX;
			let sourceY = props.fromY;
			let sourcePosition = props.fromPosition;
			let targetPosition = props.toPosition;
			const resolveHandleColor = (
				nodeId: string | null | undefined,
				portId: string | null | undefined,
				handleType: HandleType | null | undefined,
			): string => {
				if (nodeId === null || nodeId === undefined) return flowPortColor(undefined);
				const node = snapshot?.nodes.find((candidate): boolean => candidate.nodeId === nodeId);
				if (node === undefined) return flowPortColor(undefined);
				const direction = handleType === "target" ? "input" : "output";
				return flowPortColor(portFor(node, controller.nodeDefinitions, portId, direction)?.dataTypes);
			};
			if (source !== null) {
				const internalNode = flowInstance?.getInternalNode(source.sourceNodeId);
				const sourceHandle = internalNode?.internals.handleBounds?.source?.find(
					(handle): boolean => handle.id === source.sourcePort,
				);
				if (internalNode !== undefined && sourceHandle !== undefined) {
					const handleX = internalNode.internals.positionAbsolute.x + sourceHandle.x;
					const handleY = internalNode.internals.positionAbsolute.y + sourceHandle.y;
					sourcePosition = sourceHandle.position ?? Position.Right;
					sourceX = handleX + sourceHandle.width / 2;
					sourceY = handleY + sourceHandle.height / 2;
					targetPosition = oppositeFlowPosition(sourcePosition);
				}
			}
			const sourceColor =
				source === null
					? resolveHandleColor(props.fromHandle?.nodeId, props.fromHandle?.id, props.fromHandle?.type)
					: resolveHandleColor(source.sourceNodeId, source.sourcePort, "source");
			const targetColor =
				props.toHandle === null || props.toHandle === undefined
					? sourceColor
					: resolveHandleColor(props.toHandle.nodeId, props.toHandle.id, props.toHandle.type);
			const [path] = getBezierPath({
				sourceX,
				sourceY,
				sourcePosition,
				targetX: props.toX,
				targetY: props.toY,
				targetPosition,
			});
			return (
				<>
					<defs>
						<linearGradient
							id="flow-connection-preview-gradient"
							gradientUnits="userSpaceOnUse"
							x1={sourceX}
							y1={sourceY}
							x2={props.toX}
							y2={props.toY}
						>
							<stop offset="0%" stopColor={sourceColor} />
							<stop offset="100%" stopColor={targetColor} />
						</linearGradient>
					</defs>
					<path
						d={path}
						fill="none"
						className="react-flow__connection-path"
						style={{
							...props.connectionLineStyle,
							stroke: "url(#flow-connection-preview-gradient)",
							strokeWidth: 2,
						}}
					/>
				</>
			);
		},
		[controller.nodeDefinitions, flowInstance, snapshot?.nodes],
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
			matchesShortcutKeyboardEvent(event, getEffectiveShortcutBinding(keyboardShortcuts, commandId), shortcutPlatform),
		[keyboardShortcuts, shortcutPlatform],
	);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent): void => {
			const target = event.target as HTMLElement | null;
			if (matchesFlowShortcut(event, "flow.run")) {
				event.preventDefault();
				if (running) void controller.stopRun();
				else if (canRunSelectedEntry) void runSelectedEntry();
				return;
			}
			if (target?.matches('input, textarea, [contenteditable="true"]')) return;
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
				event.preventDefault();
				controller.duplicateNodes(
					flowInstance
						?.getNodes()
						.filter((node) => node.selected)
						.map((node) => node.id) ?? [],
				);
				return;
			}
			if (event.key === "Enter") {
				const node = flowInstance?.getNodes().find((node) => node.selected);
				if (node && flowInstance) {
					event.preventDefault();
					runtime.canvas.pin(node.id, true);
					void flowInstance
						.setCenter(
							node.position.x + (node.measured?.width ?? 320) / 2,
							node.position.y + (node.measured?.height ?? 220) / 2,
							{ zoom: Math.max(0.75, flowInstance.getZoom()), duration: 180 },
						)
						.then(() =>
							canvasRef.current
								?.querySelector<HTMLElement>(
									`[data-flow-shell="${CSS.escape(node.id)}"] input, [data-flow-shell="${CSS.escape(node.id)}"] textarea`,
								)
								?.focus(),
						);
				}
				return;
			}
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
				if (rect !== undefined) {
					const pointer = lastPointerPositionRef.current;
					const inside =
						pointer !== null &&
						pointer.x >= rect.left &&
						pointer.x <= rect.right &&
						pointer.y >= rect.top &&
						pointer.y <= rect.bottom;
					openPickerAt(
						inside && pointer !== null ? pointer.x : rect.left + rect.width / 2,
						inside && pointer !== null ? pointer.y : rect.top + rect.height / 2,
					);
				}
				return;
			}
			if (matchesFlowShortcut(event, "flow.deleteSelection")) {
				event.preventDefault();
				deleteSelectedElements();
			}
		},
		[
			controller.redo,
			controller.duplicateNodes,
			runtime,
			controller.stopRun,
			controller.undo,
			deleteSelectedElements,
			flowInstance,
			matchesFlowShortcut,
			openPickerAt,
			running,
			canRunSelectedEntry,
			runSelectedEntry,
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
			// edge.create replaces a single-connection target atomically. Generate a
			// fresh edge id so ReactFlow cannot retain the old reconnecting edge in
			// its internal edge cache.
			void controller.createEdge(
				connection.source,
				connection.target,
				connection.sourceHandle,
				connection.targetHandle,
				dataType,
			);
			// A successful connection has already replaced the hidden edge locally.
			// Clear this immediately instead of waiting for onConnectEnd, which can
			// be skipped when the pointer is released over another Handle.
			setReconnectingEdgeId(null);
		},
		[controller, setReconnectingEdgeId, snapshot],
	);
	const onReconnect = useCallback<OnReconnect<FlowCanvasEdge>>(
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
			// A reconnect is represented by a new edge. The backend replaces the
			// occupied target port in the same transaction, while the fresh id makes
			// ReactFlow recalculate the visible path immediately.
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
		(
			_event: MouseEvent | TouchEvent,
			edge: FlowCanvasEdge,
			_handleType: "source" | "target",
			state: FinalConnectionState,
		): void => {
			reconnectingOverlayEdgeRef.current = null;
			detachedConnectionSourceRef.current = null;
			detachedEdgeIdRef.current = null;
			setReconnectingEdgeId(null);
			if (state.toHandle === null) void controller.deleteEdge(edge.id);
		},
		[controller.deleteEdge],
	);
	const onReconnectStart = useCallback(
		(_event: ReactMouseEvent, edge: FlowCanvasEdge, handleType: HandleType): void => {
			closePicker();
			reconnectingOverlayEdgeRef.current = edge.id;
			// 拖动目标端点时，XYFlow 会从原 source 开始创建预览线，显式保留它避免旧边隐藏后起点漂移。
			if (handleType === "source") {
				detachedConnectionSourceRef.current = {
					edgeId: edge.id,
					sourceNodeId: edge.source,
					sourcePort: edge.sourceHandle ?? "output",
				};
			}
		},
		[closePicker],
	);
	const onConnectEnd = useCallback(
		(event: MouseEvent | TouchEvent, state: FinalConnectionState): void => {
			const started = connectStartRef.current;
			const detachedEdgeId = detachedEdgeIdRef.current;
			connectStartRef.current = null;
			detachedEdgeIdRef.current = null;
			detachedConnectionSourceRef.current = null;
			setReconnectingEdgeId(null);
			if (started === null || started.nodeId === null || started.handleId === null || snapshot === null) return;
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
	const onNodeDragStop = useCallback<OnNodeDrag<FlowCanvasNode>>(
		(_event, _node, moved): void => {
			finishInteractionSample("node-drag");
			controller.updateNodePositions(
				moved
					.filter((node) => {
						const previous = runtime.document.get(node.id);
						return previous && (previous.x !== node.position.x || previous.y !== node.position.y);
					})
					.map((node) => ({ nodeId: node.id, ...node.position })),
			);
		},
		[controller.updateNodePositions, finishInteractionSample, runtime],
	);
	const onMoveStart = useCallback((): void => {
		startInteractionSample("viewport");
	}, [startInteractionSample]);
	const onMoveEnd = useCallback(
		(_event: unknown, viewport: { x: number; y: number; zoom: number }): void => {
			finishInteractionSample("viewport");
			void controller.updateViewport(viewport);
		},
		[controller.updateViewport, finishInteractionSample],
	);

	if (snapshot === null)
		return (
			<section className={styles.flowSurface} data-studio-flow-surface="true">
				<header className={styles.header} data-side-dock-open={sideDockOpen ? "true" : undefined}>
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
			<header className={styles.header} data-side-dock-open={sideDockOpen ? "true" : undefined}>
				<Typography.Text className={styles.flowTitle}>{snapshot.flow.title}</Typography.Text>
				<Flex align="center" gap="small" className={styles.headerActions}>
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
					<Tooltip title={t(snapToGrid ? "flow.editor.disableSnap" : "flow.editor.enableSnap")} placement="bottom">
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
					{running ? (
						<Button
							type="primary"
							danger
							icon={<Icon name="stop" />}
							onClick={(): void => {
								void controller.stopRun();
							}}
						>
							{t("flow.editor.stop")}
						</Button>
					) : (
						<Dropdown.Button
							type="primary"
							menu={runEntryMenu}
							trigger={["click"]}
							loading={controller.runRequestStage !== "idle"}
							disabled={!canRunSelectedEntry}
							icon={<Icon name="arrow-down" />}
							onClick={(): void => {
								void runSelectedEntry();
							}}
						>
							{controller.runRequestStage === "saving"
								? t("flow.editor.runSaving", { defaultValue: "Saving" })
								: controller.runRequestStage === "starting"
									? t("flow.editor.runStarting", { defaultValue: "Starting" })
									: selectedRunEntryGroup === null
										? t("flow.editor.run")
										: t("flow.editor.runEntry", { input: selectedRunEntryGroup.label })}
						</Dropdown.Button>
					)}
				</Flex>
			</header>
			{controller.error !== null ? (
				<Alert className={styles.flowAlert} type="error" showIcon title={controller.error} />
			) : null}
			<div
				ref={canvasRef}
				className={styles.canvasRegion}
				onPointerMove={(event): void => {
					lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };
				}}
				onContextMenu={(event): void => {
					if (controller.isGraphLocked || (event.target as Element).closest(".react-flow__node") !== null) return;
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
							matchingNodes.length === 0 ? 0 : (current - 1 + matchingNodes.length) % matchingNodes.length,
						)
					}
					onNext={(): void =>
						setSearchIndex((current): number => (matchingNodes.length === 0 ? 0 : (current + 1) % matchingNodes.length))
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
								if (rect !== undefined) openPickerAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
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
												<Typography.Text type="secondary">{approval.requiredConsent.prompt}</Typography.Text>
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
													consentText[approval.approvalId] !== approval.requiredConsent.expectedText
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
					defaultNodes={nodes}
					edges={edges
						.filter((edge) => edge.id !== reconnectingEdgeId && overlayEdgeIds.includes(edge.id))
						.map((edge) => ({ ...edge, selected: runtime.selectedEdges.has(edge.id) }))}
					onEdgesChange={(changes) => {
						for (const change of changes)
							if (change.type === "select") {
								if (change.selected) runtime.selectedEdges.add(change.id);
								else runtime.selectedEdges.delete(change.id);
							}
						if (changes.some((change) => change.type === "select")) setOverlayEdgeIds((current) => [...current]);
					}}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					defaultViewport={snapshot.flow.viewport}
					onInit={setFlowInstance}
					onNodeDragStart={(): void => startInteractionSample("node-drag")}
					onNodeDragStop={onNodeDragStop}
					onConnect={onConnect}
					onConnectStart={(_event, params): void => {
						closePicker();
						connectStartRef.current = params;
						// XYFlow 重连回调先于连接开始触发，保留原边的隐藏状态直到重连结束
						if (reconnectingOverlayEdgeRef.current !== null) {
							setReconnectingEdgeId(reconnectingOverlayEdgeRef.current);
							return;
						}
						const reconnectSource = detachedConnectionSourceRef.current;
						detachedEdgeIdRef.current = null;
						if (params.handleType !== "source" || reconnectSource === null) detachedConnectionSourceRef.current = null;
						setReconnectingEdgeId(null);
						if (params.handleType !== "target" || params.nodeId === null || params.handleId === null) return;
						const targetNode = snapshot.nodes.find((node): boolean => node.nodeId === params.nodeId);
						const targetPort = portFor(targetNode, controller.nodeDefinitions, params.handleId, "input");
						if (targetPort?.multiple === true) return;
						const detachedEdge = snapshot.edges.find(
							(edge): boolean => edge.targetNodeId === params.nodeId && edge.targetPort === params.handleId,
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
					onReconnectStart={onReconnectStart}
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
					selectionMode={SelectionMode.Partial}
					fitView={false}
					fitViewOptions={{ padding: 0.2 }}
					minZoom={0.05}
					maxZoom={2}
					onlyRenderVisibleElements={false}
					snapToGrid={snapToGrid}
					snapGrid={FLOW_SNAP_GRID}
					deleteKeyCode={null}
				>
					<FlowCanvasLayer
						runtime={runtime}
						edges={edges}
						excludedEdgeId={reconnectingEdgeId}
						onOverlayChange={setOverlayEdgeIds}
					/>
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
