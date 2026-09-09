import { useSyncExternalStore } from "react";
import { isSubagentScopedEvent } from "@/domain/run/backend-event-state";
import {
	applyBackendEventToTimeline,
	type TimelineEventApplyOptions,
} from "@/domain/workbench/workbench-state";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import type { TimelineBlock } from "@/platform/rpc/types";

type StoreSnapshot = {
	version: number;
	blocksByKey: Readonly<Record<string, readonly TimelineBlock[]>>;
};

const EMPTY_BLOCKS: readonly TimelineBlock[] = [];
const INCLUDE_SUBAGENT: TimelineEventApplyOptions = { includeSubagent: true };
const MAX_REMEMBERED_EVENT_KEYS: number = 8192;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function conversationKey(sessionId: string, graphId: string, nodeId: string): string {
	return `${sessionId}\u0000${graphId}\u0000${nodeId}`;
}

function eventIdentity(event: BackendEvent): string {
	if (typeof event.eventId === "string" && event.eventId.length > 0) {
		return `event:${event.eventId}`;
	}
	if (typeof event.sessionId === "string" && typeof event.sequence === "number") {
		return `sequence:${event.sessionId}:${event.sequence}`;
	}
	return `${event.event}:${event.requestId ?? event.id ?? ""}:${event.createdAt ?? ""}`;
}

function getConversationIdentity(event: BackendEvent): { sessionId: string; graphId: string; nodeId: string } | null {
	if (!isSubagentScopedEvent(event) || event.event.startsWith("agent.subgraph.")) return null;
	const data: Record<string, unknown> = isRecord(event.data) ? event.data : {};
	const sessionId: string = stringValue(event.sessionId) || stringValue(data.sessionId);
	const graphId: string = stringValue(data.graphId) || stringValue(data.subagentGraphId);
	const nodeId: string = stringValue(data.nodeId) || stringValue(data.subagentNodeId);
	return sessionId.length > 0 && graphId.length > 0 && nodeId.length > 0
		? { sessionId, graphId, nodeId }
		: null;
}

class SubagentConversationStore {
	private readonly listeners: Set<() => void> = new Set();
	private readonly rememberedEventKeys: Set<string> = new Set();
	private snapshot: StoreSnapshot = { version: 0, blocksByKey: {} };

	getSnapshot = (): StoreSnapshot => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return (): void => {
			this.listeners.delete(listener);
		};
	};

	getBlocks(sessionId: string | null, graphId: string | null, nodeId: string | null): readonly TimelineBlock[] {
		if (sessionId === null || graphId === null || nodeId === null) return EMPTY_BLOCKS;
		return this.snapshot.blocksByKey[conversationKey(sessionId, graphId, nodeId)] ?? EMPTY_BLOCKS;
	}

	applyBackendEvent(event: BackendEvent): void {
		const identity = getConversationIdentity(event);
		if (identity === null) return;
		const eventKey: string = eventIdentity(event);
		if (this.rememberedEventKeys.has(eventKey)) return;
		this.rememberedEventKeys.add(eventKey);
		if (this.rememberedEventKeys.size > MAX_REMEMBERED_EVENT_KEYS) {
			const oldest: string | undefined = this.rememberedEventKeys.values().next().value;
			if (oldest !== undefined) this.rememberedEventKeys.delete(oldest);
		}

		const key: string = conversationKey(identity.sessionId, identity.graphId, identity.nodeId);
		const current: readonly TimelineBlock[] = this.snapshot.blocksByKey[key] ?? EMPTY_BLOCKS;
		const next: TimelineBlock[] = applyBackendEventToTimeline([...current], event, INCLUDE_SUBAGENT);
		if (next.length === current.length && next.every((block: TimelineBlock, index: number): boolean => block === current[index])) return;
		this.publish({
			...this.snapshot.blocksByKey,
			[key]: next,
		});
	}

	replaceBlocks(sessionId: string, graphId: string, nodeId: string, blocks: readonly TimelineBlock[]): void {
		const key: string = conversationKey(sessionId, graphId, nodeId);
		const current: readonly TimelineBlock[] = this.snapshot.blocksByKey[key] ?? EMPTY_BLOCKS;
		if (blocks.length === 0) return;
		if (current.length === 0) {
			this.publish({ ...this.snapshot.blocksByKey, [key]: [...blocks] });
			return;
		}

		// 历史加载和实时事件可能交错到达：保留历史顺序，同时用实时块覆盖同 id 的旧快照。
		const liveById: Map<string, TimelineBlock> = new Map(current.map((block: TimelineBlock): [string, TimelineBlock] => [block.id, block]));
		const merged: TimelineBlock[] = blocks.map((block: TimelineBlock): TimelineBlock => liveById.get(block.id) ?? block);
		const historicalIds: Set<string> = new Set(blocks.map((block: TimelineBlock): string => block.id));
		for (const block of current) {
			if (!historicalIds.has(block.id)) merged.push(block);
		}
		this.publish({ ...this.snapshot.blocksByKey, [key]: merged });
	}

	private publish(blocksByKey: Readonly<Record<string, readonly TimelineBlock[]>>): void {
		this.snapshot = { version: this.snapshot.version + 1, blocksByKey };
		for (const listener of this.listeners) listener();
	}
}

export const subagentConversationStore = new SubagentConversationStore();

export function useSubagentConversationBlocks(
	sessionId: string | null,
	graphId: string | null,
	nodeId: string | null,
): readonly TimelineBlock[] {
	const snapshot: StoreSnapshot = useSyncExternalStore(
		subagentConversationStore.subscribe,
		subagentConversationStore.getSnapshot,
		subagentConversationStore.getSnapshot,
	);
	if (sessionId === null || graphId === null || nodeId === null) return EMPTY_BLOCKS;
	return snapshot.blocksByKey[conversationKey(sessionId, graphId, nodeId)] ?? EMPTY_BLOCKS;
}
