import { describe, expect, it } from "vitest";
import { layoutFlowNodes } from "@/domain/flow/flow-layout";
import type { ConversationFlowNode } from "@/platform/rpc/types";

function node(nodeId: string, parentNodeId: string | null): ConversationFlowNode {
	return {
		nodeId,
		flowId: "flow-a",
		branchId: "branch-a",
		sessionId: "session-a",
		requestId: nodeId,
		role: nodeId.startsWith("user") ? "user" : "assistant",
		parentNodeId,
		status: "completed",
		contentPreview: nodeId,
		createdAt: "2026-09-15T00:00:00.000Z",
		updatedAt: "2026-09-15T00:00:00.000Z",
	};
}

describe("Flow DAG layout", (): void => {
	it("lays nodes from left to right and preserves saved coordinates", (): void => {
		const nodes = [
			node("user:1", null),
			node("assistant:1", "user:1"),
			node("user:2", "assistant:1"),
		];
		const layout = layoutFlowNodes(nodes, [{ nodeId: "assistant:1", x: 777, y: 123 }]);
		expect(layout.get("assistant:1")).toEqual({ x: 777, y: 123 });
		expect(layout.get("user:1")!.x).toBeLessThan(layout.get("user:2")!.x);
	});
});
