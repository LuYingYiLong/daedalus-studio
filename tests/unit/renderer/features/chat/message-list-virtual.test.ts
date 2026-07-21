import { describe, expect, it } from "vitest";
import {
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

});
