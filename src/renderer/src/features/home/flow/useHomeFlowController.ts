import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
} from "@/platform/rpc/flow-api";
import { onBackendEvent, onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import type {
	ConversationFlowBranch,
	ConversationFlowNode,
	ConversationFlowSnapshot,
	ConversationFlowSummary,
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
	snapshot: ConversationFlowSnapshot | null;
	selectedBranchId: string | null;
	selectedNodeDetail: FlowNodeDetail | null;
	isLoading: boolean;
	isMutating: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	createNewFlow: () => Promise<void>;
	createFromChat: (session: SessionMetadata) => Promise<boolean>;
	selectFlow: (flowId: string) => Promise<void>;
	selectBranch: (branchId: string) => void;
	selectNode: (nodeId: string | null) => Promise<void>;
	deriveFromNode: (node: ConversationFlowNode) => Promise<void>;
	copyCurrentBranchToChat: () => Promise<void>;
	renameCurrentFlow: (title: string) => Promise<void>;
	archiveFlowById: (flowId: string) => Promise<void>;
	archiveCurrentFlow: () => Promise<void>;
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
	onSubmit: (message: string) => void;
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
	onOpenChat,
}: UseHomeFlowControllerParams): HomeFlowController {
	const { t } = useTranslation();
	const [flows, setFlows] = useState<ConversationFlowSummary[]>([]);
	const [snapshot, setSnapshot] = useState<ConversationFlowSnapshot | null>(null);
	const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
	const [selectedNodeDetail, setSelectedNodeDetail] = useState<FlowNodeDetail | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isMutating, setIsMutating] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const lastBranchByFlowRef = useRef<Map<string, string>>(new Map());
	const pendingRegenerationRef = useRef<{
		branchId: string;
		draftApplied: boolean;
		sessionId: string;
		text: string;
	} | null>(null);
	const refreshTimerRef = useRef<number | null>(null);
	const snapshotRef = useRef<ConversationFlowSnapshot | null>(snapshot);
	const onSessionSelectRef = useRef(onSessionSelect);
	const previousEnabledRef = useRef<boolean>(false);
	snapshotRef.current = snapshot;
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

	const refresh = useCallback(async (): Promise<void> => {
		try {
			const result = await fetchFlows();
			setFlows(result.flows);
			const currentFlowId: string | undefined = snapshotRef.current?.flow.flowId;
			if (currentFlowId !== undefined) {
				await loadFlow(currentFlowId, false);
			} else if (enabled && result.flows[0] !== undefined) {
				await loadFlow(result.flows[0].flowId, true);
			}
		} catch (refreshError: unknown) {
			setError(errorMessage(refreshError));
		}
	}, [enabled, loadFlow]);

	useEffect((): void => {
		const enteringFlow: boolean = enabled && !previousEnabledRef.current;
		previousEnabledRef.current = enabled;
		if (!enteringFlow) return;
		const current = snapshotRef.current;
		const selected = current?.branches.find((branch): boolean => branch.branchId === selectedBranchId);
		if (selected !== undefined) {
			activateBranch(selected);
		}
		void refresh();
	}, [activateBranch, enabled, refresh, selectedBranchId]);

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
				void refresh();
			}, event.event === "agent.message.delta" ? 180 : 20);
		}).then((dispose): void => { unsubscribe = dispose; });
		const offReconnect = onBackendReconnected((): void => {
			if (enabled) void refresh();
		});
		return (): void => {
			unsubscribe?.();
			offReconnect();
			if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
		};
	}, [enabled, refresh]);

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
		setIsMutating(true);
		setError(null);
		try {
			const title: string = t("flow.defaultTitle", { count: flows.length + 1 });
			const next = await createFlow({ ...defaultFlow, title });
			setSnapshot(next);
			await refresh();
			const root = next.branches.find((branch): boolean => branch.branchId === next.flow.rootBranchId);
			if (root !== undefined) activateBranch(root);
		} catch (mutationError: unknown) {
			setError(errorMessage(mutationError));
		} finally {
			setIsMutating(false);
		}
	}, [activateBranch, defaultFlow, flows.length, refresh, t]);

	const createFromChat = useCallback(async (session: SessionMetadata): Promise<boolean> => {
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
		snapshot,
		selectedBranchId,
		selectedNodeDetail,
		isLoading,
		isMutating,
		error,
		refresh,
		createNewFlow,
		createFromChat,
		selectFlow,
		selectBranch,
		selectNode,
		deriveFromNode,
		copyCurrentBranchToChat,
		renameCurrentFlow,
		archiveFlowById,
		archiveCurrentFlow,
	}), [archiveCurrentFlow, archiveFlowById, copyCurrentBranchToChat, createFromChat, createNewFlow, deriveFromNode, error, flows, isLoading, isMutating, refresh, renameCurrentFlow, selectBranch, selectFlow, selectNode, selectedBranchId, selectedNodeDetail, snapshot]);
}
