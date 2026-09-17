import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMode } from "@/platform/rpc/chat-api";
import {
	archiveFlow,
	createFlow,
	createFlowEdge,
	createFlowNode,
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
	updateFlowTreeOrder as persistFlowTreeOrder,
	type CreateFlowParams,
} from "@/platform/rpc/flow-api";
import { onBackendEvent, onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import type {
	ConversationFlowSummary,
	FlowDocument,
	FlowDocumentNode,
	FlowDocumentSnapshot,
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
	createNode: (type: "prompt" | "llm" | "output" | "note", x: number, y: number) => Promise<void>;
	updateNode: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
	updateNodePosition: (nodeId: string, x: number, y: number) => Promise<void>;
	deleteNode: (nodeId: string) => Promise<void>;
	createEdge: (sourceNodeId: string, targetNodeId: string, sourcePort?: string, targetPort?: string) => Promise<void>;
	deleteEdge: (edgeId: string) => Promise<void>;
	updateViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<void>;
	startRun: (forceNodeIds?: string[]) => Promise<void>;
	stopRun: () => Promise<void>;
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
		if (latestRun !== undefined) setFlowRuntimeStatusById((current): Record<string, "running" | "failed" | "completed"> => ({ ...current, [next.flow.flowId]: latestRun.status === "running" || latestRun.status === "queued" ? "running" : latestRun.status === "failed" ? "failed" : "completed" }));
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

	useEffect((): (() => void) => {
		let unsubscribe: (() => void) | undefined;
		void onBackendEvent((event): void => {
			const data = typeof event.data === "object" && event.data !== null ? event.data as Record<string, unknown> : {};
			const flowId = typeof data.flowId === "string" ? data.flowId : null;
			if (flowId === null || flowId !== selectedFlowIdRef.current) return;
			if (Date.now() < ignoreFlowEventsUntilRef.current) return;
			window.setTimeout((): void => { void refreshRef.current(); }, event.event === "flow.node.state" ? 180 : 30);
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
			const prompt = await createFlowNode({ flowId: current.flow.flowId, revision: current.flow.revision, type: "prompt", x: 80, y: 160, title: "Prompt", config: { text } });
			const llm = await createFlowNode({ flowId: prompt.flow.flowId, revision: prompt.flow.revision, type: "llm", x: 390, y: 160, title: "LLM", config: { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } });
			const output = await createFlowNode({ flowId: llm.flow.flowId, revision: llm.flow.revision, type: "output", x: 700, y: 160, title: "Output", config: { format: "text" } });
			const firstEdge = await createFlowEdge({ flowId: output.flow.flowId, revision: output.flow.revision, sourceNodeId: prompt.nodes[0]?.nodeId ?? "", sourcePort: "output", targetNodeId: llm.nodes[0]?.nodeId ?? "", targetPort: "input", dataType: "text" });
			const lastPrompt = prompt.nodes.find((node): boolean => node.type === "prompt");
			const lastLlm = llm.nodes.find((node): boolean => node.type === "llm");
			if (lastPrompt !== undefined && lastLlm !== undefined) {
				const final = await createFlowEdge({ flowId: output.flow.flowId, revision: firstEdge.flow.revision, sourceNodeId: lastLlm.nodeId, sourcePort: "output", targetNodeId: output.nodes.find((node): boolean => node.type === "output")?.nodeId ?? "", targetPort: "input", dataType: "text" });
				applySnapshot(final);
			} else applySnapshot(firstEdge);
			setIsNewFlowHome(false);
			const latest = snapshotRef.current;
			if (latest !== null) await startFlowRun({ flowId: latest.flow.flowId, revision: latest.flow.revision });
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

	const createNode = useCallback(async (type: "prompt" | "llm" | "output" | "note", x: number, y: number): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try {
			await enqueueMutation(async (): Promise<void> => {
				const current = snapshotRef.current;
				if (current === null || current.flow.flowId !== flowId) return;
				const next = await createFlowNode({ flowId: current.flow.flowId, revision: current.flow.revision, type, x, y, title: type === "llm" ? "LLM" : type[0].toUpperCase() + type.slice(1), config: type === "prompt" ? { text: "" } : type === "note" ? { text: "" } : type === "output" ? { format: "text" } : { provider: defaultFlow.provider ?? "", model: defaultFlow.model ?? "", reasoningEffort: defaultFlow.reasoningEffort ?? "" } });
				applySnapshot(next);
			});
		} catch (createError: unknown) { setError(errorMessage(createError)); }
	}, [applySnapshot, defaultFlow.model, defaultFlow.provider, defaultFlow.reasoningEffort, enqueueMutation]);

	const updateNode = useCallback(async (nodeId: string, patch: Record<string, unknown>): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			applySnapshot(await updateFlowNode({ flowId: current.flow.flowId, nodeId, revision: current.flow.revision, patch: patch as never }));
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
			const next = await updateFlowNode({ flowId, nodeId, revision: current.flow.revision, patch: { x, y } });
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
			applySnapshot(await deleteFlowNode({ flowId: current.flow.flowId, nodeId, revision: current.flow.revision }));
		}); }
		catch (deleteError: unknown) { setError(errorMessage(deleteError)); }
	}, [applySnapshot, enqueueMutation]);

	const createEdge = useCallback(async (sourceNodeId: string, targetNodeId: string, sourcePort = "output", targetPort = "input"): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		setError(null);
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			applySnapshot(await createFlowEdge({ flowId: current.flow.flowId, revision: current.flow.revision, sourceNodeId, sourcePort, targetNodeId, targetPort, dataType: "text" }));
		}); }
		catch (edgeError: unknown) { setError(errorMessage(edgeError)); }
	}, [applySnapshot, enqueueMutation]);

	const deleteEdge = useCallback(async (edgeId: string): Promise<void> => {
		const flowId = snapshotRef.current?.flow.flowId;
		if (flowId === undefined) return;
		try { await enqueueMutation(async (): Promise<void> => {
			const current = snapshotRef.current;
			if (current === null || current.flow.flowId !== flowId) return;
			applySnapshot(await deleteFlowEdge({ flowId: current.flow.flowId, edgeId, revision: current.flow.revision }));
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
			const flow = await updateFlowViewport({ flowId: current.flow.flowId, revision: current.flow.revision, viewport });
			if (snapshotRef.current?.flow.flowId === flowId) snapshotRef.current = { ...snapshotRef.current, flow };
		}); }
		catch (viewportError: unknown) { setError(errorMessage(viewportError)); }
	}, [enqueueMutation]);

	const startRun = useCallback(async (forceNodeIds?: string[]): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		try { await startFlowRun({ flowId: current.flow.flowId, revision: current.flow.revision, ...(forceNodeIds === undefined ? {} : { forceNodeIds }) }); void refresh(); }
		catch (runError: unknown) { setError(errorMessage(runError)); }
	}, [refresh]);

	const stopRun = useCallback(async (): Promise<void> => {
		const current = snapshotRef.current;
		const active = current?.runs.find((run): boolean => run.status === "running" || run.status === "queued");
		if (current === null || active === undefined) return;
		try { await stopFlowRun(current.flow.flowId, active.runId); void refresh(); }
		catch (stopError: unknown) { setError(errorMessage(stopError)); }
	}, [refresh]);

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
		updateNode,
		updateNodePosition,
		deleteNode,
		createEdge,
		deleteEdge,
		updateViewport,
		startRun,
		stopRun,
	};
}
