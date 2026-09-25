import { describe, expect, it } from "vitest";
import type { FlowDocumentGroup, FlowDocumentNode } from "@/platform/rpc/types";
import { layoutFlowGroupFrames } from "@/domain/flow/flow-group-layout";

const group = (groupId: string, parentGroupId: string | null, nodeIds: string[], x = 0, y = 0): FlowDocumentGroup => ({
	groupId,
	flowId: "flow-test",
	parentGroupId,
	title: groupId,
	color: "#7189a5",
	x,
	y,
	width: 240,
	height: 160,
	nodeIds,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});

const node = (nodeId: string, x: number, y: number, collapsed = false): FlowDocumentNode => ({
	nodeId,
	flowId: "flow-test",
	typeId: "builtin/note",
	pluginId: "builtin",
	pluginVersion: "1",
	pluginFingerprint: "builtin-v1",
	configVersion: 1,
	title: nodeId,
	x,
	y,
	width: 200,
	height: 120,
	collapsed,
	config: {},
	ports: [],
	status: "idle",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("Flow group frame layout", () => {
	it("derives nested frames around both direct nodes and child groups", () => {
		const frames = new Map(layoutFlowGroupFrames(
			[group("outer", null, ["a"]), group("inner", "outer", ["b"])],
			[node("a", 20, 40), node("b", 300, 180)],
		).map((frame) => [frame.groupId, frame]));

		expect(frames.get("inner")).toEqual({ groupId: "inner", x: 276, y: 132, width: 248, height: 192 });
		expect(frames.get("outer")).toEqual({ groupId: "outer", x: -4, y: -8, width: 552, height: 356 });
	});

	it("uses the saved frame when a group has no remaining children", () => {
		expect(layoutFlowGroupFrames([group("empty", null, [], 64, 96)], [])).toEqual([
			{ groupId: "empty", x: 64, y: 96, width: 240, height: 160 },
		]);
	});

	it("uses the compact node height for collapsed members", () => {
		expect(layoutFlowGroupFrames([group("g", null, ["a"])], [node("a", 100, 100, true)])).toEqual([
			{ groupId: "g", x: 76, y: 52, width: 248, height: 112 },
		]);
	});
});
