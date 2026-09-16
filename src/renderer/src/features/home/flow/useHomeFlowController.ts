import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMode } from "@/platform/rpc/chat-api";
import {
	archiveFlow,
	copyFlowBranchToChat,
	createFlow,
	createFlowBranch,
	createFlowFromSession,
	fetchFlow,
	fetchFlowNode,
	fetchFlows,
	renameFlow,
	updateFlowTreeOrder as persistFlowTreeOrder,
} from "@/platform/rpc/flow-api";
import { onBackendEvent, onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import type {
	ConversationFlowBranch,
	ConversationFlowNode,
	ConversationFlowSnapshot,
	ConversationFlowSummary,
	FlowTreeOrder,
	FlowTreeOrderUpdate,
	SessionMetadata,
	TimelineBlock,
} from "@/platform/rpc/types";
import type { CreateFlowParams } from "@/platform/rpc/flow-api";

export type FlowNodeDetail = {
	node: ConversationFlowNode;
	block: TimelineBlock;
};

export type HomeFlowController = {
	flows: ConversationFlowSummary[];
	flowOrder: FlowTreeOrder | null;
	flowBranchSessionIdsByFlow: Readonly<Record<string, readonly string[]>>;
	snapshot: ConversationFlowSnapshot | null;
	isNewFlowHome: boolean;
	selectedBranchId: string | null;
	selectedNodeDetail: FlowNodeDetail | null;
	isLoading: boolean;
	isMutating: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	createNewFlow: () => Promise<void>;
	submitNewFlowMessage: (message: string, modeOverride?: ChatMode) => Promise<void>;
	createFromChat: (session: SessionMetadata) => Promise<boolean>;
	selectFlow: (flowId: string) => Promise<void>;
	selectBranch: (branchId: string) => void;
	selectNode: (nodeId: string | null) => Promise<void>;
	deriveFromNode: (node: ConversationFlowNode) => Promise<void>;
	copyCurrentBranchToChat: () => Promise<void>;
	renameCurrentFlow: (title: string) => Promise<void>;
	renameFlowById: (flowId: string, title: string) => Promise<void>;
	archiveFlowById: (flowId: string) => Promise<void>;
	archiveCurrentFlow: () => Promise<void>;
	updateFlowOrder: (order: FlowTreeOrderUpdate) => Promise<void>;
};

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

function asSessionReference(branch: ConversationFlowBranch): SessionMetadata {
	return {
		id: branch.sessionId,
		title: "Flow branch",
		surface: "flow_branch",
		flow: { flowId: branch.flowId, branchId: branch.branchId },
		createdAt: branch.createdAt,
		updatedAt: branch.updatedAt,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function useHomeFlowController({
	enabled,
	defaultFlow,
	activeSessionId,
	activeSessionMetadata,
	composerMessage,
	isSessionLoading,
	isSending,
	onSessionSelect,
	onDraftChange,
	onSubmit,
	onBeginNewFlow,
	onOpenChat,
}: UseHomeFlowControllerParams): HomeFlowController {
	const { t } = useTranslation();
	const [flows, setFlows] = useState<ConversationFlowSummary[]>([]);
	const [flowOrder, setFlowOrder] = useState<FlowTreeOrder | null>(null);
	const [flowBranchSessionIdsByFlow, setFlowBranchSessionIdsByFlow] = useState<Record<string, string[]>>({});
	const [snapshot, setSnapshot] = useState<ConversationFlowSnapshot | null>(null);
	const [isNewFlowHome, setIsNewFlowHome] = useState<boolean>(false);
	const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
	const [selectedNodeDetail, setSelectedNodeDetail] = useState<FlowNodeDetail | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isMutating, setIsMutating] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const flowsRef = useRef<ConversationFlowSummary[]>(flows);
	const lastBranchByFlowRef = useRef<Map<string, string>>(new Map());
	const pendingRegenerationRef = useRef<{
		branchId: string;
		draftApplied: boolean;
		sessionId: string;
		text: string;
	} | null>(null);
	const pendingNewFlowSubmissionRef = useRef<{
		branchId: string;
		modeOverride?: ChatMode;
		sessionId: string;
		text: string;
	} | null>(null);
	const newFlowCreationInFlightRef = useRef<boolean>(false);
	const pendingFlowTitleRef = useRef<string | null>(null);
	const refreshTimerRef = useRef<number | null>(null);
	const refreshRef = useRef<() => Promise<void>>((): Promise<void> => Promise.resolve());
	const snapshotRef = useRef<ConversationFlowSnapshot | null>(snapshot);
	const flowOrderSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
	const flowOrderSaveRevisionRef = useRef<number>(0);
	const activeFlowSessionRef = useRef<NonNullable<SessionMetadata["flow"]> | null>(null);
	const onSessionSelectRef = useRef(onSessionSelect);
	const previousEnabledRef = useRef<boolean>(false);
	snapshotRef.current = snapshot;
	flowsRef.current = flows;
	const newFlowHomeRef = useRef<boolean>(isNewFlowHome);
	newFlowHomeRef.current = isNewFlowHome;
	activeFlowSessionRef.current =
		activeSessionMetadata?.surface === "flow_branch"
			? activeSessionMetadata.flow ?? null
			: null;
	onSessionSelectRef.current = onSessionSelect;

	const activateBranch = useCallback((branch: ConversationFlowBranch): void => {
		setSelectedBranchId(branch.branchId);
		lastBranchByFlowRef.current.set(branch.flowId, branch.branchId);
		onSessionSelectRef.current(asSessionReference(branch));
	}, []);

	const loadFlow = useCallback(async (flowId: string, activate: boolean = true): Promise<void> => {
		setIsLoading(true);
		setError(null);
		try {
			const next: ConversationFlowSnapshot = await fetchFlow(flowId);
			setSnapshot((current): ConversationFlowSnapshot => {
				if (current?.flow.flowId === flowId && current.flow.revision > next.flow.revision) return current;
				return next;
			});
			if (activate) {
				const remembered: string | undefined = lastBranchByFlowRef.current.get(flowId);
				const branch: ConversationFlowBranch | undefined = next.branches.find(
					(candidate): boolean => candidate.branchId === remembered,
				) ?? next.branches.find((candidate): boolean => candidate.branchId === next.flow.rootBranchId);
				if (branch !== undefined) activateBranch(branch);
			}
		} catch (loadError: unknown) {
			setError(errorMessage(loadError));
		} finally {
			setIsLoading(false);
		}
	}, [activateBranch]);
	const beginNewFlowHome = useCallback((): void => {
		if (newFlowHomeRef.current) return;
		onBeginNewFlow();
		pendingFlowTitleRef.current = t("flow.defaultTitle", { count: flowsRef.current.length + 1 });
		pendingNewFlowSubmissionRef.current = null;
		setError(null);
		setSnapshot(null);
		snapshotRef.current = null;
		setSelectedBranchId(null);
		setSelectedNodeDetail(null);
		setIsNewFlowHome(true);
		newFlowHomeRef.current = true;
	}, [onBeginNewFlow, t]);

	const refresh = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const result = await fetchFlows();
			setFlows(result.flows);
			if (result.order !== undefined) setFlowOrder(result.order);
			if (newFlowHomeRef.current) return;
			const currentFlowId: string | undefined = snapshotRef.current?.flow.flowId;
			const currentFlowIsAvailable: boolean = currentFlowId !== undefined &&
				result.flows.some((flow): boolean => flow.flowId === currentFlowId);
			if (currentFlowIsAvailable && currentFlowId !== undefined) {
				await loadFlow(currentFlowId, false);
			} else if (enabled && result.flows[0] !== undefined) {
				await loadFlow(result.flows[0].flowId, true);
			} else if (enabled && result.flows.length === 0) {
				beginNewFlowHome();
			}
		} catch (refreshError: unknown) {
			setError(errorMessage(refreshError));
		} finally {
			setIsLoading(false);
		}
	}, [beginNewFlowHome, enabled, loadFlow]);
	refreshRef.current = refresh;

	useEffect((): void => {
		const enteringFlow: boolean = enabled && !previousEnabledRef.current;
		previousEnabledRef.current = enabled;
		if (!enteringFlow) return;
		if (activeFlowSessionRef.current !== null || newFlowHomeRef.current) return;
		const current = snapshotRef.current;
		const selected = current?.branches.find((branch): boolean => branch.branchId === selectedBranchId);
		if (selected !== undefined) {
			activateBranch(selected);
		}
		void refresh();
	}, [activateBranch, enabled, refresh, selectedBranchId]);

	useEffect((): (() => void) | void => {
		if (!enabled || newFlowHomeRef.current || activeFlowSessionRef.current === null) return;
		const activeFlowSession = activeFlowSessionRef.current;
		if (activeFlowSession === null) return;
		const { flowId, branchId } = activeFlowSession;
		lastBranchByFlowRef.current.set(flowId, branchId);
		const current = snapshotRef.current;
		if (current?.flow.flowId === flowId) {
			setSelectedBranchId(branchId);
			return;
		}

		let cancelled: boolean = false;
		void loadFlow(flowId, false).then((): void => {
			if (
				cancelled ||
				!enabled ||
				activeFlowSessionRef.current?.flowId !== flowId ||
				activeFlowSessionRef.current?.branchId !== branchId
			) {
				return;
			}
			setSelectedBranchId(branchId);
		});
		return (): void => {
			cancelled = true;
		};
	}, [activeSessionMetadata?.flow?.branchId, activeSessionMetadata?.flow?.flowId, enabled, loadFlow]);

	useEffect((): (() => void) => {
		let unsubscribe: (() => void) | undefined;
		void onBackendEvent((event): void => {
			const current: ConversationFlowSnapshot | null = snapshotRef.current;
			if (current === null) return;
			const data = typeof event.data === "object" && event.data !== null
				? event.data as Record<string, unknown>
				: {};
			const selectedSessionIds: Set<string> = new Set(current.branches.map((branch): string => branch.sessionId));
			if (data.flowId !== current.flow.flowId && (event.sessionId === undefined || !selectedSessionIds.has(event.sessionId))) return;
			if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
			refreshTimerRef.current = window.setTimeout((): void => {
				refreshTimerRef.current = null;
				void refreshRef.current();
			}, event.event === "agent.message.delta" ? 180 : 20);
		}).then((dispose): void => { unsubscribe = dispose; });
		const offReconnect = onBackendReconnected((): void => {
			if (enabled) void refreshRef.current();
		});
		return (): void => {
			unsubscribe?.();
			offReconnect();
			if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
		};
	}, [enabled]);

	useEffect((): void => {
		if (snapshot === null) return;
		const flowId: string = snapshot.flow.flowId;
		const sessionIds: string[] = snapshot.branches.map((branch): string => branch.sessionId);
		setFlowBranchSessionIdsByFlow((current): Record<string, string[]> => {
			const previous: string[] | undefined = current[flowId];
			if (
				previous !== undefined &&
				previous.length === sessionIds.length &&
				previous.every((sessionId, index): boolean => sessionId === sessionIds[index])
			) {
				return current;
			}
			return { ...current, [flowId]: sessionIds };
		});
	}, [snapshot]);

	useEffect((): void => {
		const pending = pendingRegenerationRef.current;
		if (
			pending === null ||
			isSessionLoading ||
			isSending ||
			activeSessionId !== pending.sessionId ||
			activeSessionMetadata?.flow?.branchId !== pending.branchId
		) return;
		if (!pending.draftApplied) {
			pending.draftApplied = true;
			onDraftChange(pending.text);
			return;
		}
		if (composerMessage !== pending.text) return;
		pendingRegenerationRef.current = null;
		onSubmit(pending.text);
	}, [activeSessionId, activeSessionMetadata?.flow?.branchId, composerMessage, isSending, isSessionLoading, onDraftChange, onSubmit]);

	const createNewFlow = useCallback(async (): Promise<void> => {
		if (newFlowHomeRef.current || newFlowCreationInFlightRef.current) return;
		beginNewFlowHome();
	}, [beginNewFlowHome]);

	const submitNewFlowMessage = useCallback(async (message: string, modeOverride?: ChatMode): Promise<void> => {
		const text: string = message.trim();
		if (!newFlowHomeRef.current || text.length === 0 || newFlowCreationInFlightRef.current) return;
		newFlowCreationInFlightRef.current = true;
		setIsMutating(true);
		setError(null);
		try {
			const title: string = pendingFlowTitleRef.current ?? t("flow.defaultTitle", { count: flows.length + 1 });
			const next = await createFlow({
				...defaultFlow,
				...(modeOverride === undefined ? {} : { chatMode: modeOverride }),
				title,
			});
			const root = next.branches.find((branch): boolean => branch.branchId === next.flow.rootBranchId);
			if (root === undefined) throw new Error("Flow did not return a root branch.");
			pendingNewFlowSubmissionRef.current = {
				branchId: root.branchId,
				modeOverride,
				sessionId: root.sessionId,
				text,
			};
			setSnapshot(next);
			setIsNewFlowHome(false);
			newFlowHomeRef.current = false;
			activateBranch(root);
			const result = await fetchFlows();
			setFlows(result.flows);
			if (result.order !== undefined) setFlowOrder(result.order);
		} catch (mutationError: unknown) {
			pendingNewFlowSubmissionRef.current = null;
			setError(errorMessage(mutationError));
			onDraftChange(text);
		} finally {
			newFlowCreationInFlightRef.current = false;
			setIsMutating(false);
		}
	}, [activateBranch, defaultFlow, flows.length, onDraftChange, t]);

	const updateFlowOrder = useCallback(async (nextOrder: FlowTreeOrderUpdate): Promise<void> => {
		const revision: number = flowOrderSaveRevisionRef.current + 1;
		flowOrderSaveRevisionRef.current = revision;
		const pinnedFlowIds: ReadonlySet<string> = new Set(nextOrder.pinnedFlowIds);
		setFlowOrder((current): FlowTreeOrder => ({
			schemaVersion: 1,
			...nextOrder,
			updatedAt: current?.updatedAt ?? new Date(0).toISOString(),
		}));
		setFlows((current): ConversationFlowSummary[] => current.map((flow): ConversationFlowSummary => ({
			...flow,
			pinned: pinnedFlowIds.has(flow.flowId),
		})));
		const save = async (): Promise<void> => {
			try {
				const result = await persistFlowTreeOrder(nextOrder);
				if (revision !== flowOrderSaveRevisionRef.current) return;
				setFlowOrder(result.order);
				if (result.flows.length === 0) return;
				setFlows((current): ConversationFlowSummary[] => current.map((flow): ConversationFlowSummary => {
					const updated = result.flows.find((candidate): boolean => candidate.flowId === flow.flowId);
					return updated === undefined ? flow : { ...flow, ...updated };
				}));
			} catch (orderError: unknown) {
				if (revision !== flowOrderSaveRevisionRef.current) return;
				setError(errorMessage(orderError));
				await refresh();
			}
		};
		const queuedSave: Promise<void> = flowOrderSaveQueueRef.current.then(save, save);
		flowOrderSaveQueueRef.current = queuedSave.catch((): void => undefined);
		await queuedSave;
	}, [refresh]);

	useEffect((): void => {
		const pending = pendingNewFlowSubmissionRef.current;
		if (
			pending === null ||
			isMutating ||
			isSessionLoading ||
			isSending ||
			activeSessionId !== pending.sessionId ||
			activeSessionMetadata?.flow?.branchId !== pending.branchId
		) return;
		pendingNewFlowSubmissionRef.current = null;
		onSubmit(pending.text, pending.modeOverride);
	}, [activeSessionId, activeSessionMetadata?.flow?.branchId, isMutating, isSending, isSessionLoading, onSubmit]);

	const createFromChat = useCallback(async (session: SessionMetadata): Promise<boolean> => {
		newFlowHomeRef.current = false;
		setIsNewFlowHome(false);
		setIsMutating(true);
		setError(null);
		try {
			const next = await createFlowFromSession({ sourceSessionId: session.id, title: session.title });
			setSnapshot(next);
			await refresh();
			const root = next.branches.find((branch): boolean => branch.branchId === next.flow.rootBranchId);
			if (root !== undefined) activateBranch(root);
			return true;
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
			return false;
		} finally {
			setIsMutating(false);
		}
	}, [activateBranch, refresh]);

	const selectFlow = useCallback(async (flowId: string): Promise<void> => {
		newFlowHomeRef.current = false;
		setIsNewFlowHome(false);
		pendingNewFlowSubmissionRef.current = null;
		await loadFlow(flowId, true);
	}, [loadFlow]);

	const selectBranch = useCallback((branchId: string): void => {
		const branch = snapshotRef.current?.branches.find((candidate): boolean => candidate.branchId === branchId);
		if (branch !== undefined) activateBranch(branch);
	}, [activateBranch]);

	const selectNode = useCallback(async (nodeId: string | null): Promise<void> => {
		if (nodeId === null || snapshotRef.current === null) {
			setSelectedNodeDetail(null);
			return;
		}
		try {
			const detail = await fetchFlowNode(snapshotRef.current.flow.flowId, nodeId);
			setSelectedNodeDetail(detail as FlowNodeDetail);
		} catch (detailError: unknown) {
			setError(errorMessage(detailError));
		}
	}, []);

	const deriveFromNode = useCallback(async (node: ConversationFlowNode): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		setIsMutating(true);
		setError(null);
		try {
			const result = await createFlowBranch({
				flowId: current.flow.flowId,
				parentBranchId: node.branchId,
				sourceNodeId: node.nodeId,
				title: current.flow.title,
			});
			setSnapshot(result.flow);
			if (result.seedAction === "regenerate") {
				pendingRegenerationRef.current = {
					branchId: result.branch.branchId,
					draftApplied: false,
					sessionId: result.branch.sessionId,
					text: result.draft.text,
				};
			} else {
				onDraftChange("");
			}
			activateBranch(result.branch);
			if (result.seedAction === "compose") {
				window.setTimeout((): void => {
					const input = document.querySelector<HTMLTextAreaElement>(
						'[data-studio-composer="true"] textarea',
					);
					input?.focus({ preventScroll: true });
				}, 0);
			}
			await refresh();
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
		} finally {
			setIsMutating(false);
		}
	}, [activateBranch, onDraftChange, refresh]);

	const copyCurrentBranchToChat = useCallback(async (): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null || selectedBranchId === null) return;
		setIsMutating(true);
		setError(null);
		try {
			const result = await copyFlowBranchToChat({
				flowId: current.flow.flowId,
				branchId: selectedBranchId,
				title: current.flow.title,
			});
			onOpenChat(result.metadata);
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
		} finally {
			setIsMutating(false);
		}
	}, [onOpenChat, selectedBranchId]);

	const renameFlowById = useCallback(async (flowId: string, title: string): Promise<void> => {
		const snapshot = snapshotRef.current;
		const current = snapshot?.flow.flowId === flowId ? snapshot.flow : null;
		const target = current ?? flows.find((flow): boolean => flow.flowId === flowId);
		if (target === undefined || target === null) throw new Error(t("flow.errors.notFound"));
		setIsMutating(true);
		setError(null);
		try {
			await renameFlow(target.flowId, title, target.revision);
			await refresh();
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
			throw mutationError;
		} finally {
			setIsMutating(false);
		}
	}, [flows, refresh, t]);

	const renameCurrentFlow = useCallback(async (title: string): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		setIsMutating(true);
		try {
			await renameFlow(current.flow.flowId, title, current.flow.revision);
			await refresh();
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
		} finally {
			setIsMutating(false);
		}
	}, [refresh]);

	const archiveFlowById = useCallback(async (flowId: string): Promise<void> => {
		const current = snapshotRef.current;
		const target = current?.flow.flowId === flowId
			? current.flow
			: flows.find((flow): boolean => flow.flowId === flowId);
		if (target === undefined) return;
		setIsMutating(true);
		setError(null);
		try {
			await archiveFlow(target.flowId, target.revision);
			if (current?.flow.flowId === flowId) {
				setSnapshot(null);
				setSelectedBranchId(null);
			}
			await refresh();
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
		} finally {
			setIsMutating(false);
		}
	}, [flows, refresh]);

	const archiveCurrentFlow = useCallback(async (): Promise<void> => {
		const current = snapshotRef.current;
		if (current === null) return;
		await archiveFlowById(current.flow.flowId);
	}, [archiveFlowById]);

	return useMemo((): HomeFlowController => ({
		flows,
		flowOrder,
		flowBranchSessionIdsByFlow,
		snapshot,
		isNewFlowHome,
		selectedBranchId,
		selectedNodeDetail,
		isLoading,
		isMutating,
		error,
		refresh,
		createNewFlow,
		submitNewFlowMessage,
		createFromChat,
		selectFlow,
		selectBranch,
		selectNode,
		deriveFromNode,
		copyCurrentBranchToChat,
		renameCurrentFlow,
		renameFlowById,
		archiveFlowById,
		archiveCurrentFlow,
		updateFlowOrder,
	}), [archiveCurrentFlow, archiveFlowById, copyCurrentBranchToChat, createFromChat, createNewFlow, deriveFromNode, error, flowBranchSessionIdsByFlow, flowOrder, flows, isLoading, isMutating, isNewFlowHome, refresh, renameCurrentFlow, renameFlowById, selectBranch, selectFlow, selectNode, selectedBranchId, selectedNodeDetail, snapshot, submitNewFlowMessage, updateFlowOrder]);
}
