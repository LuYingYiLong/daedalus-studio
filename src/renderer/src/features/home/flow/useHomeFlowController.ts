import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { archiveFlow, commitFlowPatch, createFlow, exportFlowData, exportFlowToSession, fetchFlow, fetchFlows, importFlowFromSession, moveFlowToWorkspace, renameFlow, startFlowRun, stopFlowRun, updateFlowSettings, listFlowNodeTypes, listFlowTools, listFlowApprovals, resolveFlowApproval, updateFlowTreeOrder as persistFlowTreeOrder, type CreateFlowParams } from "@/platform/rpc/flow-api";
import { onBackendEvent, onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import { BackendRpcError } from "@/platform/rpc/transport/backend-rpc-client";
import type { FlowDocumentSummary, FlowDocument, FlowDocumentEdge, FlowDocumentGroup, FlowDocumentNode, FlowDocumentNodeRun, FlowDocumentRun, FlowDocumentSnapshot, FlowNodeTypeId, FlowNodeTypeDefinition, FlowToolDefinition, FlowApproval, FlowOperation, FlowTreeOrder, FlowTreeOrderUpdate, SessionMetadata } from "@/platform/rpc/types";
import { createFlowMutationId, flowOperationOutbox } from "@/domain/flow/flow-operation-outbox";
import { applyFlowRunFinished, markActiveFlowRead, removeUnreadFlows } from "@/domain/flow/flow-unread";
import { FlowDocumentStore, FlowRunStore } from "@/domain/flow/flow-render-stores";
import type { FlowLayoutUpdate } from "@/domain/flow/flow-node-layout";

export type FlowNodeDetail = { node: FlowDocumentNode };
export type FlowRunRequest = {
	forceNodeIds?: string[];
	forceAllSelected?: boolean;
	entryNodeIds?: string[];
	targetNodeIds?: string[];
	inputValues?: Record<string, unknown>;
};
export type FlowRunRequestStage = "idle" | "saving" | "starting";

type UseHomeFlowControllerParams = {
	enabled: boolean;
	defaultFlow: Omit<CreateFlowParams, "title">;
	onOpenChat: (session: SessionMetadata) => void;
};

export type HomeFlowController = {
	documentStore: FlowDocumentStore;
	runStore: FlowRunStore;
	flows: FlowDocumentSummary[];
	flowOrder: FlowTreeOrder | null;
	flowRuntimeStatusById: Readonly<Record<string, "running" | "failed" | "completed">>;
	unreadFlowIds: ReadonlySet<string>;
	snapshot: FlowDocumentSnapshot | null;
	nodeDefinitions: FlowNodeTypeDefinition[];
	tools: FlowToolDefinition[];
	approvals: FlowApproval[];
	isGraphLocked: boolean;
	selectedNodeDetail: FlowNodeDetail | null;
	isLoading: boolean;
	isMutating: boolean;
	runRequestStage: FlowRunRequestStage;
	error: string | null;
	refresh: () => Promise<void>;
	createNewFlow: (workspaceId?: string | null) => Promise<boolean>;
	createFromChat: (session: SessionMetadata) => Promise<boolean>;
	selectFlow: (flowId: string) => Promise<void>;
	selectNode: (nodeId: string | null) => Promise<void>;
	copyCurrentBranchToChat: () => Promise<void>;
	renameCurrentFlow: (title: string) => Promise<void>;
	renameFlowById: (flowId: string, title: string) => Promise<void>;
	archiveFlowById: (flowId: string) => Promise<void>;
	archiveCurrentFlow: () => Promise<void>;
	updateFlowOrder: (order: FlowTreeOrderUpdate) => Promise<void>;
	moveFlowWorkspaceById: (flowId: string, workspaceId: string | null) => Promise<void>;
	createNode: (type: FlowNodeTypeId, x: number, y: number) => Promise<string | null>;
	createConnectedNode: (params: { type: FlowNodeTypeId; x: number; y: number; direction: "from_existing" | "to_existing"; existingNodeId: string; existingPort: string; newPort: string; dataType: FlowDocumentNode["ports"][number]["dataTypes"][number] }) => Promise<string | null>;
	updateNode: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
	updateNodePosition: (nodeId: string, x: number, y: number) => Promise<void>;
	updateNodePositions: (positions: Array<{ nodeId: string; x: number; y: number }>) => void;
	setNodeCollapsed: (nodeId: string, collapsed: boolean) => void;
	exportFlowDataById: (flowId: string, destinationPath: string) => ReturnType<typeof exportFlowData>;
	updateNodeLayouts: (layouts: readonly FlowLayoutUpdate[], createdNodeId?: string) => void;
	duplicateNodes: (nodeIds: string[]) => string[];
	pasteNodes: (nodes: readonly FlowDocumentNode[], x: number, y: number) => string[];
	deleteNode: (nodeId: string) => Promise<void>;
	createGroup: (params: { groupId: string; title: string; color: string; parentGroupId: string | null; x: number; y: number; width: number; height: number; nodeIds: string[]; groupIds: string[] }) => void;
	renameGroup: (groupId: string, title: string) => void;
	moveGroupContents: (nodePositions: Array<{ nodeId: string; x: number; y: number }>, groupPositions: Array<{ groupId: string; x: number; y: number }>) => void;
	dissolveGroup: (groupId: string) => void;
	createEdge: (sourceNodeId: string, targetNodeId: string, sourcePort?: string, targetPort?: string, dataType?: FlowDocumentNode["ports"][number]["dataTypes"][number]) => Promise<void>;
	reconnectEdge: (edgeId: string, sourceNodeId: string, targetNodeId: string, sourcePort: string, targetPort: string, dataType: FlowDocumentNode["ports"][number]["dataTypes"][number]) => Promise<void>;
	deleteEdge: (edgeId: string) => Promise<void>;
	updateViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<void>;
	startRun: (request?: FlowRunRequest) => Promise<boolean>;
	stopRun: () => Promise<void>;
	setApprovalMode: (mode: FlowDocument["approvalMode"]) => Promise<void>;
	resolveApproval: (approvalId: string, decision: "approve" | "reject", consentText?: string) => Promise<void>;
	undo: () => void;
	redo: () => void;
	canUndo: boolean;
	canRedo: boolean;
};

type FlowHistoryCommand = { undo: FlowOperation[]; redo: FlowOperation[]; group?: string | undefined };

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	return new Promise<T>((resolve, reject): void => {
		const timeout = window.setTimeout((): void => reject(new Error(message)), timeoutMs);
		void promise.then(
			(value): void => { window.clearTimeout(timeout); resolve(value); },
			(error: unknown): void => { window.clearTimeout(timeout); reject(error); },
		);
	});
}

function isFlowDocumentNodeRun(value: unknown): value is FlowDocumentNodeRun {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value as Partial<FlowDocumentNodeRun>;
	return typeof candidate.runId === "string" && typeof candidate.nodeId === "string" && typeof candidate.status === "string";
}

function isFlowDocumentRun(value: unknown): value is FlowDocumentRun {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value as Partial<FlowDocumentRun>;
	return typeof candidate.runId === "string" && typeof candidate.flowId === "string" && typeof candidate.status === "string" && Array.isArray(candidate.nodes) && candidate.nodes.every(isFlowDocumentNodeRun);
}

function toSummary(flow: FlowDocument): FlowDocumentSummary {
	return flow;
}

async function flushAndFetchFlow(flowId: string): Promise<FlowDocumentSnapshot> {
	await flowOperationOutbox.flushFully(flowId);
	return fetchFlow(flowId);
}

const MEDIA_GENERATION_NODE_TYPES = new Set<FlowNodeTypeId>([
	"builtin/text-to-image",
	"builtin/image-to-image",
	"builtin/text-to-video",
	"builtin/image-to-video",
]);

function sanitizeFlowOperationForCommit(
	operation: FlowOperation,
	snapshot: FlowDocumentSnapshot | null,
): FlowOperation {
	let typeId: FlowNodeTypeId | null = null;
	let config: Record<string, unknown> | undefined;
	if (operation.kind === "node.create") {
		typeId = operation.payload.typeId;
		config = operation.payload.config;
	} else if (operation.kind === "node.update") {
		typeId = snapshot?.nodes.find((node): boolean => node.nodeId === operation.payload.nodeId)?.typeId ?? null;
		config = operation.payload.config;
	}
	if (typeId === null || !MEDIA_GENERATION_NODE_TYPES.has(typeId) || config === undefined || !("reasoningEffort" in config))
		return operation;
	const sanitizedConfig = { ...config };
	delete sanitizedConfig.reasoningEffort;
	return {
		...operation,
		payload: { ...operation.payload, config: sanitizedConfig },
	} as FlowOperation;
}

function resolveOptimisticPorts(node: Pick<FlowDocumentNode, "ports" | "typeId" | "config">, definition: FlowNodeTypeDefinition | undefined, config: Record<string, unknown>): FlowDocumentNode["ports"] {
	if (definition === undefined) return node.ports;
	const parameters = definition.parameters.map((parameter) => structuredClone(parameter));
	for (const dynamic of definition.dynamicParameters ?? []) {
		const values = config[dynamic.configField];
		if (!Array.isArray(values)) continue;
		for (const value of values.slice(0, 64 - parameters.length)) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
			const record = value as Record<string, unknown>;
			const id = record[dynamic.idField];
			if (typeof id !== "string" || id.length === 0 || parameters.some((parameter): boolean => parameter.id === id)) continue;
			const configuredType = dynamic.dataTypeField === undefined ? undefined : record[dynamic.dataTypeField];
			const dataTypes: FlowDocumentNode["ports"][number]["dataTypes"] = typeof configuredType === "string" && ["text", "json", "image", "video", "audio", "frames", "artifact"].includes(configuredType) ? [configuredType as FlowDocumentNode["ports"][number]["dataTypes"][number]] : [...dynamic.dataTypes];
			const label = record[dynamic.labelField];
			parameters.push({ id, label: typeof label === "string" && label.length > 0 ? label : id, mode: "connection", dataTypes, required: dynamic.required, multiple: dynamic.multiple, defaultConnect: dynamic.defaultConnect });
		}
	}
	const ports = [
		...parameters.flatMap((parameter): FlowDocumentNode["ports"] => parameter.mode === "fixed" ? [] : [{ id: parameter.id, label: parameter.label, direction: "input", dataTypes: [...parameter.dataTypes], required: parameter.required, multiple: parameter.multiple, defaultConnect: parameter.defaultConnect, ...(parameter.cardinality ? { cardinality: parameter.cardinality } : {}) }]),
		...definition.outputs.map((output): FlowDocumentNode["ports"][number] => ({ id: output.id, label: output.label, direction: "output", dataTypes: [...output.dataTypes], required: false, multiple: true, defaultConnect: output.defaultConnect, ...(output.cardinality ? { cardinality: output.cardinality } : {}) })),
	];
	if (typeof config.elementType === "string") for (const port of ports) if (port.id !== "index") port.dataTypes = [config.elementType as FlowDocumentNode["ports"][number]["dataTypes"][number]];
	if (node.typeId === "builtin/flow-input") for (const port of ports) if (port.direction === "output") port.dataTypes = [config.dataType === "json" ? "json" : "text"];
	return ports;
}

function applyFlowOperation(snapshot: FlowDocumentSnapshot, operation: FlowOperation, definitions: readonly FlowNodeTypeDefinition[]): FlowDocumentSnapshot {
	if (operation.kind === "node.create") {
		const definition = definitions.find((candidate): boolean => candidate.typeId === operation.payload.typeId);
		if (definition === undefined) return snapshot;
		const timestamp = new Date().toISOString();
		const node: FlowDocumentNode = {
			nodeId: operation.payload.nodeId,
			flowId: snapshot.flow.flowId,
			typeId: operation.payload.typeId,
			pluginId: definition.pluginId,
			pluginVersion: definition.pluginVersion,
			pluginFingerprint: definition.pluginFingerprint,
			configVersion: definition.configVersion,
			title: operation.payload.title ?? definition.defaultTitle,
			x: operation.payload.x,
			y: operation.payload.y,
			width: 300,
			height: 180,
			collapsed: false,
			config: operation.payload.config ?? definition.defaultConfig,
			ports: resolveOptimisticPorts({ ports: [], typeId: definition.typeId, config: operation.payload.config ?? definition.defaultConfig }, definition, operation.payload.config ?? definition.defaultConfig),
			status: "idle",
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		return { ...snapshot, nodes: [...snapshot.nodes, node] };
	}
	if (operation.kind === "node.update") {
		const currentNode = snapshot.nodes.find((node): boolean => node.nodeId === operation.payload.nodeId);
		if (currentNode === undefined) return snapshot;
		const config = operation.payload.config ?? currentNode.config;
		const updatedPorts = resolveOptimisticPorts(currentNode, definitions.find((definition): boolean => definition.typeId === currentNode.typeId), config);
		const nodes = snapshot.nodes.map((node): FlowDocumentNode => node.nodeId === currentNode.nodeId ? { ...node, ...(operation.payload.title === undefined ? {} : { title: operation.payload.title }), config, ports: updatedPorts, updatedAt: new Date().toISOString() } : node);
		const inputs = new Set(updatedPorts.filter((port): boolean => port.direction === "input").map((port): string => port.id));
		const outputs = new Set(updatedPorts.filter((port): boolean => port.direction === "output").map((port): string => port.id));
		return { ...snapshot, nodes, edges: snapshot.edges.filter((edge): boolean => edge.targetNodeId === operation.payload.nodeId ? inputs.has(edge.targetPort) : edge.sourceNodeId === operation.payload.nodeId ? outputs.has(edge.sourcePort) : true) };
	}
	if (operation.kind === "node.delete") return { ...snapshot, nodes: snapshot.nodes.filter((node): boolean => node.nodeId !== operation.payload.nodeId), groups: (snapshot.groups ?? []).map((group): FlowDocumentGroup => ({ ...group, nodeIds: group.nodeIds.filter((id): boolean => id !== operation.payload.nodeId) })), edges: snapshot.edges.filter((edge): boolean => edge.sourceNodeId !== operation.payload.nodeId && edge.targetNodeId !== operation.payload.nodeId) };
	if (operation.kind === "node.move") return { ...snapshot, nodes: snapshot.nodes.map((node): FlowDocumentNode => node.nodeId === operation.payload.nodeId ? { ...node, x: operation.payload.x, y: operation.payload.y } : node) };
	if (operation.kind === "node.collapse") return { ...snapshot, nodes: snapshot.nodes.map(node => node.nodeId === operation.payload.nodeId ? { ...node, collapsed: operation.payload.collapsed } : node) };
	if (operation.kind === "node.resize") return { ...snapshot, nodes: snapshot.nodes.map((node): FlowDocumentNode => node.nodeId === operation.payload.nodeId ? { ...node, width: operation.payload.width, height: operation.payload.height } : node) };
	if (operation.kind === "group.create") {
		const timestamp = new Date().toISOString();
		const group: FlowDocumentGroup = { ...operation.payload, flowId: snapshot.flow.flowId, nodeIds: [], createdAt: timestamp, updatedAt: timestamp };
		return { ...snapshot, groups: [...(snapshot.groups ?? []), group] };
	}
	if (operation.kind === "group.rename") return { ...snapshot, groups: (snapshot.groups ?? []).map((group): FlowDocumentGroup => group.groupId === operation.payload.groupId ? { ...group, title: operation.payload.title, updatedAt: new Date().toISOString() } : group) };
	if (operation.kind === "group.move") return { ...snapshot, groups: (snapshot.groups ?? []).map((group): FlowDocumentGroup => group.groupId === operation.payload.groupId ? { ...group, x: operation.payload.x, y: operation.payload.y, updatedAt: new Date().toISOString() } : group) };
	if (operation.kind === "group.reparent") {
		const assignments = new Map(operation.payload.nodes.map((item): [string, string | null] => [item.nodeId, item.groupId]));
		const parentAssignments = new Map(operation.payload.groups.map((item): [string, string | null] => [item.groupId, item.parentGroupId]));
		const groups = (snapshot.groups ?? []).map((group): FlowDocumentGroup => ({
			...group,
			nodeIds: group.nodeIds.filter((nodeId): boolean => !assignments.has(nodeId)),
			parentGroupId: parentAssignments.has(group.groupId) ? parentAssignments.get(group.groupId)! : group.parentGroupId,
		}));
		for (const [nodeId, groupId] of assignments) {
			if (groupId === null) continue;
			const target = groups.find((group): boolean => group.groupId === groupId);
			if (target && !target.nodeIds.includes(nodeId)) target.nodeIds.push(nodeId);
		}
		return { ...snapshot, groups };
	}
	if (operation.kind === "group.dissolve") {
		const group = snapshot.groups?.find((candidate): boolean => candidate.groupId === operation.payload.groupId);
		if (!group) return snapshot;
		const groups = (snapshot.groups ?? []).filter((candidate): boolean => candidate.groupId !== group.groupId).map((candidate): FlowDocumentGroup => ({
			...candidate,
			...(candidate.parentGroupId === group.groupId ? { parentGroupId: group.parentGroupId } : {}),
			...(candidate.groupId === group.parentGroupId ? { nodeIds: [...new Set([...candidate.nodeIds, ...group.nodeIds])] } : {}),
		}));
		return { ...snapshot, groups };
	}
	if (operation.kind === "group.delete") return { ...snapshot, groups: (snapshot.groups ?? []).filter((group): boolean => group.groupId !== operation.payload.groupId) };
	if (operation.kind === "edge.create") {
		const edge: FlowDocumentEdge = { flowId: snapshot.flow.flowId, ...operation.payload };
		const target = snapshot.nodes.find((node): boolean => node.nodeId === edge.targetNodeId)?.ports.find((port): boolean => port.id === edge.targetPort && port.direction === "input");
		return { ...snapshot, edges: [...snapshot.edges.filter((candidate): boolean => target?.multiple === true || !(candidate.targetNodeId === edge.targetNodeId && candidate.targetPort === edge.targetPort)), edge] };
	}
	if (operation.kind === "edge.delete") return { ...snapshot, edges: snapshot.edges.filter((edge): boolean => edge.edgeId !== operation.payload.edgeId) };
	if (operation.kind === "viewport.update") return { ...snapshot, flow: { ...snapshot.flow, viewport: operation.payload } };
	return snapshot;
}

function inverseFlowOperations(snapshot: FlowDocumentSnapshot, operation: FlowOperation): FlowOperation[] {
	const mutationId = "history";
	if (operation.kind === "group.create") return [{ mutationId, kind: "group.delete", payload: { groupId: operation.payload.groupId } }];
	if (operation.kind === "group.rename") {
		const group = snapshot.groups?.find((candidate): boolean => candidate.groupId === operation.payload.groupId);
		return group ? [{ mutationId, kind: "group.rename", payload: { groupId: group.groupId, title: group.title } }] : [];
	}
	if (operation.kind === "group.move") {
		const group = snapshot.groups?.find((candidate): boolean => candidate.groupId === operation.payload.groupId);
		return group ? [{ mutationId, kind: "group.move", payload: { groupId: group.groupId, x: group.x, y: group.y } }] : [];
	}
	if (operation.kind === "group.delete") {
		const group = snapshot.groups?.find((candidate): boolean => candidate.groupId === operation.payload.groupId);
		return group ? [{ mutationId, kind: "group.create", payload: { groupId: group.groupId, title: group.title, color: group.color, parentGroupId: group.parentGroupId, x: group.x, y: group.y, width: group.width, height: group.height } }] : [];
	}
	if (operation.kind === "group.reparent") {
		const groups = snapshot.groups ?? [];
		return [{ mutationId, kind: "group.reparent", payload: {
			nodes: operation.payload.nodes.map((item) => ({ nodeId: item.nodeId, groupId: groups.find((group) => group.nodeIds.includes(item.nodeId))?.groupId ?? null })),
			groups: operation.payload.groups.map((item) => ({ groupId: item.groupId, parentGroupId: groups.find((group) => group.groupId === item.groupId)?.parentGroupId ?? null })),
		} }];
	}
	if (operation.kind === "group.dissolve") {
		const group = snapshot.groups?.find((candidate): boolean => candidate.groupId === operation.payload.groupId);
		if (!group) return [];
		const children = (snapshot.groups ?? []).filter((candidate): boolean => candidate.parentGroupId === group.groupId);
		return [
			{ mutationId, kind: "group.create", payload: { groupId: group.groupId, title: group.title, color: group.color, parentGroupId: group.parentGroupId, x: group.x, y: group.y, width: group.width, height: group.height } },
			{ mutationId, kind: "group.reparent", payload: { nodes: group.nodeIds.map((nodeId) => ({ nodeId, groupId: group.groupId })), groups: children.map((child) => ({ groupId: child.groupId, parentGroupId: group.groupId })) } },
		];
	}
	if (operation.kind === "node.create") return [{ mutationId, kind: "node.delete", payload: { nodeId: operation.payload.nodeId } }];
	if (operation.kind === "node.update") {
		const node = snapshot.nodes.find((candidate): boolean => candidate.nodeId === operation.payload.nodeId);
		if (node === undefined) return [];
		return [{ mutationId, kind: "node.update", payload: { nodeId: node.nodeId, ...(operation.payload.title === undefined ? {} : { title: node.title }), ...(operation.payload.config === undefined ? {} : { config: structuredClone(node.config) }) } }];
	}
	if (operation.kind === "node.move") {
		const node = snapshot.nodes.find((candidate): boolean => candidate.nodeId === operation.payload.nodeId);
		return node === undefined ? [] : [{ mutationId, kind: "node.move", payload: { nodeId: node.nodeId, x: node.x, y: node.y } }];
	}
	if (operation.kind === "node.collapse") {
		const node = snapshot.nodes.find(candidate => candidate.nodeId === operation.payload.nodeId);
		return node ? [{ mutationId, kind: "node.collapse", payload: { nodeId: node.nodeId, collapsed: node.collapsed ?? false } }] : [];
	}
	if (operation.kind === "node.resize") {
		const node = snapshot.nodes.find((candidate): boolean => candidate.nodeId === operation.payload.nodeId);
		return node === undefined ? [] : [{ mutationId, kind: "node.resize", payload: { nodeId: node.nodeId, width: node.width, height: node.height } }];
	}
	if (operation.kind === "node.delete") {
		const node = snapshot.nodes.find((candidate): boolean => candidate.nodeId === operation.payload.nodeId);
		if (node === undefined) return [];
		const connected = snapshot.edges.filter((edge): boolean => edge.sourceNodeId === node.nodeId || edge.targetNodeId === node.nodeId);
		return [
			{ mutationId, kind: "node.create", payload: { nodeId: node.nodeId, typeId: node.typeId, title: node.title, x: node.x, y: node.y, config: structuredClone(node.config) } },
			{ mutationId, kind: "node.resize", payload: { nodeId: node.nodeId, width: node.width, height: node.height } },
			{ mutationId, kind: "node.collapse", payload: { nodeId: node.nodeId, collapsed: node.collapsed ?? false } },
			...connected.map((edge): FlowOperation => ({ mutationId, kind: "edge.create", payload: { edgeId: edge.edgeId, sourceNodeId: edge.sourceNodeId, sourcePort: edge.sourcePort, targetNodeId: edge.targetNodeId, targetPort: edge.targetPort, dataType: edge.dataType } })),
		];
	}
	if (operation.kind === "edge.create") {
		const target = snapshot.nodes.find((node): boolean => node.nodeId === operation.payload.targetNodeId)?.ports.find((port): boolean => port.id === operation.payload.targetPort && port.direction === "input");
		const replaced = target?.multiple === true ? undefined : snapshot.edges.find((edge): boolean => edge.targetNodeId === operation.payload.targetNodeId && edge.targetPort === operation.payload.targetPort);
		return [
			{ mutationId, kind: "edge.delete", payload: { edgeId: operation.payload.edgeId } },
			...(replaced === undefined ? [] : [{ mutationId, kind: "edge.create", payload: { edgeId: replaced.edgeId, sourceNodeId: replaced.sourceNodeId, sourcePort: replaced.sourcePort, targetNodeId: replaced.targetNodeId, targetPort: replaced.targetPort, dataType: replaced.dataType } } as FlowOperation]),
		];
	}
	if (operation.kind === "edge.delete") {
		const edge = snapshot.edges.find((candidate): boolean => candidate.edgeId === operation.payload.edgeId);
		return edge === undefined ? [] : [{ mutationId, kind: "edge.create", payload: { edgeId: edge.edgeId, sourceNodeId: edge.sourceNodeId, sourcePort: edge.sourcePort, targetNodeId: edge.targetNodeId, targetPort: edge.targetPort, dataType: edge.dataType } }];
	}
	return [{ mutationId, kind: "viewport.update", payload: structuredClone(snapshot.flow.viewport) }];
}

function materializeHistoryOperation(operation: FlowOperation, snapshot: FlowDocumentSnapshot): FlowOperation {
	const mutationId = createFlowMutationId();
	if (operation.kind === "node.move" || operation.kind === "node.resize" || operation.kind === "node.collapse" || operation.kind === "viewport.update" || operation.kind.startsWith("group.")) return { ...operation, mutationId, baseLayoutRevision: snapshot.flow.layoutRevision } as FlowOperation;
	return { ...operation, mutationId, baseGraphRevision: snapshot.flow.graphRevision } as FlowOperation;
}

export default function useHomeFlowController(params: UseHomeFlowControllerParams): HomeFlowController {
	const { t } = useTranslation();
	const { enabled, defaultFlow, onOpenChat } = params;
	const [flows, setFlows] = useState<FlowDocumentSummary[]>([]);
	const [flowOrder, setFlowOrder] = useState<FlowTreeOrder | null>(null);
	const [flowRuntimeStatusById, setFlowRuntimeStatusById] = useState<Record<string, "running" | "failed" | "completed">>({});
	const [unreadFlowIds, setUnreadFlowIds] = useState<ReadonlySet<string>>(() => new Set<string>());
	const [snapshot, setSnapshotState] = useState<FlowDocumentSnapshot | null>(null);
	const [documentStore] = useState(() => new FlowDocumentStore());
	const [runStore] = useState(() => new FlowRunStore());
	const setSnapshot = useCallback((next: FlowDocumentSnapshot | null): void => {
		documentStore.replace(next);
		runStore.replace(
			next?.flow.flowId ?? null,
			next?.nodes.map((node) => node.nodeId) ?? [],
			next?.latestNodeResults ?? [],
			next?.runs[0]?.nodes ?? [],
		);
		setSnapshotState(next);
	}, [documentStore, runStore]);
	const [nodeDefinitions, setNodeDefinitions] = useState<FlowNodeTypeDefinition[]>([]);
	const [tools, setTools] = useState<FlowToolDefinition[]>([]);
	const [approvals, setApprovals] = useState<FlowApproval[]>([]);
	const [selectedNodeDetail, setSelectedNodeDetail] = useState<FlowNodeDetail | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isMutating, setIsMutating] = useState<boolean>(false);
	const [runRequestStage, setRunRequestStage] = useState<FlowRunRequestStage>("idle");
	const [error, setError] = useState<string | null>(null);
	const [historyRevision, setHistoryRevision] = useState<number>(0);
	const snapshotRef = useRef<FlowDocumentSnapshot | null>(null);
	const nodeDefinitionsRef = useRef<FlowNodeTypeDefinition[]>([]);
	const selectedFlowIdRef = useRef<string | null>(null);
	const enabledRef = useRef<boolean>(enabled);
	const windowFocusedRef = useRef<boolean>(document.hasFocus());
	const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
	const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
	const ignoreFlowEventsUntilRef = useRef<number>(0);
	const undoStackRef = useRef<FlowHistoryCommand[]>([]);
	const redoStackRef = useRef<FlowHistoryCommand[]>([]);
	const isGraphLocked = snapshot?.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting") ?? false;
	nodeDefinitionsRef.current = nodeDefinitions;
	enabledRef.current = enabled;

	const loadFlowResources = useCallback(async (flowId: string): Promise<void> => {
		const [nodeResult, toolResult, approvalResult] = await Promise.all([listFlowNodeTypes({ flowId }), listFlowTools(flowId), listFlowApprovals(flowId)]);
		if (selectedFlowIdRef.current !== flowId) return;
		setNodeDefinitions(nodeResult.nodes);
		setTools(toolResult.tools);
		setApprovals(approvalResult.approvals);
	}, []);

	const enqueueMutation = useCallback(<T>(operation: () => Promise<T>): Promise<T> => {
		const next = mutationQueueRef.current.catch((): void => undefined).then(operation);
		mutationQueueRef.current = next.then(
			(): void => undefined,
			(): void => undefined,
		);
		return next;
	}, []);

	const applySnapshot = useCallback((next: FlowDocumentSnapshot): void => {
		if (selectedFlowIdRef.current !== next.flow.flowId) {
			documentStore.flushEditors();
			undoStackRef.current = [];
			redoStackRef.current = [];
			setHistoryRevision((value): number => value + 1);
		}
		snapshotRef.current = next;
		selectedFlowIdRef.current = next.flow.flowId;
		setSnapshot(next);
		const latestRun = next.runs[0];
		if (latestRun !== undefined)
			setFlowRuntimeStatusById(
				(current): Record<string, "running" | "failed" | "completed"> => ({
					...current,
					[next.flow.flowId]: latestRun.status === "running" || latestRun.status === "queued" || latestRun.status === "waiting" ? "running" : latestRun.status === "failed" || latestRun.status === "partial_failure" ? "failed" : "completed",
				}),
			);
	}, []);

	const applyOperations = useCallback((operations: FlowOperation[], recordHistory = true, group?: string): void => {
		const current = snapshotRef.current;
		if (current === null) return;
		let next = current;
		let inverse: FlowOperation[] = [];
		for (const operation of operations) {
			if (recordHistory) inverse = [...inverseFlowOperations(next, operation), ...inverse];
			next = applyFlowOperation(next, operation, nodeDefinitionsRef.current);
			flowOperationOutbox.enqueue(current.flow.flowId, operation);
		}
		snapshotRef.current = next;
		setSnapshot(next);
		if (recordHistory && inverse.length > 0) {
			const previous = undoStackRef.current.at(-1);
			const redo = operations.map((operation): FlowOperation => structuredClone(operation));
			if (group !== undefined && previous?.group === group) {
				undoStackRef.current = [...undoStackRef.current.slice(0, -1), { ...previous, redo }];
			} else undoStackRef.current = [...undoStackRef.current.slice(-99), { undo: inverse, redo, group }];
			redoStackRef.current = [];
			setHistoryRevision((value): number => value + 1);
		}
	}, []);

	const applyOperation = useCallback((operation: FlowOperation): void => applyOperations([operation]), [applyOperations]);
	const replayHistory = useCallback((direction: "undo" | "redo"): void => {
		const current = snapshotRef.current;
		if (current === null || isGraphLocked) return;
		const source = direction === "undo" ? undoStackRef.current : redoStackRef.current;
		const command = source.at(-1);
		if (command === undefined) return;
		if (direction === "undo") undoStackRef.current = source.slice(0, -1);
		else redoStackRef.current = source.slice(0, -1);
		const templates = direction === "undo" ? command.undo : command.redo;
		let materializedSnapshot = current;
		const operations = templates.map((template): FlowOperation => {
			const operation = materializeHistoryOperation(template, materializedSnapshot);
			materializedSnapshot = applyFlowOperation(materializedSnapshot, operation, nodeDefinitionsRef.current);
			return operation;
		});
		applyOperations(operations, false);
		if (direction === "undo") redoStackRef.current = [...redoStackRef.current, command];
		else undoStackRef.current = [...undoStackRef.current, command];
		setHistoryRevision((value): number => value + 1);
	}, [applyOperations, isGraphLocked]);

	useEffect((): (() => void) => {
		const disconnectOutbox = flowOperationOutbox.connect(
			async (flowId, clientId, operations) => {
				const activeSnapshot = snapshotRef.current?.flow.flowId === flowId ? snapshotRef.current : null;
				const commitSnapshot = activeSnapshot ?? await fetchFlow(flowId);
				const sanitizedOperations = operations.map(
					(operation): FlowOperation => sanitizeFlowOperationForCommit(operation, commitSnapshot),
				);
				const ack = await commitFlowPatch({ flowId, clientId, operations: sanitizedOperations });
				const current = snapshotRef.current;
				if (current?.flow.flowId === flowId) {
					const repairedConfigByNodeId = new Map<string, Record<string, unknown>>();
					for (let index = 0; index < operations.length; index += 1) {
						if (sanitizedOperations[index] === operations[index]) continue;
						const operation = sanitizedOperations[index];
						if ((operation?.kind === "node.create" || operation?.kind === "node.update") && operation.payload.config !== undefined)
							repairedConfigByNodeId.set(operation.payload.nodeId, operation.payload.config);
					}
					const next = {
						...current,
						nodes: repairedConfigByNodeId.size === 0
							? current.nodes
							: current.nodes.map((node): FlowDocumentNode => {
								const repairedConfig = repairedConfigByNodeId.get(node.nodeId);
								return repairedConfig === undefined ? node : { ...node, config: repairedConfig };
							}),
						flow: { ...current.flow, graphRevision: ack.graphRevision, layoutRevision: ack.layoutRevision, revision: Math.max(current.flow.revision, ack.graphRevision) },
					};
					snapshotRef.current = next;
					// Revision-only ACKs arrive shortly after viewport and node movement. The
					// renderer does not display revisions, so keep them in the imperative
					// snapshot without interrupting a following pointer interaction.
					if (repairedConfigByNodeId.size > 0) setSnapshot(next);
				}
				setError(null);
				return ack;
			},
			(error, failedFlowId): void => {
				if (failedFlowId !== null && error instanceof BackendRpcError && error.code === "flow_not_found") {
					flowOperationOutbox.discard(failedFlowId);
					if (failedFlowId === selectedFlowIdRef.current) void refreshRef.current();
					return;
				}
				if (failedFlowId !== null && failedFlowId !== selectedFlowIdRef.current) return;
				setError(errorMessage(error));
				const flowId = failedFlowId ?? selectedFlowIdRef.current;
				if (flowId === null) return;
				void fetchFlow(flowId).then((server): void => {
					flowOperationOutbox.rebase(flowId, server.flow.graphRevision, server.flow.layoutRevision);
					const replayed = flowOperationOutbox.readPending(flowId).reduce((value, operation): FlowDocumentSnapshot => applyFlowOperation(value, operation, nodeDefinitionsRef.current), server);
					applySnapshot(replayed);
				}).catch((loadError: unknown): void => setError(errorMessage(loadError)));
			},
		);
		const flushOnBlur = (): void => {
			documentStore.flushEditors();
			void flowOperationOutbox.flushAll().catch((): void => undefined);
		};
		window.addEventListener("blur", flushOnBlur);
		return (): void => {
			window.removeEventListener("blur", flushOnBlur);
			void flowOperationOutbox.flushAll().finally(disconnectOutbox);
		};
	}, [applySnapshot]);

	useEffect((): (() => void) => {
		const handleWindowFocus = (): void => {
			windowFocusedRef.current = true;
			setUnreadFlowIds((currentFlowIds): ReadonlySet<string> =>
				markActiveFlowRead(
					currentFlowIds,
					selectedFlowIdRef.current,
					enabledRef.current,
					true,
				),
			);
		};
		const handleWindowBlur = (): void => {
			windowFocusedRef.current = false;
		};

		window.addEventListener("focus", handleWindowFocus);
		window.addEventListener("blur", handleWindowBlur);
		if (document.hasFocus()) handleWindowFocus();
		else handleWindowBlur();

		return (): void => {
			window.removeEventListener("focus", handleWindowFocus);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, []);

	const refresh = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await fetchFlows();
			setFlows(result.flows.map(toSummary));
			if (result.order !== undefined) setFlowOrder(result.order);
			const selectedId = selectedFlowIdRef.current;
			const selected = selectedId === null ? undefined : result.flows.find((flow): boolean => flow.flowId === selectedId);
			if (selected !== undefined) {
				applySnapshot(await fetchFlow(selected.flowId));
			} else if (enabled && result.flows[0] !== undefined) {
				applySnapshot(await fetchFlow(result.flows[0].flowId));
			} else if (enabled && result.flows.length === 0) {
				selectedFlowIdRef.current = null;
				snapshotRef.current = null;
				setSnapshot(null);
			}
		} catch (loadError: unknown) {
			setError(errorMessage(loadError));
		} finally {
			setIsLoading(false);
		}
	}, [applySnapshot, enabled]);
	refreshRef.current = refresh;

	useEffect((): void => {
		if (!enabled) return;
		void refresh();
	}, [enabled, refresh]);
	useEffect((): void => {
		setUnreadFlowIds((currentFlowIds): ReadonlySet<string> =>
			markActiveFlowRead(
				currentFlowIds,
				snapshot?.flow.flowId ?? null,
				enabled,
				windowFocusedRef.current,
			),
		);
	}, [enabled, snapshot?.flow.flowId]);
	useEffect((): void => {
		const flowId = snapshot?.flow.flowId;
		if (!enabled || flowId === undefined) {
			setNodeDefinitions([]);
			setTools([]);
			setApprovals([]);
			return;
		}
		void loadFlowResources(flowId).catch((resourceError: unknown): void => setError(errorMessage(resourceError)));
	}, [enabled, loadFlowResources, snapshot?.flow.flowId]);

	useEffect((): (() => void) => {
		let unsubscribe: (() => void) | undefined;
		void onBackendEvent((event): void => {
			const data = typeof event.data === "object" && event.data !== null ? (event.data as Record<string, unknown>) : {};
			const flowId = typeof data.flowId === "string" ? data.flowId : null;
			if (flowId === null) return;
			if (event.event === "flow.run.state") {
				const status = typeof data.status === "string" ? data.status : "running";
				setFlowRuntimeStatusById((values): Record<string, "running" | "failed" | "completed"> => ({
					...values,
					[flowId]: status === "running" || status === "queued" || status === "waiting"
						? "running"
						: status === "failed" || status === "partial_failure"
							? "failed"
							: "completed",
				}));
				if (status === "completed" || status === "failed" || status === "partial_failure") {
					setUnreadFlowIds((currentFlowIds): ReadonlySet<string> =>
						applyFlowRunFinished(currentFlowIds, {
							activeFlowId: selectedFlowIdRef.current,
							flowId,
							surfaceVisible: enabledRef.current,
							windowFocused: windowFocusedRef.current,
						}),
					);
				}
			}
			if (flowId !== selectedFlowIdRef.current) return;
			if (event.event === "flow.patch.applied") {
				if (data.clientId === flowOperationOutbox.clientId) return;
				undoStackRef.current = [];
				redoStackRef.current = [];
				setHistoryRevision((value): number => value + 1);
				const current = snapshotRef.current;
				if (current === null || !Array.isArray(data.operations)) return;
				const next = (data.operations as FlowOperation[]).reduce((value, operation): FlowDocumentSnapshot => applyFlowOperation(value, operation, nodeDefinitionsRef.current), current);
				const patched = { ...next, flow: { ...next.flow, graphRevision: Number(data.graphRevision ?? next.flow.graphRevision), layoutRevision: Number(data.layoutRevision ?? next.flow.layoutRevision) } };
				snapshotRef.current = patched;
				setSnapshot(patched);
				return;
			}
			if (String(event.event) === "flow.batch.item.state") {
				const current = runStore.get(String(data.nodeId));
				if (current !== undefined && current.runId === data.runId) {
					const items = { ...(current.batchItems ?? {}), [String(data.itemId)]: data };
					runStore.set(current.nodeId, { ...current, batchItems: items });
				}
				return;
			}
			if (event.event === "flow.node.state" || event.event === "flow.run.state") {
				const current = snapshotRef.current;
				if (current !== null) {
					const runId = typeof data.runId === "string" ? data.runId : "";
					const status = typeof data.status === "string" ? data.status : "running";
					const eventRun = event.event === "flow.run.state" && isFlowDocumentRun(data.run)
						? data.run
						: null;
					const eventNodeRun = event.event === "flow.node.state" && isFlowDocumentNodeRun(data.nodeRun)
						? data.nodeRun
						: null;
					const next = {
						...current,
						runs: eventRun !== null
							? [eventRun, ...current.runs.filter((run): boolean => run.runId !== eventRun.runId)]
							: current.runs.map((run) => run.runId !== runId ? run : event.event === "flow.run.state"
								? { ...run, status: status as typeof run.status }
								: {
									...run,
									nodes: run.nodes.map((node) => node.nodeId === data.nodeId
									? (eventNodeRun ?? { ...node, status: status as typeof node.status, ...(typeof data.progress === "number" ? { progress: data.progress } : {}) })
										: node),
								}),
					};
					snapshotRef.current = next;
					if (event.event === "flow.node.state") {
						const nodeRun = next.runs[0]?.nodes.find((node) => node.nodeId === data.nodeId);
						if (nodeRun && next.runs[0]?.runId === runId) runStore.set(nodeRun.nodeId, nodeRun);
					} else setSnapshot(next);
				}
				if (data.status === "waiting" || event.event === "flow.run.state")
					void listFlowApprovals(flowId).then((result): void => setApprovals(result.approvals));
				return;
			}
			window.setTimeout((): void => void refreshRef.current(), 30);
		}).then((dispose): void => {
			unsubscribe = dispose;
		});
		const offReconnect = onBackendReconnected((): void => {
			if (enabled) void refreshRef.current();
		});
		return (): void => {
			unsubscribe?.();
			offReconnect();
		};
	}, [enabled]);

	const createNewFlow = useCallback(
		async (workspaceId?: string | null): Promise<boolean> => {
			setIsMutating(true);
			setError(null);
			try {
				const next = await createFlow({
					title: t("flow.defaultTitle", { count: flows.length + 1 }),
					...(defaultFlow.provider === undefined ? {} : { provider: defaultFlow.provider }),
					...(defaultFlow.model === undefined ? {} : { model: defaultFlow.model }),
					...(defaultFlow.reasoningEffort === undefined ? {} : { reasoningEffort: defaultFlow.reasoningEffort }),
					...(defaultFlow.chatMode === undefined ? {} : { chatMode: defaultFlow.chatMode }),
					...(defaultFlow.approvalMode === undefined ? {} : { approvalMode: defaultFlow.approvalMode }),
					...(workspaceId === undefined || workspaceId === null ? {} : { workspaceId }),
				});
				applySnapshot(next);
				const result = await fetchFlows();
				setFlows(result.flows.map(toSummary));
				if (result.order !== undefined) setFlowOrder(result.order);
				return true;
			} catch (mutationError: unknown) {
				setError(errorMessage(mutationError));
				return false;
			} finally {
				setIsMutating(false);
			}
		},
		[applySnapshot, defaultFlow.approvalMode, defaultFlow.chatMode, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort, flows.length, t],
	);

	const createFromChat = useCallback(
		async (session: SessionMetadata): Promise<boolean> => {
			setIsMutating(true);
			setError(null);
			try {
				const next = await importFlowFromSession({
					sourceSessionId: session.id,
					title: session.title,
				});
				applySnapshot(next);
				setFlows((current): FlowDocumentSummary[] => [toSummary(next.flow), ...current.filter((flow): boolean => flow.flowId !== next.flow.flowId)]);
				return true;
			} catch (mutationError: unknown) {
				setError(errorMessage(mutationError));
				return false;
			} finally {
				setIsMutating(false);
			}
		},
		[applySnapshot],
	);

	const selectFlow = useCallback(
		async (flowId: string): Promise<void> => {
			setIsLoading(true);
			setError(null);
			try {
				const previousFlowId = selectedFlowIdRef.current;
				documentStore.flushEditors();
				if (previousFlowId !== null && previousFlowId !== flowId) await flowOperationOutbox.flush(previousFlowId);
				applySnapshot(await fetchFlow(flowId));
			} catch (loadError: unknown) {
				setError(errorMessage(loadError));
			} finally {
				setIsLoading(false);
			}
		},
		[applySnapshot],
	);

	const selectNode = useCallback(async (nodeId: string | null): Promise<void> => {
		if (nodeId === null) {
			setSelectedNodeDetail(null);
			return;
		}
		const node = snapshotRef.current?.nodes.find((candidate): boolean => candidate.nodeId === nodeId);
		setSelectedNodeDetail(node === undefined ? null : { node });
	}, []);

	const renameFlowById = useCallback(
		async (flowId: string, title: string): Promise<void> => {
			const current = snapshotRef.current?.flow.flowId === flowId ? snapshotRef.current.flow : flows.find((flow): boolean => flow.flowId === flowId);
			if (current === undefined) return;
			setIsMutating(true);
			setError(null);
			try {
				const saved = await flushAndFetchFlow(flowId);
				const updated = await renameFlow(flowId, title, saved.flow.revision);
				setFlows((items): FlowDocumentSummary[] => items.map((flow): FlowDocumentSummary => (flow.flowId === flowId ? { ...flow, ...updated } : flow)));
				if (snapshotRef.current?.flow.flowId === flowId) applySnapshot({ ...snapshotRef.current, flow: updated });
			} catch (mutationError: unknown) {
				setError(errorMessage(mutationError));
			} finally {
				setIsMutating(false);
			}
		},
		[applySnapshot, flows],
	);

	const archiveFlowById = useCallback(
		async (flowId: string): Promise<void> => {
			const current = snapshotRef.current?.flow.flowId === flowId ? snapshotRef.current.flow : flows.find((flow): boolean => flow.flowId === flowId);
			if (current === undefined) return;
			setIsMutating(true);
			setError(null);
			try {
				const saved = await flushAndFetchFlow(flowId);
				await archiveFlow(flowId, saved.flow.revision);
				flowOperationOutbox.discard(flowId);
				setFlows((items): FlowDocumentSummary[] => items.filter((flow): boolean => flow.flowId !== flowId));
				setUnreadFlowIds((currentFlowIds): ReadonlySet<string> => removeUnreadFlows(currentFlowIds, [flowId]));
				if (selectedFlowIdRef.current === flowId) {
					selectedFlowIdRef.current = null;
					snapshotRef.current = null;
					setSnapshot(null);
				}
			} catch (mutationError: unknown) {
				setError(errorMessage(mutationError));
			} finally {
				setIsMutating(false);
			}
		},
		[flows],
	);

	const updateFlowOrder = useCallback(async (order: FlowTreeOrderUpdate): Promise<void> => {
		try {
			const result = await persistFlowTreeOrder(order);
			setFlowOrder(result.order);
			setFlows(result.flows.map(toSummary));
		} catch (orderError: unknown) {
			setError(errorMessage(orderError));
		}
	}, []);

	const moveFlowWorkspaceById = useCallback(async (flowId: string, workspaceId: string | null): Promise<void> => {
		const current = flows.find((flow): boolean => flow.flowId === flowId);
		if (current === undefined || current.workspaceId === workspaceId) return;
		setIsMutating(true);
		setError(null);
		try {
			const saved = await flushAndFetchFlow(flowId);
			const result = await moveFlowToWorkspace(flowId, workspaceId, saved.flow.revision);
			setFlows((items): FlowDocumentSummary[] => items.map((flow): FlowDocumentSummary =>
				flow.flowId === flowId ? { ...flow, ...result.flow } : flow,
			));
			setFlowOrder(result.order);
			if (snapshotRef.current?.flow.flowId === flowId) {
				applySnapshot({ ...snapshotRef.current, flow: result.flow });
			}
		} catch (moveError: unknown) {
			setError(errorMessage(moveError));
			throw moveError;
		} finally {
			setIsMutating(false);
		}
	}, [applySnapshot, flows]);

	const createNode = useCallback(
		async (type: FlowNodeTypeId, x: number, y: number): Promise<string | null> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return null;
			const definition = nodeDefinitions.find((candidate): boolean => candidate.typeId === type);
			if (definition === undefined) return null;
			const config = { ...definition.defaultConfig, ...(type === "builtin/llm" ? { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } : {}) };
			const nodeId = `node-${crypto.randomUUID()}`;
			applyOperation({ mutationId: createFlowMutationId(), kind: "node.create", baseGraphRevision: current.flow.graphRevision, payload: { nodeId, typeId: type, title: definition.defaultTitle, x, y, config } });
			return nodeId;
		},
		[applyOperation, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort, isGraphLocked, nodeDefinitions],
	);

	const createConnectedNode = useCallback(
		async (params: { type: FlowNodeTypeId; x: number; y: number; direction: "from_existing" | "to_existing"; existingNodeId: string; existingPort: string; newPort: string; dataType: FlowDocumentNode["ports"][number]["dataTypes"][number] }): Promise<string | null> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return null;
			const definition = nodeDefinitions.find((candidate): boolean => candidate.typeId === params.type);
			if (definition === undefined) return null;
			const nodeId = `node-${crypto.randomUUID()}`;
			const config = { ...definition.defaultConfig, ...(params.type === "builtin/llm" ? { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } : {}) };
			const createOperation: FlowOperation = { mutationId: createFlowMutationId(), kind: "node.create", baseGraphRevision: current.flow.graphRevision, payload: { nodeId, typeId: params.type, title: definition.defaultTitle, x: params.x, y: params.y, config } };
			const sourceNodeId = params.direction === "from_existing" ? params.existingNodeId : nodeId;
			const targetNodeId = params.direction === "from_existing" ? nodeId : params.existingNodeId;
			const edgeOperation: FlowOperation = { mutationId: createFlowMutationId(), kind: "edge.create", baseGraphRevision: current.flow.graphRevision, payload: { edgeId: `edge-${crypto.randomUUID()}`, sourceNodeId, sourcePort: params.direction === "from_existing" ? params.existingPort : params.newPort, targetNodeId, targetPort: params.direction === "from_existing" ? params.newPort : params.existingPort, dataType: params.dataType } };
			applyOperations([createOperation, edgeOperation]);
			return nodeId;
		},
		[applyOperations, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort, isGraphLocked, nodeDefinitions],
	);

	const updateNode = useCallback(
		async (nodeId: string, patch: Record<string, unknown>): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked || !current.nodes.some(node => node.nodeId === nodeId)) return;
			applyOperations([{ mutationId: createFlowMutationId(), kind: "node.update", baseGraphRevision: current.flow.graphRevision, payload: { nodeId, ...(typeof patch.title === "string" ? { title: patch.title } : {}), ...(patch.config !== null && typeof patch.config === "object" && !Array.isArray(patch.config) ? { config: patch.config as Record<string, unknown> } : {}) } }], true, typeof patch.historyGroup === "string" ? patch.historyGroup : undefined);
		},
		[applyOperations, isGraphLocked],
	);

	const updateNodePosition = useCallback(
		async (nodeId: string, x: number, y: number): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null) return;
			applyOperation({ mutationId: createFlowMutationId(), kind: "node.move", baseLayoutRevision: current.flow.layoutRevision, payload: { nodeId, x, y } });
		},
		[applyOperation],
	);
	const updateNodePositions = useCallback((positions: Array<{ nodeId: string; x: number; y: number }>): void => {
		const current = snapshotRef.current; if (!current || !positions.length) return;
		applyOperations(positions.map(payload => ({ mutationId: createFlowMutationId(), kind: "node.move", baseLayoutRevision: current.flow.layoutRevision, payload })));
	}, [applyOperations]);
	const setNodeCollapsed = useCallback((nodeId: string, collapsed: boolean): void => {
		const current = snapshotRef.current;
		const node = current?.nodes.find(node => node.nodeId === nodeId);
		if (!current || !node || (node.collapsed ?? false) === collapsed) return;
		applyOperation({ mutationId: createFlowMutationId(), kind: "node.collapse", baseLayoutRevision: current.flow.layoutRevision, payload: { nodeId, collapsed } });
	}, [applyOperation]);
	const exportFlowDataById = useCallback(async (flowId: string, destinationPath: string) => {
		documentStore.flushEditors();
		await flowOperationOutbox.flushFully(flowId);
		return exportFlowData(flowId, destinationPath);
	}, [documentStore]);
	const updateNodeLayouts = useCallback((layouts: readonly FlowLayoutUpdate[], createdNodeId?: string): void => {
		const current = snapshotRef.current;
		if (!current) return;
		const operations: FlowOperation[] = [];
		for (const layout of layouts) {
			const node = current.nodes.find(candidate => candidate.nodeId === layout.nodeId);
			if (!node) continue;
			if (node.x !== layout.x || node.y !== layout.y)
				operations.push({ mutationId: createFlowMutationId(), kind: "node.move", baseLayoutRevision: current.flow.layoutRevision, payload: { nodeId: node.nodeId, x: layout.x, y: layout.y } });
			if (layout.width !== undefined && layout.height !== undefined && (node.width !== layout.width || node.height !== layout.height))
				operations.push({ mutationId: createFlowMutationId(), kind: "node.resize", baseLayoutRevision: current.flow.layoutRevision, payload: { nodeId: node.nodeId, width: layout.width, height: layout.height } });
		}
		if (operations.length) {
			const creation = undoStackRef.current.at(-1);
			const append = createdNodeId !== undefined && creation?.redo.some(operation => operation.kind === "node.create" && operation.payload.nodeId === createdNodeId);
			applyOperations(operations);
			if (append && creation) {
				const layout = undoStackRef.current.at(-1)!;
				undoStackRef.current = [...undoStackRef.current.slice(0, -2), {
					undo: [...layout.undo, ...creation.undo], redo: [...creation.redo, ...layout.redo],
				}];
			}
		}
	}, [applyOperations]);
	const duplicateNodes = useCallback((nodeIds: string[]): string[] => {
		const current = snapshotRef.current; if (!current || isGraphLocked) return [];
		const operations: FlowOperation[] = [];
		const created: string[] = [];
		for (const id of nodeIds) {
			const node = current.nodes.find(candidate => candidate.nodeId === id); if (!node) continue;
			const nodeId = `node-${crypto.randomUUID()}`;
			created.push(nodeId);
			operations.push({ mutationId: createFlowMutationId(), kind: "node.create", baseGraphRevision: current.flow.graphRevision, payload: { nodeId, typeId: node.typeId, title: node.title, config: structuredClone(node.config), x: node.x + 24, y: node.y + 24 } });
			operations.push({ mutationId: createFlowMutationId(), kind: "node.resize", baseLayoutRevision: current.flow.layoutRevision, payload: { nodeId, width: node.width, height: node.height } });
			if (node.collapsed) operations.push({ mutationId: createFlowMutationId(), kind: "node.collapse", baseLayoutRevision: current.flow.layoutRevision, payload: { nodeId, collapsed: true } });
		}
		if (operations.length) applyOperations(operations);
		return created;
	}, [applyOperations, isGraphLocked]);
	const pasteNodes = useCallback((nodes: readonly FlowDocumentNode[], x: number, y: number): string[] => {
		const current = snapshotRef.current;
		if (!current || isGraphLocked || nodes.length === 0) return [];
		const supportedTypes = new Set(nodeDefinitions.map((definition) => definition.typeId));
		const minX = Math.min(...nodes.map((node) => node.x));
		const minY = Math.min(...nodes.map((node) => node.y));
		const operations: FlowOperation[] = [];
		const created: string[] = [];
		for (const node of nodes) {
			if (!supportedTypes.has(node.typeId)) continue;
			const nodeId = `node-${crypto.randomUUID()}`;
			created.push(nodeId);
			operations.push({
				mutationId: createFlowMutationId(),
				kind: "node.create",
				baseGraphRevision: current.flow.graphRevision,
				payload: {
					nodeId,
					typeId: node.typeId,
					title: node.title,
					config: structuredClone(node.config),
					x: x + node.x - minX,
					y: y + node.y - minY,
				},
			});
			operations.push({
				mutationId: createFlowMutationId(),
				kind: "node.resize",
				baseLayoutRevision: current.flow.layoutRevision,
				payload: { nodeId, width: node.width, height: node.height },
			});
			if (node.collapsed)
				operations.push({
					mutationId: createFlowMutationId(),
					kind: "node.collapse",
					baseLayoutRevision: current.flow.layoutRevision,
					payload: { nodeId, collapsed: true },
				});
		}
		if (operations.length > 0) applyOperations(operations);
		return created;
	}, [applyOperations, isGraphLocked, nodeDefinitions]);

	const createGroup = useCallback((params: { groupId: string; title: string; color: string; parentGroupId: string | null; x: number; y: number; width: number; height: number; nodeIds: string[]; groupIds: string[] }): void => {
		const current = snapshotRef.current;
		if (!current || params.nodeIds.length + params.groupIds.length < 2) return;
		applyOperations([
			{ mutationId: createFlowMutationId(), kind: "group.create", baseLayoutRevision: current.flow.layoutRevision, payload: { groupId: params.groupId, title: params.title, color: params.color, parentGroupId: params.parentGroupId, x: params.x, y: params.y, width: params.width, height: params.height } },
			{ mutationId: createFlowMutationId(), kind: "group.reparent", baseLayoutRevision: current.flow.layoutRevision, payload: { nodes: params.nodeIds.map((nodeId) => ({ nodeId, groupId: params.groupId })), groups: params.groupIds.map((groupId) => ({ groupId, parentGroupId: params.groupId })) } },
		]);
	}, [applyOperations]);
	const dissolveGroup = useCallback((groupId: string): void => {
		const current = snapshotRef.current;
		if (!current?.groups?.some((group) => group.groupId === groupId)) return;
		applyOperation({ mutationId: createFlowMutationId(), kind: "group.dissolve", baseLayoutRevision: current.flow.layoutRevision, payload: { groupId } });
	}, [applyOperation]);
	const renameGroup = useCallback((groupId: string, title: string): void => {
		const current = snapshotRef.current;
		const group = current?.groups?.find((candidate) => candidate.groupId === groupId);
		const nextTitle = title.trim();
		if (!current || !group || !nextTitle || group.title === nextTitle || isGraphLocked) return;
		applyOperation({ mutationId: createFlowMutationId(), kind: "group.rename", baseLayoutRevision: current.flow.layoutRevision, payload: { groupId, title: nextTitle } });
	}, [applyOperation, isGraphLocked]);
	const moveGroupContents = useCallback((nodePositions: Array<{ nodeId: string; x: number; y: number }>, groupPositions: Array<{ groupId: string; x: number; y: number }>): void => {
		const current = snapshotRef.current;
		if (!current || isGraphLocked) return;
		const nodes = new Map(current.nodes.map((node): [string, FlowDocumentNode] => [node.nodeId, node]));
		const groups = new Map((current.groups ?? []).map((group): [string, FlowDocumentGroup] => [group.groupId, group]));
		const operations: FlowOperation[] = [
			...nodePositions.flatMap(({ nodeId, x, y }): FlowOperation[] => {
				const node = nodes.get(nodeId);
				return node && (node.x !== x || node.y !== y)
					? [{ mutationId: createFlowMutationId(), kind: "node.move", baseLayoutRevision: current.flow.layoutRevision, payload: { nodeId, x, y } }]
					: [];
			}),
			...groupPositions.flatMap(({ groupId, x, y }): FlowOperation[] => {
				const group = groups.get(groupId);
				return group && (group.x !== x || group.y !== y)
					? [{ mutationId: createFlowMutationId(), kind: "group.move", baseLayoutRevision: current.flow.layoutRevision, payload: { groupId, x, y } }]
					: [];
			}),
		];
		if (operations.length) applyOperations(operations);
	}, [applyOperations, isGraphLocked]);

	const deleteNode = useCallback(
		async (nodeId: string): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			applyOperation({ mutationId: createFlowMutationId(), kind: "node.delete", baseGraphRevision: current.flow.graphRevision, payload: { nodeId } });
		},
		[applyOperation, isGraphLocked],
	);

	const createEdge = useCallback(
		async (sourceNodeId: string, targetNodeId: string, sourcePort = "output", targetPort = "input", dataType: FlowDocumentNode["ports"][number]["dataTypes"][number] = "text"): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			applyOperation({ mutationId: createFlowMutationId(), kind: "edge.create", baseGraphRevision: current.flow.graphRevision, payload: { edgeId: `edge-${crypto.randomUUID()}`, sourceNodeId, sourcePort, targetNodeId, targetPort, dataType } });
		},
		[applyOperation, isGraphLocked],
	);

	const reconnectEdge = useCallback(
		async (
			edgeId: string,
			sourceNodeId: string,
			targetNodeId: string,
			sourcePort: string,
			targetPort: string,
			dataType: FlowDocumentNode["ports"][number]["dataTypes"][number],
		): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			applyOperations([
				{
					mutationId: createFlowMutationId(),
					kind: "edge.delete",
					baseGraphRevision: current.flow.graphRevision,
					payload: { edgeId },
				},
				{
					mutationId: createFlowMutationId(),
					kind: "edge.create",
					baseGraphRevision: current.flow.graphRevision,
					payload: {
						edgeId: `edge-${crypto.randomUUID()}`,
						sourceNodeId,
						sourcePort,
						targetNodeId,
						targetPort,
						dataType,
					},
				},
			]);
		},
		[applyOperations, isGraphLocked],
	);

	const deleteEdge = useCallback(
		async (edgeId: string): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			applyOperation({ mutationId: createFlowMutationId(), kind: "edge.delete", baseGraphRevision: current.flow.graphRevision, payload: { edgeId } });
		},
		[applyOperation, isGraphLocked],
	);

	const updateViewport = useCallback(
		async (viewport: { x: number; y: number; zoom: number }): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null) return;
			const old = current.flow.viewport;
			if (old.x === viewport.x && old.y === viewport.y && old.zoom === viewport.zoom) return;
			snapshotRef.current = { ...current, flow: { ...current.flow, viewport } };
			flowOperationOutbox.enqueue(current.flow.flowId, { mutationId: createFlowMutationId(), kind: "viewport.update", baseLayoutRevision: current.flow.layoutRevision, payload: viewport });
		},
		[],
	);

	const startRun = useCallback(
		async (request: FlowRunRequest = {}): Promise<boolean> => {
			let current = snapshotRef.current;
			if (current === null || runRequestStage !== "idle") return false;
			setError(null);
			setRunRequestStage("saving");
			try {
				await waitWithTimeout(
					flowOperationOutbox.flushFully(current.flow.flowId),
					15_000,
					t("flow.editor.runSaveTimeout", { defaultValue: "Saving Flow changes timed out. Try running again." }),
				);
				const saved = await fetchFlow(current.flow.flowId);
				const savedNodeTypes = new Map(saved.nodes.map((node): [string, string] => [node.nodeId, node.typeId]));
				if (request.entryNodeIds?.some((nodeId): boolean => savedNodeTypes.get(nodeId) !== "builtin/flow-input") === true)
					throw new Error(t("flow.editor.runEntryUnavailable", { defaultValue: "The selected run input has not been saved. Wait for Flow changes to finish saving and try again." }));
				const terminalTypes = new Set<string>(nodeDefinitionsRef.current.filter(definition => definition.terminal).map(definition => definition.typeId));
				if (request.targetNodeIds?.some((nodeId): boolean => !terminalTypes.has(savedNodeTypes.get(nodeId) ?? "")) === true)
					throw new Error(t("flow.editor.runTargetUnavailable", { defaultValue: "A selected Output node has not been saved. Wait for Flow changes to finish saving and try again." }));
				applySnapshot(saved);
				current = saved;
				setRunRequestStage("starting");
				const run = await startFlowRun({
					flowId: current.flow.flowId,
					revision: current.flow.graphRevision,
					...(request.forceNodeIds === undefined ? {} : { forceNodeIds: request.forceNodeIds }),
					...(request.forceAllSelected === undefined ? {} : { forceAllSelected: request.forceAllSelected }),
					...(request.entryNodeIds === undefined ? {} : { entryNodeIds: request.entryNodeIds }),
					...(request.targetNodeIds === undefined ? {} : { targetNodeIds: request.targetNodeIds }),
					...(request.inputValues === undefined ? {} : { inputValues: request.inputValues }),
				});
				const latest = snapshotRef.current;
				if (latest !== null && latest.flow.flowId === run.flowId) {
					const received = latest.runs.find((candidate): boolean => candidate.runId === run.runId) ?? run;
					const next = { ...latest, runs: [received, ...latest.runs.filter((candidate): boolean => candidate.runId !== run.runId)] };
					snapshotRef.current = next;
					setSnapshot(next);
				}
				return true;
			} catch (runError: unknown) {
				setError(errorMessage(runError));
				return false;
			} finally {
				setRunRequestStage("idle");
			}
		},
		[applySnapshot, runRequestStage, t],
	);

	const stopRun = useCallback(async (): Promise<void> => {
		const current = snapshotRef.current;
		const active = current?.runs.find((run): boolean => run.status === "running" || run.status === "queued" || run.status === "waiting");
		if (current === null || active === undefined) return;
		try {
			const run = await stopFlowRun(current.flow.flowId, active.runId);
			const next = { ...current, runs: current.runs.map((candidate) => candidate.runId === run.runId ? run : candidate) };
			snapshotRef.current = next;
			setSnapshot(next);
		} catch (stopError: unknown) {
			if (stopError instanceof BackendRpcError && stopError.code === "flow_run_not_running") {
				try {
					const synchronized = await fetchFlow(current.flow.flowId);
					if (selectedFlowIdRef.current === synchronized.flow.flowId) applySnapshot(synchronized);
					setError(null);
				} catch (synchronizeError: unknown) {
					setError(errorMessage(synchronizeError));
				}
				return;
			}
			setError(errorMessage(stopError));
		}
	}, [applySnapshot]);

	const setApprovalMode = useCallback(
		async (mode: FlowDocument["approvalMode"]): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null) return;
			setError(null);
			try {
				const saved = await flushAndFetchFlow(current.flow.flowId);
				const flow = await updateFlowSettings({
					flowId: saved.flow.flowId,
					revision: saved.flow.revision,
					approvalMode: mode,
				});
				if (snapshotRef.current?.flow.flowId === flow.flowId) applySnapshot({ ...snapshotRef.current, flow });
			} catch (settingsError: unknown) {
				setError(errorMessage(settingsError));
			}
		},
		[applySnapshot],
	);

	const resolveApproval = useCallback(
		async (approvalId: string, decision: "approve" | "reject", consentText?: string): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null) return;
			const approval = approvals.find((candidate): boolean => candidate.approvalId === approvalId);
			if (approval === undefined) return;
			try {
				const run = await resolveFlowApproval({
					flowId: current.flow.flowId,
					runId: approval.runId,
					approvalId,
					decision,
					...(consentText === undefined ? {} : { consentText }),
				});
				const latest = snapshotRef.current;
				if (latest?.flow.flowId !== current.flow.flowId) return;
				const received = latest.runs.find(candidate => candidate.runId === run.runId);
				const resolved = received?.finishedAt && !run.finishedAt ? received : run;
				applySnapshot({ ...latest, runs: latest.runs.some(candidate => candidate.runId === run.runId)
					? latest.runs.map(candidate => candidate.runId === run.runId ? resolved : candidate)
					: [resolved, ...latest.runs] });
				const approvalResult = await listFlowApprovals(current.flow.flowId);
				if (snapshotRef.current?.flow.flowId === current.flow.flowId) setApprovals(approvalResult.approvals);
			} catch (approvalError: unknown) {
				setError(errorMessage(approvalError));
			}
		},
		[applySnapshot, approvals],
	);

	const copyCurrentBranchToChat = useCallback(async (): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		const output = [...current.nodes].reverse().find((node): boolean => node.typeId === "builtin/output");
		if (output === undefined) {
			setError(t("flow.export.noOutput"));
			return;
		}
		try {
			const result = await exportFlowToSession({
				flowId: current.flow.flowId,
				outputNodeId: output.nodeId,
				title: current.flow.title,
			});
			onOpenChat(result.metadata);
		} catch (exportError: unknown) {
			setError(errorMessage(exportError));
		}
	}, [onOpenChat, t]);

	const renameCurrentFlow = useCallback(
		async (title: string): Promise<void> => {
			const flowId = snapshotRef.current?.flow.flowId;
			if (flowId !== undefined) await renameFlowById(flowId, title);
		},
		[renameFlowById],
	);
	const archiveCurrentFlow = useCallback(async (): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId !== undefined) await archiveFlowById(flowId);
	}, [archiveFlowById]);

	return {
		documentStore,
		runStore,
		flows,
		flowOrder,
		flowRuntimeStatusById,
		unreadFlowIds,
		snapshot,
		nodeDefinitions,
		tools,
		approvals,
		isGraphLocked,
		selectedNodeDetail,
		isLoading,
		isMutating,
		runRequestStage,
		error,
		refresh,
		createNewFlow,
		createFromChat,
		selectFlow,
		selectNode,
		copyCurrentBranchToChat,
		renameCurrentFlow,
		renameFlowById,
		archiveFlowById,
		archiveCurrentFlow,
		updateFlowOrder,
		moveFlowWorkspaceById,
		createNode,
		createConnectedNode,
		updateNode,
		updateNodePosition,
		updateNodePositions,
		setNodeCollapsed,
		exportFlowDataById,
		updateNodeLayouts,
		duplicateNodes,
		pasteNodes,
		deleteNode,
		createGroup,
		renameGroup,
		moveGroupContents,
		dissolveGroup,
		createEdge,
		reconnectEdge,
		deleteEdge,
		updateViewport,
		startRun,
		stopRun,
		setApprovalMode,
		resolveApproval,
		undo: (): void => replayHistory("undo"),
		redo: (): void => replayHistory("redo"),
		canUndo: (void historyRevision, undoStackRef.current.length > 0),
		canRedo: (void historyRevision, redoStackRef.current.length > 0),
	};
}
