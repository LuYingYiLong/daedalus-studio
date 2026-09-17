import { describe, expect, it } from "vitest";
import { readRepoFile } from "../helpers/repo-paths";

describe("Flow home surface", (): void => {
	it("keeps Chat and Flow controlled and routes graph operations through dedicated RPCs", (): void => {
		const sidebar = readRepoFile("src", "renderer", "src", "widgets", "home", "workspace", "HomeWorkspaceSidebar.tsx");
		const surface = readRepoFile("src", "renderer", "src", "widgets", "flow", "HomeFlowSurface.tsx");
		const nodes = readRepoFile("src", "renderer", "src", "widgets", "flow", "FlowNodes.tsx");
		const controller = readRepoFile("src", "renderer", "src", "features", "home", "flow", "useHomeFlowController.ts");
		const api = readRepoFile("src", "renderer", "src", "platform", "rpc", "flow-api.ts");
		expect(sidebar).toContain("value={primarySurface}");
		expect(sidebar).toContain("onPrimarySurfaceChange");
		expect(surface).toContain("onConnect={onConnect}");
		expect(surface).toContain('sourceHandle: "output"');
		expect(surface).toContain('targetHandle: "input"');
		expect(surface).toContain("viewportSaveTimerRef");
		expect(surface).toContain("deleteKeyCode={[\"Backspace\", \"Delete\"]}");
		expect(surface).not.toContain("renderComposer");
		expect(surface).not.toContain("<Empty");
		expect(controller).toContain("createFlowNode");
		expect(controller).toContain("mutationQueueRef");
		expect(controller).toContain("updateNodePosition");
		expect(controller).toContain("ignoreFlowEventsUntilRef");
		expect(controller).toContain("startFlowRun");
		expect(nodes).toContain('id="input"');
		expect(nodes).toContain('id="output"');
		expect(api).toContain('"flow.node.create"');
		expect(api).toContain('"flow.run.start"');
	});
});
