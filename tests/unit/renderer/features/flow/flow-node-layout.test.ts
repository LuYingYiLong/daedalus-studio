import { describe, expect, it } from "vitest";
import { avoidFlowNodeOverlap, FLOW_NODE_CLEARANCE, type FlowLayoutRect } from "@/domain/flow/flow-node-layout";

const node = (nodeId: string, x: number, y: number, width = 100, height = 100): FlowLayoutRect => ({ nodeId, x, y, width, height });
const intersect = (a: FlowLayoutRect, b: FlowLayoutRect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("Flow node avoidance", () => {
	it("keeps the anchor fixed, propagates collisions outwards, and leaves remote nodes alone", () => {
		const root = node("root", 0, 0, 160);
		const nodes = [root, node("right", 120, 0), node("next", 250, 0), node("left", -50, 0), node("top", 0, -50), node("bottom", 0, 50), node("far", 1000, 1000)];
		const moves = avoidFlowNodeOverlap(root, nodes, null);
		expect(moves.map(move => move.nodeId)).not.toContain("root");
		expect(moves.map(move => move.nodeId)).not.toContain("far");
		expect(moves.find(move => move.nodeId === "next")!.x).toBeGreaterThan(250);
		const result = nodes.map(item => ({ ...item, ...moves.find(move => move.nodeId === item.nodeId) }));
		for (const [i, a] of result.entries()) for (const b of result.slice(i + 1)) expect(intersect(a, b)).toBe(false);
		for (const move of moves) {
			const original = nodes.find(item => item.nodeId === move.nodeId)!;
			expect(Math.hypot(move.x + original.width / 2 - 80, move.y + 50 - 50)).toBeGreaterThan(Math.hypot(original.x + original.width / 2 - 80, original.y));
		}
	});
	it("preserves unrelated overlaps and produces no movement when there is enough room", () => {
		const root = node("root", 0, 0);
		expect(avoidFlowNodeOverlap(root, [root, node("a", 500, 500), node("b", 500, 500)], null)).toEqual([]);
		expect(avoidFlowNodeOverlap(root, [root, node("a", 100 + FLOW_NODE_CLEARANCE, 0)], null)).toEqual([]);
	});
	it("resolves dense coincident nodes deterministically on the grid, including negative coordinates", () => {
		const root = node("root", -240, -240);
		const nodes = [root, ...Array.from({ length: 60 }, (_, i) => node(`n-${i}`, -240 + (i % 3) * 20, -240 + Math.floor(i / 3) * 5))];
		const moves = avoidFlowNodeOverlap(root, nodes, [24, 24]);
		expect(moves).toEqual(avoidFlowNodeOverlap(root, [...nodes].reverse(), [24, 24]));
		const result = nodes.map(item => ({ ...item, ...moves.find(move => move.nodeId === item.nodeId) }));
		for (const move of moves) { expect(move.x / 24).toBeCloseTo(Math.round(move.x / 24)); expect(move.y / 24).toBeCloseTo(Math.round(move.y / 24)); }
		for (const [i, a] of result.entries()) for (const b of result.slice(i + 1)) expect(intersect(a, b)).toBe(false);
	});
});
