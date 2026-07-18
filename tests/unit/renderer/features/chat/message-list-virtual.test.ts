import { describe, expect, it } from "vitest";
import {
	areVisibleRangesEqual,
	calculateVisibleRange,
	createPrefixHeights,
	isNearBottomByMetrics,
	shouldAutoFollowAppend
} from "@/features/chat/message-list-virtual";

describe("message-list-virtual", () => {
	it("detects near-bottom state for initial and streaming scroll behavior", () => {
		expect(isNearBottomByMetrics(5000, 4300, 600, 320)).toBe(true);
		expect(isNearBottomByMetrics(5000, 1000, 600, 320)).toBe(false);
	});

	it("follows new content only when user remains near bottom", () => {
		expect(shouldAutoFollowAppend(true, false, true)).toBe(true);
		expect(shouldAutoFollowAppend(true, true, false)).toBe(true);
		expect(shouldAutoFollowAppend(false, true, true)).toBe(false);
	});

	it("compares visible ranges before scheduling React updates", () => {
		expect(areVisibleRangesEqual({ startIndex: 1, endIndex: 12 }, { startIndex: 1, endIndex: 12 })).toBe(true);
		expect(areVisibleRangesEqual({ startIndex: 1, endIndex: 12 }, { startIndex: 2, endIndex: 12 })).toBe(false);
	});

	it("renders only a window plus overscan for 80 heavy turns", () => {
		const heights: number[] = Array.from({ length: 160 }, (): number => 220);
		const prefixHeights: number[] = createPrefixHeights(heights);
		const range = calculateVisibleRange(prefixHeights, 220 * 120, 900, heights.length, 8);

		expect(range.startIndex).toBeGreaterThanOrEqual(111);
		expect(range.endIndex - range.startIndex).toBeLessThanOrEqual(24);
	});
});
