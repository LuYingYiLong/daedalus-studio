import { describe, expect, it } from "vitest";
import {
	getDistanceFromBottomByMetrics,
	isNearBottomByMetrics,
	shouldAutoFollowAppend,
	shouldImmediatelyFollowBlockAppend,
	shouldAutoFollowViewport
} from "@/domain/conversation/message-list-virtual";

describe("message-list-virtual", () => {
	it("detects near-bottom state for initial and streaming scroll behavior", () => {
		expect(getDistanceFromBottomByMetrics(5000, 4300, 600)).toBe(100);
		expect(isNearBottomByMetrics(5000, 4300, 600, 320)).toBe(true);
		expect(isNearBottomByMetrics(5000, 1000, 600, 320)).toBe(false);
		expect(isNearBottomByMetrics(420, 0, 600, 16)).toBe(true);
		expect(isNearBottomByMetrics(616, 0, 600, 16)).toBe(true);
		expect(isNearBottomByMetrics(617, 0, 600, 16)).toBe(false);
	});

	it("uses a tighter threshold to leave and resume bottom following", () => {
		expect(shouldAutoFollowViewport(true, 64, 72, 16)).toBe(true);
		expect(shouldAutoFollowViewport(true, 80, 72, 16)).toBe(false);
		expect(shouldAutoFollowViewport(false, 24, 72, 16)).toBe(false);
		expect(shouldAutoFollowViewport(false, 8, 72, 16)).toBe(true);
	});

	it("follows new content only when user remains near bottom", () => {
		expect(shouldAutoFollowAppend(true, false, true)).toBe(true);
		expect(shouldAutoFollowAppend(true, true, false)).toBe(true);
		expect(shouldAutoFollowAppend(false, true, true)).toBe(false);
	});

	it("keeps the composer send anchored before measuring the appended block", () => {
		expect(shouldImmediatelyFollowBlockAppend(true, 4, 5)).toBe(true);
		expect(shouldImmediatelyFollowBlockAppend(false, 4, 5)).toBe(false);
		expect(shouldImmediatelyFollowBlockAppend(true, 5, 5)).toBe(false);
		expect(shouldImmediatelyFollowBlockAppend(true, 5, 4)).toBe(false);
	});

});
