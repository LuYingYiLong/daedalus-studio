import { describe, expect, it, vi } from "vitest";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import type { TimelineBlock } from "@/platform/rpc/types";
import { createTimelinePageStore } from "@/domain/workbench/timeline-page-store";
import { MAX_TIMELINE_WINDOW_BLOCKS, type TimelinePageState } from "@/domain/workbench/workbench-state";

function createUserBlock(id: string): TimelineBlock {
	return {
		id,
		type: "user",
		requestId: id,
		content: id,
		sentAtUtc: "2026-01-01T00:00:00.000Z"
	};
}

function createPage(blocks: TimelineBlock[], blockOffset: number = 0): TimelinePageState {
	return {
		sessionId: "session-a",
		blocks,
		blockCount: blockOffset + blocks.length,
		blockOffset,
		hasMoreBefore: blockOffset > 0,
		hasMoreAfter: false
	};
}

describe("TimelinePageStore", () => {
	it("publishes immutable replacements and skips identity updates", () => {
		const store = createTimelinePageStore();
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);
		const page = createPage([createUserBlock("user-a")]);

		store.replace(page);
		store.update((current): TimelinePageState => current);

		expect(store.getSnapshot()).toBe(page);
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("replaces only the streaming assistant block while preserving completed block references", () => {
		const userBlock: TimelineBlock = createUserBlock("user-a");
		const store = createTimelinePageStore(createPage([userBlock]));
		const delta: BackendEvent = {
			type: "event",
			id: "assistant-a",
			event: "agent.message.delta",
			data: { text: "hello" }
		};

		store.applyEvents([delta]);
		const firstAssistant: TimelineBlock | undefined = store.getSnapshot().blocks[1];
		store.applyEvents([{ ...delta, data: { text: " world" } }]);
		const nextSnapshot = store.getSnapshot();

		expect(nextSnapshot.blocks[0]).toBe(userBlock);
		expect(nextSnapshot.blocks[1]).not.toBe(firstAssistant);
		expect(nextSnapshot.blocks[1]?.type === "assistant" ? nextSnapshot.blocks[1].content : "").toBe("hello world");
	});

	it("ignores a replayed runtime event by eventId", () => {
		const store = createTimelinePageStore(createPage([]));
		const event: BackendEvent = {
			protocolVersion: 3,
			type: "event",
			eventId: "event-duplicate",
			event: "agent.message.delta",
			sessionId: "session-a",
			requestId: "request-a",
			runId: "run-a",
			sequence: 1,
			createdAt: "2026-07-29T00:00:00.000Z",
			data: { text: "hello" }
		};

		store.applyEvents([event]);
		store.applyEvents([event]);

		const assistant = store.getSnapshot().blocks[0];
		expect(assistant?.type).toBe("assistant");
		expect(assistant?.type === "assistant" ? assistant.content : "").toBe("hello");
	});

	it("merges pages and keeps at most the 400-block sliding window", () => {
		const initialBlocks: TimelineBlock[] = Array.from(
			{ length: MAX_TIMELINE_WINDOW_BLOCKS },
			(_, index: number): TimelineBlock => createUserBlock(`current-${index}`)
		);
		const store = createTimelinePageStore(createPage(initialBlocks));
		const nextBlocks: TimelineBlock[] = Array.from(
			{ length: 80 },
			(_, index: number): TimelineBlock => createUserBlock(`next-${index}`)
		);

		store.mergeAfter({
			...createPage(nextBlocks, MAX_TIMELINE_WINDOW_BLOCKS),
			blockCount: MAX_TIMELINE_WINDOW_BLOCKS + nextBlocks.length,
			hasMoreBefore: true
		});

		expect(MAX_TIMELINE_WINDOW_BLOCKS).toBe(400);
		expect(store.getSnapshot().blocks).toHaveLength(400);
		expect(store.getSnapshot().blockOffset).toBe(80);
		expect(store.getSnapshot().blocks[0]?.id).toBe("current-80");
		expect(store.getSnapshot().blocks.at(-1)?.id).toBe("next-79");
	});

	it("reset creates a fresh empty snapshot", () => {
		const store = createTimelinePageStore(createPage([createUserBlock("user-a")]));
		const previous = store.getSnapshot();
		store.reset();

		expect(store.getSnapshot()).not.toBe(previous);
		expect(store.getSnapshot()).toMatchObject({ sessionId: null, blockCount: 0, blocks: [] });
	});
});
