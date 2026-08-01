import { describe, expect, it } from "vitest";
import type { SessionTimelineNavigationEntry } from "@/api/types";
import { resolveActiveBlockOffset, resolveActiveTimelineEntryId, resolveAdjacentTimelineEntry } from "@/features/chat/conversation-navigation";

const entries: SessionTimelineNavigationEntry[] = [
	{ entryId: "turn-1", requestId: "request-1", blockOffset: 0, sentAtUtc: "2026-08-02T00:00:00.000Z", preview: "one" },
	{ entryId: "turn-2", requestId: "request-2", blockOffset: 4, sentAtUtc: "2026-08-02T00:01:00.000Z", preview: "two" },
	{ entryId: "turn-3", requestId: "request-3", blockOffset: 9, sentAtUtc: "2026-08-02T00:02:00.000Z", preview: "three" }
];

describe("conversation navigation", () => {
	it("uses the actual mounted row nearest the viewport activation line", () => {
		expect(resolveActiveBlockOffset([
			{ blockOffset: 20, top: -100 },
			{ blockOffset: 21, top: 32 },
			{ blockOffset: 22, top: 160 }
		], 88)).toBe(21);
		expect(resolveActiveBlockOffset([{ blockOffset: 20, top: 120 }], 88)).toBe(20);
		expect(resolveActiveBlockOffset([], 88)).toBeNull();
	});

	it("uses the final mounted block as the active turn at the bottom of a short conversation", () => {
		expect(resolveActiveBlockOffset([
			{ blockOffset: 0, top: 40 },
			{ blockOffset: 1, top: 140 },
			{ blockOffset: 2, top: 240 }
		], 88, true)).toBe(2);
	});

	it("maps an assistant block to the latest preceding user turn", () => {
		expect(resolveActiveTimelineEntryId(entries, 7)).toBe("turn-2");
		expect(resolveActiveTimelineEntryId(entries, 9)).toBe("turn-3");
	});

	it("does not invent an active turn before the first indexed user block", () => {
		expect(resolveActiveTimelineEntryId(entries, null)).toBeNull();
		expect(resolveActiveTimelineEntryId(entries.slice(1), 2)).toBeNull();
	});

	it("moves exactly one turn and does nothing when the active turn is unknown", () => {
		expect(resolveAdjacentTimelineEntry(entries, "turn-2", "previous")?.entryId).toBe("turn-1");
		expect(resolveAdjacentTimelineEntry(entries, "turn-2", "next")?.entryId).toBe("turn-3");
		expect(resolveAdjacentTimelineEntry(entries, null, "previous")).toBeNull();
		expect(resolveAdjacentTimelineEntry(entries, "missing", "next")).toBeNull();
	});
});
