import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { archiveFlow, commitFlowPatch, createFlow, exportFlowToSession, fetchFlow, fetchFlows, importFlowFromSession, renameFlow, startFlowRun, stopFlowRun, updateFlowSettings, listFlowNodeTypes, listFlowTools, listFlowApprovals, resolveFlowApproval, updateFlowTreeOrder as persistFlowTreeOrder, type CreateFlowParams } from "@/platform/rpc/flow-api";
import { onBackendEvent, onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import type { FlowDocumentSummary, FlowDocument, FlowDocumentEdge, FlowDocumentNode, FlowDocumentNodeRun, FlowDocumentRun, FlowDocumentSnapshot, FlowNodeTypeId, FlowNodeTypeDefinition, FlowToolDefinition, FlowApproval, FlowOperation, FlowTreeOrder, FlowTreeOrderUpdate, SessionMetadata } from "@/platform/rpc/types";
import { createFlowMutationId, flowOperationOutbox } from "@/domain/flow/flow-operation-outbox";

export type FlowNodeDetail = { node: FlowDocumentNode };

type UseHomeFlowControllerParams = {
	enabled: boolean;
	defaultFlow: Omit<CreateFlowParams, "title">;
	onOpenChat: (session: SessionMetadata) => void;
};

export type HomeFlowController = {
	flows: FlowDocumentSummary[];
	flowOrder: FlowTreeOrder | null;
	flowRuntimeStatusById: Readonly<Record<string, "running" | "failed" | "completed">>;
	snapshot: FlowDocumentSnapshot | null;
	nodeDefinitions: FlowNodeTypeDefinition[];
	tools: FlowToolDefinition[];
	approvals: FlowApproval[];
	isGraphLocked: boolean;
	selectedNodeDetail: FlowNodeDetail | null;
	isLoading: boolean;
	isMutating: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	createNewFlow: (workspaceId?: string | null) => Promise<void>;
	createFromChat: (session: SessionMetadata) => Promise<boolean>;
	selectFlow: (flowId: string) => Promise<void>;
	selectNode: (nodeId: string | null) => Promise<void>;
	copyCurrentBranchToChat: () => Promise<void>;
	renameCurrentFlow: (title: string) => Promise<void>;
	renameFlowById: (flowId: string, title: string) => Promise<void>;
	archiveFlowById: (flowId: string) => Promise<void>;
	archiveCurrentFlow: () => Promise<void>;
	updateFlowOrder: (order: FlowTreeOrderUpdate) => Promise<void>;
	createNode: (type: FlowNodeTypeId, x: number, y: number) => Promise<void>;
	createConnectedNode: (params: { type: FlowNodeTypeId; x: number; y: number; direction: "from_existing" | "to_existing"; existingNodeId: string; existingPort: string; newPort: string; dataType: "text" | "json" | "artifact" }) => Promise<void>;
	updateNode: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
	updateNodePosition: (nodeId: string, x: number, y: number) => Promise<void>;
	deleteNode: (nodeId: string) => Promise<void>;
	createEdge: (sourceNodeId: string, targetNodeId: string, sourcePort?: string, targetPort?: string, dataType?: "text" | "json" | "artifact") => Promise<void>;
	deleteEdge: (edgeId: string) => Promise<void>;
	updateViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<void>;
	startRun: (forceNodeIds?: string[]) => Promise<void>;
	stopRun: () => Promise<void>;
	setApprovalMode: (mode: FlowDocument["approvalMode"]) => Promise<void>;
	resolveApproval: (approvalId: string, decision: "approve" | "reject", consentText?: string) => Promise<void>;
	undo: () => void;
	redo: () => void;
	canUndo: boolean;
	canRedo: boolean;
};

type FlowHistoryCommand = { undo: FlowOperation[]; redo: FlowOperation[] };

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
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

function resolveOptimisticPorts(node: FlowDocumentNode, definition: FlowNodeTypeDefinition | undefined, config: Record<string, unknown>): FlowDocumentNode["ports"] {
	if (definition === undefined || (definition.dynamicPorts?.length ?? 0) === 0) return node.ports;
	const ports = definition.ports.map((port) => ({ ...port, dataTypes: [...port.dataTypes] }));
	for (const dynamic of definition.dynamicPorts ?? []) {
		const values = config[dynamic.configField];
		if (!Array.isArray(values)) continue;
		for (const value of values.slice(0, 64 - ports.length)) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
			const record = value as Record<string, unknown>;
			const id = record[dynamic.idField];
			if (typeof id !== "string" || id.length === 0 || ports.some((port): boolean => port.id === id && port.direction === dynamic.direction)) continue;
			const configuredType = dynamic.dataTypeField === undefined ? undefined : record[dynamic.dataTypeField];
			const dataTypes: FlowDocumentNode["ports"][number]["dataTypes"] = typeof configuredType === "string" && (configuredType === "text" || configuredType === "json" || configuredType === "artifact") ? [configuredType] : [...dynamic.dataTypes];
			const label = record[dynamic.labelField];
			ports.push({ id, label: typeof label === "string" && label.length > 0 ? label : id, direction: dynamic.direction, dataTypes, required: dynamic.required, multiple: dynamic.multiple, defaultConnect: dynamic.defaultConnect });
		}
	}
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
			config: operation.payload.config ?? definition.defaultConfig,
			ports: definition.ports,
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
	if (operation.kind === "node.delete") return { ...snapshot, nodes: snapshot.nodes.filter((node): boolean => node.nodeId !== operation.payload.nodeId), edges: snapshot.edges.filter((edge): boolean => edge.sourceNodeId !== operation.payload.nodeId && edge.targetNodeId !== operation.payload.nodeId) };
	if (operation.kind === "node.move") return { ...snapshot, nodes: snapshot.nodes.map((node): FlowDocumentNode => node.nodeId === operation.payload.nodeId ? { ...node, x: operation.payload.x, y: operation.payload.y } : node) };
	if (operation.kind === "node.resize") return { ...snapshot, nodes: snapshot.nodes.map((node): FlowDocumentNode => node.nodeId === operation.payload.nodeId ? { ...node, width: operation.payload.width, height: operation.payload.height } : node) };
	if (operation.kind === "edge.create") {
		const edge: FlowDocumentEdge = { flowId: snapshot.flow.flowId, ...operation.payload };
		const target = snapshot.nodes.find((node): boolean => node.nodeId === edge.targetNodeId)?.ports.find((port): boolean => port.id === edge.targetPort && port.direction === "input");
		return { ...snapshot, edges: [...snapshot.edges.filter((candidate): boolean => target?.multiple === true || !(candidate.targetNodeId === edge.targetNodeId && candidate.targetPort === edge.targetPort)), edge] };
	}
	if (operation.kind === "edge.delete") return { ...snapshot, edges: snapshot.edges.filter((edge): boolean => edge.edgeId !== operation.payload.edgeId) };
	return { ...snapshot, flow: { ...snapshot.flow, viewport: operation.payload } };
}

function inverseFlowOperations(snapshot: FlowDocumentSnapshot, operation: FlowOperation): FlowOperation[] {
	const mutationId = "history";
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
	if (operation.kind === "node.move" || operation.kind === "node.resize" || operation.kind === "viewport.update") return { ...operation, mutationId, baseLayoutRevision: snapshot.flow.layoutRevision } as FlowOperation;
	return { ...operation, mutationId, baseGraphRevision: snapshot.flow.graphRevision } as FlowOperation;
}

export default function useHomeFlowController(params: UseHomeFlowControllerParams): HomeFlowController {
	const { t } = useTranslation();
	const { enabled, defaultFlow, onOpenChat } = params;
	const [flows, setFlows] = useState<FlowDocumentSummary[]>([]);
	const [flowOrder, setFlowOrder] = useState<FlowTreeOrder | null>(null);
	const [flowRuntimeStatusById, setFlowRuntimeStatusById] = useState<Record<string, "running" | "failed" | "completed">>({});
	const [snapshot, setSnapshot] = useState<FlowDocumentSnapshot | null>(null);
	const [nodeDefinitions, setNodeDefinitions] = useState<FlowNodeTypeDefinition[]>([]);
	const [tools, setTools] = useState<FlowToolDefinition[]>([]);
	const [approvals, setApprovals] = useState<FlowApproval[]>([]);
	const [selectedNodeDetail, setSelectedNodeDetail] = useState<FlowNodeDetail | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isMutating, setIsMutating] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [historyRevision, setHistoryRevision] = useState<number>(0);
	const snapshotRef = useRef<FlowDocumentSnapshot | null>(null);
	const nodeDefinitionsRef = useRef<FlowNodeTypeDefinition[]>([]);
	const selectedFlowIdRef = useRef<string | null>(null);
	const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
	const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
	const ignoreFlowEventsUntilRef = useRef<number>(0);
	const undoStackRef = useRef<FlowHistoryCommand[]>([]);
	const redoStackRef = useRef<FlowHistoryCommand[]>([]);
	const isGraphLocked = snapshot?.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting") ?? false;
	nodeDefinitionsRef.current = nodeDefinitions;

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
					[next.flow.flowId]: latestRun.status === "running" || latestRun.status === "queued" || latestRun.status === "waiting" ? "running" : latestRun.status === "failed" ? "failed" : "completed",
				}),
			);
	}, []);

	const applyOperations = useCallback((operations: FlowOperation[], recordHistory = true): void => {
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
			undoStackRef.current = [...undoStackRef.current.slice(-99), { undo: inverse, redo: operations.map((operation): FlowOperation => structuredClone(operation)) }];
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
		flowOperationOutbox.connect(
			async (flowId, clientId, operations) => {
				const ack = await commitFlowPatch({ flowId, clientId, operations });
				const current = snapshotRef.current;
				if (current?.flow.flowId === flowId) {
					const next = { ...current, flow: { ...current.flow, graphRevision: ack.graphRevision, layoutRevision: ack.layoutRevision, revision: Math.max(current.flow.revision, ack.graphRevision) } };
					snapshotRef.current = next;
					setSnapshot(next);
				}
				return ack;
			},
			(error): void => {
				setError(errorMessage(error));
				const flowId = selectedFlowIdRef.current;
				if (flowId === null) return;
				void fetchFlow(flowId).then((server): void => {
					flowOperationOutbox.rebase(flowId, server.flow.graphRevision, server.flow.layoutRevision);
					const replayed = flowOperationOutbox.readPending(flowId).reduce((value, operation): FlowDocumentSnapshot => applyFlowOperation(value, operation, nodeDefinitionsRef.current), server);
					applySnapshot(replayed);
				}).catch((loadError: unknown): void => setError(errorMessage(loadError)));
			},
		);
		const flushOnBlur = (): void => {
			void flowOperationOutbox.flushAll().catch((): void => undefined);
		};
		window.addEventListener("blur", flushOnBlur);
		return (): void => {
			window.removeEventListener("blur", flushOnBlur);
			void flowOperationOutbox.flushAll().finally((): void => flowOperationOutbox.disconnect());
		};
	}, [applySnapshot]);

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
			if (flowId === null || flowId !== selectedFlowIdRef.current) return;
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
										? (eventNodeRun ?? { ...node, status: status as typeof node.status })
										: node),
								}),
					};
					snapshotRef.current = next;
					setSnapshot(next);
					if (event.event === "flow.run.state")
						setFlowRuntimeStatusById((values): Record<string, "running" | "failed" | "completed"> => ({
							...values,
							[flowId]: status === "running" || status === "queued" || status === "waiting"
								? "running"
								: status === "failed"
									? "failed"
									: "completed",
						}));
				}
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
		async (workspaceId?: string | null): Promise<void> => {
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
			} catch (mutationError: unknown) {
				setError(errorMessage(mutationError));
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
			try {
				const updated = await renameFlow(flowId, title, current.revision);
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
			try {
				await archiveFlow(flowId, current.revision);
				setFlows((items): FlowDocumentSummary[] => items.filter((flow): boolean => flow.flowId !== flowId));
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

	const createNode = useCallback(
		async (type: FlowNodeTypeId, x: number, y: number): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			const definition = nodeDefinitions.find((candidate): boolean => candidate.typeId === type);
			if (definition === undefined) return;
			const config = { ...definition.defaultConfig, ...(type === "builtin/llm" ? { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } : {}) };
			applyOperation({ mutationId: createFlowMutationId(), kind: "node.create", baseGraphRevision: current.flow.graphRevision, payload: { nodeId: `node-${crypto.randomUUID()}`, typeId: type, title: definition.defaultTitle, x, y, config } });
		},
		[applyOperation, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort, isGraphLocked, nodeDefinitions],
	);

	const createConnectedNode = useCallback(
		async (params: { type: FlowNodeTypeId; x: number; y: number; direction: "from_existing" | "to_existing"; existingNodeId: string; existingPort: string; newPort: string; dataType: "text" | "json" | "artifact" }): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			const definition = nodeDefinitions.find((candidate): boolean => candidate.typeId === params.type);
			if (definition === undefined) return;
			const nodeId = `node-${crypto.randomUUID()}`;
			const config = { ...definition.defaultConfig, ...(params.type === "builtin/llm" ? { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } : {}) };
			const createOperation: FlowOperation = { mutationId: createFlowMutationId(), kind: "node.create", baseGraphRevision: current.flow.graphRevision, payload: { nodeId, typeId: params.type, title: definition.defaultTitle, x: params.x, y: params.y, config } };
			const sourceNodeId = params.direction === "from_existing" ? params.existingNodeId : nodeId;
			const targetNodeId = params.direction === "from_existing" ? nodeId : params.existingNodeId;
			const edgeOperation: FlowOperation = { mutationId: createFlowMutationId(), kind: "edge.create", baseGraphRevision: current.flow.graphRevision, payload: { edgeId: `edge-${crypto.randomUUID()}`, sourceNodeId, sourcePort: params.direction === "from_existing" ? params.existingPort : params.newPort, targetNodeId, targetPort: params.direction === "from_existing" ? params.newPort : params.existingPort, dataType: params.dataType } };
			applyOperations([createOperation, edgeOperation]);
		},
		[applyOperations, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort, isGraphLocked, nodeDefinitions],
	);

	const updateNode = useCallback(
		async (nodeId: string, patch: Record<string, unknown>): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			applyOperation({ mutationId: createFlowMutationId(), kind: "node.update", baseGraphRevision: current.flow.graphRevision, payload: { nodeId, ...(typeof patch.title === "string" ? { title: patch.title } : {}), ...(patch.config !== null && typeof patch.config === "object" && !Array.isArray(patch.config) ? { config: patch.config as Record<string, unknown> } : {}) } });
		},
		[applyOperation, isGraphLocked],
	);

	const updateNodePosition = useCallback(
		async (nodeId: string, x: number, y: number): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null) return;
			applyOperation({ mutationId: createFlowMutationId(), kind: "node.move", baseLayoutRevision: current.flow.layoutRevision, payload: { nodeId, x, y } });
		},
		[applyOperation],
	);

	const deleteNode = useCallback(
		async (nodeId: string): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			applyOperation({ mutationId: createFlowMutationId(), kind: "node.delete", baseGraphRevision: current.flow.graphRevision, payload: { nodeId } });
		},
		[applyOperation, isGraphLocked],
	);

	const createEdge = useCallback(
		async (sourceNodeId: string, targetNodeId: string, sourcePort = "output", targetPort = "input", dataType: "text" | "json" | "artifact" = "text"): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || isGraphLocked) return;
			applyOperation({ mutationId: createFlowMutationId(), kind: "edge.create", baseGraphRevision: current.flow.graphRevision, payload: { edgeId: `edge-${crypto.randomUUID()}`, sourceNodeId, sourcePort, targetNodeId, targetPort, dataType } });
		},
		[applyOperation, isGraphLocked],
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
			applyOperation({ mutationId: createFlowMutationId(), kind: "viewport.update", baseLayoutRevision: current.flow.layoutRevision, payload: viewport });
		},
		[applyOperation],
	);

	const startRun = useCallback(
		async (forceNodeIds?: string[]): Promise<void> => {
			let current = snapshotRef.current;
			if (current === null) return;
			try {
				await flowOperationOutbox.flushFully(current.flow.flowId);
				current = snapshotRef.current;
				if (current === null) return;
				const run = await startFlowRun({
					flowId: current.flow.flowId,
					revision: current.flow.graphRevision,
					...(forceNodeIds === undefined ? {} : { forceNodeIds }),
				});
				const latest = snapshotRef.current;
				if (latest === null || latest.flow.flowId !== run.flowId) return;
				const received = latest.runs.find((candidate): boolean => candidate.runId === run.runId) ?? run;
				const next = { ...latest, runs: [received, ...latest.runs.filter((candidate): boolean => candidate.runId !== run.runId)] };
				snapshotRef.current = next;
				setSnapshot(next);
			} catch (runError: unknown) {
				setError(errorMessage(runError));
			}
		},
		[],
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
			setError(errorMessage(stopError));
		}
	}, []);

	const setApprovalMode = useCallback(
		async (mode: FlowDocument["approvalMode"]): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null) return;
			try {
				const flow = await updateFlowSettings({
					flowId: current.flow.flowId,
					revision: current.flow.revision,
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
				await resolveFlowApproval({
					flowId: current.flow.flowId,
					runId: approval.runId,
					approvalId,
					decision,
					...(consentText === undefined ? {} : { consentText }),
				});
				const [next, approvalResult] = await Promise.all([fetchFlow(current.flow.flowId), listFlowApprovals(current.flow.flowId)]);
				applySnapshot(next);
				setApprovals(approvalResult.approvals);
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
		flows,
		flowOrder,
		flowRuntimeStatusById,
		snapshot,
		nodeDefinitions,
		tools,
		approvals,
		isGraphLocked,
		selectedNodeDetail,
		isLoading,
		isMutating,
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
		createNode,
		createConnectedNode,
		updateNode,
		updateNodePosition,
		deleteNode,
		createEdge,
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
