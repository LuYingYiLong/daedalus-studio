import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMode } from "@/platform/rpc/chat-api";
import {
	archiveFlow,
	createFlow,
	createFlowEdge,
	createFlowNode,
	createConnectedFlowNode,
	exportFlowToSession,
	fetchFlow,
	fetchFlows,
	importFlowFromSession,
	renameFlow,
	startFlowRun,
	stopFlowRun,
	updateFlowNode,
	deleteFlowNode,
	deleteFlowEdge,
	updateFlowViewport,
	updateFlowSettings,
	listFlowNodeTypes,
	listFlowTools,
	listFlowApprovals,
	resolveFlowApproval,
	updateFlowTreeOrder as persistFlowTreeOrder,
	type CreateFlowParams,
} from "@/platform/rpc/flow-api";
import { onBackendEvent, onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import type {
	ConversationFlowSummary,
	FlowDocument,
	FlowDocumentNode,
	FlowDocumentSnapshot,
	FlowDocumentNodeType,
	FlowNodeTypeDefinition,
	FlowToolDefinition,
	FlowApproval,
	FlowTreeOrder,
	FlowTreeOrderUpdate,
	SessionMetadata,
} from "@/platform/rpc/types";

export type FlowNodeDetail = { node: FlowDocumentNode };

type UseHomeFlowControllerParams = {
	enabled: boolean;
	defaultFlow: Omit<CreateFlowParams, "title">;
	activeSessionId: string | null;
	activeSessionMetadata: SessionMetadata | null;
	composerMessage: string;
	isSessionLoading: boolean;
	isSending: boolean;
	onSessionSelect: (session: SessionMetadata) => void;
	onDraftChange: (message: string) => void;
	onSubmit: (message: string, modeOverride?: ChatMode) => void;
	onBeginNewFlow: () => void;
	onOpenChat: (session: SessionMetadata) => void;
};

export type HomeFlowController = {
	flows: ConversationFlowSummary[];
	flowOrder: FlowTreeOrder | null;
	flowBranchSessionIdsByFlow: Readonly<Record<string, readonly string[]>>;
	flowRuntimeStatusById: Readonly<Record<string, "running" | "failed" | "completed">>;
	snapshot: FlowDocumentSnapshot | null;
	nodeDefinitions: FlowNodeTypeDefinition[];
	tools: FlowToolDefinition[];
	approvals: FlowApproval[];
	isGraphLocked: boolean;
	isNewFlowHome: boolean;
	newFlowWorkspaceId: string | null;
	selectedBranchId: string | null;
	selectedNodeDetail: FlowNodeDetail | null;
	isLoading: boolean;
	isMutating: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	createNewFlow: (workspaceId?: string | null) => Promise<void>;
	setNewFlowWorkspace: (workspaceId: string | null) => void;
	submitNewFlowMessage: (message: string, modeOverride?: ChatMode) => Promise<void>;
	createFromChat: (session: SessionMetadata) => Promise<boolean>;
	selectFlow: (flowId: string) => Promise<void>;
	selectBranch: (branchId: string) => void;
	selectNode: (nodeId: string | null) => Promise<void>;
	deriveFromNode: (node: FlowDocumentNode) => Promise<void>;
	copyCurrentBranchToChat: () => Promise<void>;
	renameCurrentFlow: (title: string) => Promise<void>;
	renameFlowById: (flowId: string, title: string) => Promise<void>;
	archiveFlowById: (flowId: string) => Promise<void>;
	archiveCurrentFlow: () => Promise<void>;
	updateFlowOrder: (order: FlowTreeOrderUpdate) => Promise<void>;
	createNode: (type: FlowDocumentNodeType, x: number, y: number) => Promise<void>;
	createConnectedNode: (params: { type: FlowDocumentNodeType; x: number; y: number; direction: "from_existing" | "to_existing"; existingNodeId: string; existingPort: string; newPort: string; dataType: "text" | "json" | "artifact" }) => Promise<void>;
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
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function toSummary(flow: FlowDocument): ConversationFlowSummary {
	return {
		flowId: flow.flowId,
		title: flow.title,
		workspaceId: flow.workspaceId,
		pinned: flow.pinned,
		rootBranchId: "",
		revision: flow.revision,
		activeBranchId: null,
		activeRequestId: null,
		archivedAt: flow.archivedAt,
		createdFromSessionId: null,
		createdAt: flow.createdAt,
		updatedAt: flow.updatedAt,
		branchCount: 0,
	};
}

export default function useHomeFlowController(params: UseHomeFlowControllerParams): HomeFlowController {
	const { t } = useTranslation();
	const {
		enabled,
		defaultFlow,
		onOpenChat,
	} = params;
	const [flows, setFlows] = useState<ConversationFlowSummary[]>([]);
	const [flowOrder, setFlowOrder] = useState<FlowTreeOrder | null>(null);
	const [flowRuntimeStatusById, setFlowRuntimeStatusById] = useState<Record<string, "running" | "failed" | "completed">>({});
	const [snapshot, setSnapshot] = useState<FlowDocumentSnapshot | null>(null);
	const [nodeDefinitions, setNodeDefinitions] = useState<FlowNodeTypeDefinition[]>([]);
	const [tools, setTools] = useState<FlowToolDefinition[]>([]);
	const [approvals, setApprovals] = useState<FlowApproval[]>([]);
	const [isNewFlowHome, setIsNewFlowHome] = useState<boolean>(false);
	const [newFlowWorkspaceId, setNewFlowWorkspaceId] = useState<string | null>(null);
	const [selectedNodeDetail, setSelectedNodeDetail] = useState<FlowNodeDetail | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isMutating, setIsMutating] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const snapshotRef = useRef<FlowDocumentSnapshot | null>(null);
	const selectedFlowIdRef = useRef<string | null>(null);
	const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
	const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
	const ignoreFlowEventsUntilRef = useRef<number>(0);
	const isGraphLocked = snapshot?.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting") ?? false;

	const loadFlowResources = useCallback(async (flowId: string): Promise<void> => {
		const [nodeResult, toolResult, approvalResult] = await Promise.all([
			listFlowNodeTypes({ flowId }),
			listFlowTools(flowId),
			listFlowApprovals(flowId),
		]);
		if (selectedFlowIdRef.current !== flowId) return;
		setNodeDefinitions(nodeResult.nodes);
		setTools(toolResult.tools);
		setApprovals(approvalResult.approvals);
	}, []);

	const enqueueMutation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
		const next = mutationQueueRef.current.catch((): void => undefined).then(operation);
		mutationQueueRef.current = next.then((): void => undefined, (): void => undefined);
		return next;
	}, []);

	const applySnapshot = useCallback((next: FlowDocumentSnapshot): void => {
		snapshotRef.current = next;
		selectedFlowIdRef.current = next.flow.flowId;
		setSnapshot(next);
		setIsNewFlowHome(next.nodes.length === 0);
		setNewFlowWorkspaceId(next.flow.workspaceId);
		const latestRun = next.runs[0];
		if (latestRun !== undefined) setFlowRuntimeStatusById((current): Record<string, "running" | "failed" | "completed"> => ({ ...current, [next.flow.flowId]: latestRun.status === "running" || latestRun.status === "queued" || latestRun.status === "waiting" ? "running" : latestRun.status === "failed" ? "failed" : "completed" }));
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
				setIsNewFlowHome(true);
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
			const data = typeof event.data === "object" && event.data !== null ? event.data as Record<string, unknown> : {};
			const flowId = typeof data.flowId === "string" ? data.flowId : null;
			if (flowId === null || flowId !== selectedFlowIdRef.current) return;
			if (event.event === "flow.updated" && Date.now() < ignoreFlowEventsUntilRef.current) return;
			window.setTimeout((): void => { void refreshRef.current(); }, event.event === "flow.node.state" ? 180 : 30);
			if (event.event === "flow.node.state" || event.event === "flow.run.state") {
				void listFlowApprovals(flowId).then((result): void => setApprovals(result.approvals));
			}
		}).then((dispose): void => { unsubscribe = dispose; });
		const offReconnect = onBackendReconnected((): void => { if (enabled) void refreshRef.current(); });
		return (): void => { unsubscribe?.(); offReconnect(); };
	}, [enabled]);

	const createNewFlow = useCallback(async (workspaceId?: string | null): Promise<void> => {
		setIsMutating(true);
		setError(null);
		try {
			const next = await createFlow({
				title: t("flow.defaultTitle", { count: flows.length + 1 }),
				...(workspaceId === undefined || workspaceId === null ? {} : { workspaceId }),
			});
			applySnapshot(next);
			setIsNewFlowHome(true);
			const result = await fetchFlows();
			setFlows(result.flows.map(toSummary));
			if (result.order !== undefined) setFlowOrder(result.order);
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
		} finally {
			setIsMutating(false);
		}
	}, [applySnapshot, flows.length, t]);

	const setNewFlowWorkspace = useCallback((workspaceId: string | null): void => {
		setNewFlowWorkspaceId(workspaceId);
	}, []);

	const submitNewFlowMessage = useCallback(async (message: string, modeOverride?: ChatMode): Promise<void> => {
		const text = message.trim();
		const current = snapshotRef.current;
		if (text.length === 0 || current === null) return;
		setIsMutating(true);
		setError(null);
		try {
			const prompt = await createFlowNode({ flowId: current.flow.flowId, revision: current.flow.graphRevision, type: "prompt", x: 80, y: 160, title: "Prompt", config: { text } });
			const llm = await createFlowNode({ flowId: prompt.flow.flowId, revision: prompt.flow.graphRevision, type: "llm", x: 390, y: 160, title: "LLM", config: { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } });
			const output = await createFlowNode({ flowId: llm.flow.flowId, revision: llm.flow.graphRevision, type: "output", x: 700, y: 160, title: "Output", config: { format: "text" } });
			const firstEdge = await createFlowEdge({ flowId: output.flow.flowId, revision: output.flow.graphRevision, sourceNodeId: prompt.nodes[0]?.nodeId ?? "", sourcePort: "output", targetNodeId: llm.nodes[0]?.nodeId ?? "", targetPort: "input", dataType: "text" });
			const lastPrompt = prompt.nodes.find((node): boolean => node.type === "prompt");
			const lastLlm = llm.nodes.find((node): boolean => node.type === "llm");
			if (lastPrompt !== undefined && lastLlm !== undefined) {
				const final = await createFlowEdge({ flowId: output.flow.flowId, revision: firstEdge.flow.graphRevision, sourceNodeId: lastLlm.nodeId, sourcePort: "output", targetNodeId: output.nodes.find((node): boolean => node.type === "output")?.nodeId ?? "", targetPort: "input", dataType: "text" });
				applySnapshot(final);
			} else applySnapshot(firstEdge);
			setIsNewFlowHome(false);
			const latest = snapshotRef.current;
			if (latest !== null) await startFlowRun({ flowId: latest.flow.flowId, revision: latest.flow.graphRevision });
			void modeOverride;
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
		} finally {
			setIsMutating(false);
		}
	}, [applySnapshot, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort]);

	const createFromChat = useCallback(async (session: SessionMetadata): Promise<boolean> => {
		setIsMutating(true);
		setError(null);
		try {
			const next = await importFlowFromSession({ sourceSessionId: session.id, title: session.title });
			applySnapshot(next);
			setFlows((current): ConversationFlowSummary[] => [toSummary(next.flow), ...current.filter((flow): boolean => flow.flowId !== next.flow.flowId)]);
			return true;
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
			return false;
		} finally {
			setIsMutating(false);
		}
	}, [applySnapshot]);

	const selectFlow = useCallback(async (flowId: string): Promise<void> => {
		setIsLoading(true);
		setError(null);
		try { applySnapshot(await fetchFlow(flowId)); } catch (loadError: unknown) { setError(errorMessage(loadError)); } finally { setIsLoading(false); }
	}, [applySnapshot]);

	const selectNode = useCallback(async (nodeId: string | null): Promise<void> => {
		if (nodeId === null) { setSelectedNodeDetail(null); return; }
		const node = snapshotRef.current?.nodes.find((candidate): boolean => candidate.nodeId === nodeId);
		setSelectedNodeDetail(node === undefined ? null : { node });
	}, []);

	const renameFlowById = useCallback(async (flowId: string, title: string): Promise<void> => {
		const current = snapshotRef.current?.flow.flowId === flowId ? snapshotRef.current.flow : flows.find((flow): boolean => flow.flowId === flowId);
		if (current === undefined) return;
		setIsMutating(true);
		try {
			const updated = await renameFlow(flowId, title, current.revision);
			setFlows((items): ConversationFlowSummary[] => items.map((flow): ConversationFlowSummary => flow.flowId === flowId ? { ...flow, ...updated } : flow));
			if (snapshotRef.current?.flow.flowId === flowId) applySnapshot({ ...snapshotRef.current, flow: updated });
		} catch (mutationError: unknown) { setError(errorMessage(mutationError)); } finally { setIsMutating(false); }
	}, [applySnapshot, flows]);

	const archiveFlowById = useCallback(async (flowId: string): Promise<void> => {
		const current = snapshotRef.current?.flow.flowId === flowId ? snapshotRef.current.flow : flows.find((flow): boolean => flow.flowId === flowId);
		if (current === undefined) return;
		setIsMutating(true);
		try {
			await archiveFlow(flowId, current.revision);
			setFlows((items): ConversationFlowSummary[] => items.filter((flow): boolean => flow.flowId !== flowId));
			if (selectedFlowIdRef.current === flowId) { selectedFlowIdRef.current = null; snapshotRef.current = null; setSnapshot(null); setIsNewFlowHome(true); }
		} catch (mutationError: unknown) { setError(errorMessage(mutationError)); } finally { setIsMutating(false); }
	}, [flows]);

	const updateFlowOrder = useCallback(async (order: FlowTreeOrderUpdate): Promise<void> => {
		try {
			const result = await persistFlowTreeOrder(order);
			setFlowOrder(result.order);
			setFlows(result.flows.map(toSummary));
		} catch (orderError: unknown) { setError(errorMessage(orderError)); }
	}, []);

	const createNode = useCallback(async (type: FlowDocumentNodeType, x: number, y: number): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try {
			await enqueueMutation(async (): Promise<void> => {
				const current = snapshotRef.current;
				if (current === null || current.flow.flowId !== flowId) return;
				if (current.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting")) throw new Error("Stop the active Flow run before editing the graph.");
				const definition = nodeDefinitions.find((candidate): boolean => candidate.type === type);
				const config = { ...(definition?.defaultConfig ?? {}), ...(type === "llm" ? { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } : {}) };
				const next = await createFlowNode({ flowId: current.flow.flowId, revision: current.flow.graphRevision, type, x, y, title: definition?.defaultTitle, config });
				applySnapshot(next);
			});
		} catch (createError: unknown) { setError(errorMessage(createError)); }
	}, [applySnapshot, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort, enqueueMutation, nodeDefinitions]);

	const createConnectedNode = useCallback(async (params: { type: FlowDocumentNodeType; x: number; y: number; direction: "from_existing" | "to_existing"; existingNodeId: string; existingPort: string; newPort: string; dataType: "text" | "json" | "artifact" }): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try {
			await enqueueMutation(async (): Promise<void> => {
				const current = snapshotRef.current;
				if (current === null || current.flow.flowId !== flowId) return;
				if (current.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting")) throw new Error("Stop the active Flow run before editing the graph.");
				const definition = nodeDefinitions.find((candidate): boolean => candidate.type === params.type);
				const config = { ...(definition?.defaultConfig ?? {}), ...(params.type === "llm" ? { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } : {}) };
				const result = await createConnectedFlowNode({
					flowId,
					revision: current.flow.graphRevision,
					type: params.type,
					x: params.x,
					y: params.y,
					title: definition?.defaultTitle,
					config,
					connection: { direction: params.direction, existingNodeId: params.existingNodeId, existingPort: params.existingPort, newPort: params.newPort, dataType: params.dataType },
				});
				applySnapshot(result.snapshot);
			});
		} catch (createError: unknown) { setError(errorMessage(createError)); }
	}, [applySnapshot, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort, enqueueMutation, nodeDefinitions]);

	const updateNode = useCallback(async (nodeId: string, patch: Record<string, unknown>): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			if (current.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting")) throw new Error("Stop the active Flow run before editing the graph.");
			applySnapshot(await updateFlowNode({ flowId: current.flow.flowId, nodeId, revision: current.flow.graphRevision, patch: patch as never }));
		}); }
		catch (updateError: unknown) { setError(errorMessage(updateError)); }
	}, [applySnapshot, enqueueMutation]);

	const updateNodePosition = useCallback(async (nodeId: string, x: number, y: number): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			ignoreFlowEventsUntilRef.current = Date.now() + 1_000;
			const next = await updateFlowNode({ flowId, nodeId, revision: current.flow.layoutRevision, patch: { x, y } });
			if (snapshotRef.current?.flow.flowId === flowId) snapshotRef.current = next;
		}); }
		catch (updateError: unknown) { setError(errorMessage(updateError)); }
	}, [enqueueMutation]);

	const deleteNode = useCallback(async (nodeId: string): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			if (current.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting")) throw new Error("Stop the active Flow run before editing the graph.");
			applySnapshot(await deleteFlowNode({ flowId: current.flow.flowId, nodeId, revision: current.flow.graphRevision }));
		}); }
		catch (deleteError: unknown) { setError(errorMessage(deleteError)); }
	}, [applySnapshot, enqueueMutation]);

	const createEdge = useCallback(async (sourceNodeId: string, targetNodeId: string, sourcePort = "output", targetPort = "input", dataType: "text" | "json" | "artifact" = "text"): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		setError(null);
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			if (current.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting")) throw new Error("Stop the active Flow run before editing the graph.");
			applySnapshot(await createFlowEdge({ flowId: current.flow.flowId, revision: current.flow.graphRevision, sourceNodeId, sourcePort, targetNodeId, targetPort, dataType }));
		}); }
		catch (edgeError: unknown) { setError(errorMessage(edgeError)); }
	}, [applySnapshot, enqueueMutation]);

	const deleteEdge = useCallback(async (edgeId: string): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			if (current.runs.some((run): boolean => run.status === "queued" || run.status === "running" || run.status === "waiting")) throw new Error("Stop the active Flow run before editing the graph.");
			applySnapshot(await deleteFlowEdge({ flowId: current.flow.flowId, edgeId, revision: current.flow.graphRevision }));
		}); }
		catch (edgeError: unknown) { setError(errorMessage(edgeError)); }
	}, [applySnapshot, enqueueMutation]);

	const updateViewport = useCallback(async (viewport: { x: number; y: number; zoom: number }): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			ignoreFlowEventsUntilRef.current = Date.now() + 1_000;
			const flow = await updateFlowViewport({ flowId: current.flow.flowId, revision: current.flow.layoutRevision, viewport });
			if (snapshotRef.current?.flow.flowId === flowId) snapshotRef.current = { ...snapshotRef.current, flow };
		}); }
		catch (viewportError: unknown) { setError(errorMessage(viewportError)); }
	}, [enqueueMutation]);

	const startRun = useCallback(async (forceNodeIds?: string[]): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		try { await startFlowRun({ flowId: current.flow.flowId, revision: current.flow.graphRevision, ...(forceNodeIds === undefined ? {} : { forceNodeIds }) }); void refresh(); }
		catch (runError: unknown) { setError(errorMessage(runError)); }
	}, [refresh]);

	const stopRun = useCallback(async (): Promise<void> => {
		const current = snapshotRef.current;
		const active = current?.runs.find((run): boolean => run.status === "running" || run.status === "queued" || run.status === "waiting");
		if (current === null || active === undefined) return;
		try { await stopFlowRun(current.flow.flowId, active.runId); void refresh(); }
		catch (stopError: unknown) { setError(errorMessage(stopError)); }
	}, [refresh]);

	const setApprovalMode = useCallback(async (mode: FlowDocument["approvalMode"]): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		try {
			const flow = await updateFlowSettings({ flowId: current.flow.flowId, revision: current.flow.revision, approvalMode: mode });
			if (snapshotRef.current?.flow.flowId === flow.flowId) applySnapshot({ ...snapshotRef.current, flow });
		} catch (settingsError: unknown) { setError(errorMessage(settingsError)); }
	}, [applySnapshot]);

	const resolveApproval = useCallback(async (approvalId: string, decision: "approve" | "reject", consentText?: string): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		const approval = approvals.find((candidate): boolean => candidate.approvalId === approvalId);
		if (approval === undefined) return;
		try {
			await resolveFlowApproval({ flowId: current.flow.flowId, runId: approval.runId, approvalId, decision, ...(consentText === undefined ? {} : { consentText }) });
			const [next, approvalResult] = await Promise.all([fetchFlow(current.flow.flowId), listFlowApprovals(current.flow.flowId)]);
			applySnapshot(next);
			setApprovals(approvalResult.approvals);
		} catch (approvalError: unknown) { setError(errorMessage(approvalError)); }
	}, [applySnapshot, approvals]);

	const copyCurrentBranchToChat = useCallback(async (): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		const output = [...current.nodes].reverse().find((node): boolean => node.type === "output");
		if (output === undefined) { setError(t("flow.export.noOutput")); return; }
		try {
			const result = await exportFlowToSession({ flowId: current.flow.flowId, outputNodeId: output.nodeId, title: current.flow.title });
			onOpenChat(result.metadata);
		} catch (exportError: unknown) { setError(errorMessage(exportError)); }
	}, [onOpenChat, t]);

	const renameCurrentFlow = useCallback(async (title: string): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId !== undefined) await renameFlowById(flowId, title);
	}, [renameFlowById]);
	const archiveCurrentFlow = useCallback(async (): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId !== undefined) await archiveFlowById(flowId);
	}, [archiveFlowById]);

	return {
		flows,
		flowOrder,
		flowBranchSessionIdsByFlow: {},
		flowRuntimeStatusById,
		snapshot,
		nodeDefinitions,
		tools,
		approvals,
		isGraphLocked,
		isNewFlowHome,
		newFlowWorkspaceId,
		selectedBranchId: null,
		selectedNodeDetail,
		isLoading,
		isMutating,
		error,
		refresh,
		createNewFlow,
		setNewFlowWorkspace,
		submitNewFlowMessage,
		createFromChat,
		selectFlow,
		selectBranch: (): void => undefined,
		selectNode,
		deriveFromNode: async (): Promise<void> => undefined,
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
	};
}
