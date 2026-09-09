import { useSyncExternalStore } from "react";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import type {
	SubagentApprovalState,
	SubagentGraph,
	SubagentGraphSnapshot,
	SubagentMergeState,
	SubagentNode,
	SubagentResult,
} from "@/platform/rpc/types";

export type SubagentGraphView = {
	snapshot: SubagentGraphSnapshot;
	approvals: Record<string, SubagentApprovalState>;
	merges: Record<string, SubagentMergeState>;
};

type StoreSnapshot = {
	version: number;
	graphsBySession: Readonly<Record<string, readonly SubagentGraphView[]>>;
};

type RecordValue = Record<string, unknown>;
const EMPTY_GRAPHS: readonly SubagentGraphView[] = [];

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function isGraph(value: unknown): value is SubagentGraph {
	return isRecord(value)
		&& stringValue(value.graphId).length > 0
		&& stringValue(value.sessionId).length > 0
		&& stringValue(value.rootRunId).length > 0
		&& typeof value.revision === "number"
		&& stringValue(value.createdAt).length > 0
		&& stringValue(value.updatedAt).length > 0;
}

function isNode(value: unknown): value is SubagentNode {
	return isRecord(value)
		&& stringValue(value.nodeId).length > 0
		&& stringValue(value.graphId).length > 0
		&& stringValue(value.runId).length > 0
		&& stringValue(value.role).length > 0
		&& stringValue(value.status).length > 0;
}

function isResult(value: unknown): value is SubagentResult {
	return isRecord(value)
		&& stringValue(value.status).length > 0
		&& stringValue(value.summary).length > 0
		&& Array.isArray(value.findings)
		&& Array.isArray(value.changedFiles)
		&& Array.isArray(value.tests)
		&& Array.isArray(value.artifacts)
		&& typeof value.needsParentDecision === "boolean";
}

function eventRevision(data: RecordValue): number {
	return typeof data.revision === "number" && Number.isFinite(data.revision) ? data.revision : 0;
}

function cloneView(view: SubagentGraphView): SubagentGraphView {
	return {
		snapshot: {
			graph: { ...view.snapshot.graph },
			nodes: view.snapshot.nodes.map((node: SubagentNode): SubagentNode => ({ ...node }))
		},
		approvals: { ...view.approvals },
		merges: { ...view.merges }
	};
}

function upsertNode(nodes: SubagentNode[], node: SubagentNode): SubagentNode[] {
	const index: number = nodes.findIndex((candidate: SubagentNode): boolean => candidate.nodeId === node.nodeId);
	if (index < 0) return [...nodes, node];
	const next: SubagentNode[] = [...nodes];
	next[index] = node;
	return next;
}

function createView(snapshot: SubagentGraphSnapshot): SubagentGraphView {
	return {
		snapshot: {
			graph: { ...snapshot.graph },
			nodes: snapshot.nodes.map((node: SubagentNode): SubagentNode => ({ ...node }))
		},
		approvals: {},
		merges: {}
	};
}

class SubagentGraphStore {
	private readonly sessions: Map<string, Map<string, SubagentGraphView>> = new Map();
	private readonly listeners: Set<() => void> = new Set();
	private snapshot: StoreSnapshot = { version: 0, graphsBySession: {} };

	getSnapshot = (): StoreSnapshot => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return (): void => { this.listeners.delete(listener); };
	};

	getGraphs(sessionId: string | null): readonly SubagentGraphView[] {
		return sessionId === null ? EMPTY_GRAPHS : this.snapshot.graphsBySession[sessionId] ?? EMPTY_GRAPHS;
	}

	replaceSession(sessionId: string, snapshots: readonly SubagentGraphSnapshot[]): void {
		for (const snapshot of snapshots) this.upsertSnapshot(sessionId, snapshot, true);
	}

	applyBackendEvent(event: BackendEvent): void {
		if (!event.event.startsWith("agent.subgraph.") || !isRecord(event.data)) return;
		const data: RecordValue = event.data;
		const graph: SubagentGraph | null = isGraph(data.graph) ? data.graph : null;
		const sessionId: string = stringValue(event.sessionId) || (graph?.sessionId ?? "");
		if (sessionId.length === 0) return;

		if (event.event === "agent.subgraph.created") {
			const nodes: SubagentNode[] = Array.isArray(data.nodes) ? data.nodes.filter(isNode) : [];
			if (graph !== null) this.upsertSnapshot(sessionId, { graph, nodes }, true);
			return;
		}
		if (event.event === "agent.subgraph.state") {
			if (graph !== null) this.upsertSnapshot(sessionId, { graph, nodes: [] }, false);
			return;
		}

		const graphId: string = stringValue(data.graphId);
		const nodeId: string = stringValue(data.nodeId);
		const view: SubagentGraphView | undefined = this.sessions.get(sessionId)?.get(graphId);
		if (graphId.length === 0 || nodeId.length === 0 || view === undefined || eventRevision(data) < view.snapshot.graph.revision) return;

		if (event.event === "agent.subgraph.node.state" && isNode(data.node)) {
			this.updateView(sessionId, graphId, (current: SubagentGraphView): SubagentGraphView => {
				const next: SubagentGraphView = cloneView(current);
				next.snapshot.graph.revision = Math.max(next.snapshot.graph.revision, eventRevision(data));
				next.snapshot.nodes = upsertNode(next.snapshot.nodes, data.node as SubagentNode);
				return next;
			});
			return;
		}

		if (event.event === "agent.subgraph.node.result" && isResult(data.result)) {
			const result: SubagentResult = data.result;
			this.updateView(sessionId, graphId, (current: SubagentGraphView): SubagentGraphView => {
				const next: SubagentGraphView = cloneView(current);
				const node: SubagentNode | undefined = next.snapshot.nodes.find((candidate: SubagentNode): boolean => candidate.nodeId === nodeId);
				if (node !== undefined) {
					node.result = result;
					if (node.status === "running" || node.status === "ready") node.status = result.status === "failed" ? "failed" : "completed";
				}
				next.snapshot.graph.revision = Math.max(next.snapshot.graph.revision, eventRevision(data));
				return next;
			});
			return;
		}

		if (event.event === "agent.subgraph.node.approval") {
			this.updateView(sessionId, graphId, (current: SubagentGraphView): SubagentGraphView => {
				const next: SubagentGraphView = cloneView(current);
				next.snapshot.graph.revision = Math.max(next.snapshot.graph.revision, eventRevision(data));
				next.approvals[nodeId] = {
					approvalId: stringValue(data.approvalId),
					status: data.status as SubagentApprovalState["status"],
					updatedAt: event.createdAt ?? next.snapshot.graph.updatedAt
				};
				return next;
			});
			return;
		}

		if (event.event === "agent.subgraph.merge.state") {
			this.updateView(sessionId, graphId, (current: SubagentGraphView): SubagentGraphView => {
				const next: SubagentGraphView = cloneView(current);
				next.snapshot.graph.revision = Math.max(next.snapshot.graph.revision, eventRevision(data));
				next.merges[nodeId] = {
					status: data.status as SubagentMergeState["status"],
					fingerprint: typeof data.fingerprint === "string" ? data.fingerprint : null,
					message: typeof data.message === "string" ? data.message : undefined,
					updatedAt: event.createdAt ?? next.snapshot.graph.updatedAt
				};
				return next;
			});
		}
	}

	private upsertSnapshot(sessionId: string, snapshot: SubagentGraphSnapshot, replaceNodes: boolean): void {
		const sessionGraphs: Map<string, SubagentGraphView> = this.sessions.get(sessionId) ?? new Map();
		const current: SubagentGraphView | undefined = sessionGraphs.get(snapshot.graph.graphId);
		if (current !== undefined && snapshot.graph.revision < current.snapshot.graph.revision) return;
		const next: SubagentGraphView = current === undefined
			? createView(snapshot)
			: {
				...cloneView(current),
				snapshot: {
					graph: { ...snapshot.graph },
					nodes: replaceNodes ? snapshot.nodes.map((node: SubagentNode): SubagentNode => ({ ...node })) : current.snapshot.nodes
				}
			};
		sessionGraphs.set(snapshot.graph.graphId, next);
		this.sessions.set(sessionId, sessionGraphs);
		this.publishSession(sessionId, sessionGraphs);
	}

	private updateView(sessionId: string, graphId: string, updater: (current: SubagentGraphView) => SubagentGraphView): void {
		const sessionGraphs: Map<string, SubagentGraphView> | undefined = this.sessions.get(sessionId);
		const current: SubagentGraphView | undefined = sessionGraphs?.get(graphId);
		if (sessionGraphs === undefined || current === undefined) return;
		sessionGraphs.set(graphId, updater(current));
		this.publishSession(sessionId, sessionGraphs);
	}

	private publishSession(sessionId: string, sessionGraphs: Map<string, SubagentGraphView>): void {
		const graphsBySession: Record<string, readonly SubagentGraphView[]> = { ...this.snapshot.graphsBySession };
		graphsBySession[sessionId] = [...sessionGraphs.values()].sort((left, right): number => right.snapshot.graph.updatedAt.localeCompare(left.snapshot.graph.updatedAt));
		this.snapshot = { version: this.snapshot.version + 1, graphsBySession };
		for (const listener of this.listeners) listener();
	}
}

export const subagentGraphStore = new SubagentGraphStore();

export function useSubagentGraphs(sessionId: string | null): readonly SubagentGraphView[] {
	const snapshot: StoreSnapshot = useSyncExternalStore(subagentGraphStore.subscribe, subagentGraphStore.getSnapshot, subagentGraphStore.getSnapshot);
	return sessionId === null ? EMPTY_GRAPHS : snapshot.graphsBySession[sessionId] ?? EMPTY_GRAPHS;
}
