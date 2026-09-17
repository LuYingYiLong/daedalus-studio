import { describe, expect, it } from "vitest";
import { readRepoFile } from "../helpers/repo-paths";

describe("Flow home surface", (): void => {
	it("keeps Chat and Flow controlled and routes graph operations through dedicated RPCs", (): void => {
		const sidebar = readRepoFile("src", "renderer", "src", "widgets", "home", "workspace", "HomeWorkspaceSidebar.tsx");
		const surface = readRepoFile("src", "renderer", "src", "widgets", "flow", "HomeFlowSurface.tsx");
		const nodes = readRepoFile("src", "renderer", "src", "widgets", "flow", "FlowNodes.tsx");
		const picker = readRepoFile("src", "renderer", "src", "widgets", "flow", "FlowNodePicker.tsx");
		const controller = readRepoFile("src", "renderer", "src", "features", "home", "flow", "useHomeFlowController.ts");
		const api = readRepoFile("src", "renderer", "src", "platform", "rpc", "flow-api.ts");
		expect(sidebar).toContain("value={primarySurface}");
		expect(sidebar).toContain("onPrimarySurfaceChange");
		expect(surface).toContain("onConnect={onConnect}");
		expect(surface).toContain("sourceHandle: edge.sourcePort");
		expect(surface).toContain("targetHandle: edge.targetPort");
		expect(surface).toContain("onConnectEnd={onConnectEnd}");
		expect(surface).toContain("createConnectedNode");
		expect(surface).toContain("viewportSaveTimerRef");
		expect(surface).toContain("onMoveStart={onMoveStart}");
		expect(surface).toContain("isViewportMoving ? null : <MiniMap");
		expect(surface).toContain("menu={approvalModeMenu}");
		expect(surface).toContain('running ? "stop" : "play"');
		expect(surface).toContain('deleteKeyCode={controller.isGraphLocked ? null : ["Backspace", "Delete"]}');
		expect(surface).not.toContain("renderComposer");
		expect(surface).not.toContain("<Empty");
		expect(controller).toContain("createFlowNode");
		expect(controller).toContain("mutationQueueRef");
		expect(controller).toContain("updateNodePosition");
		expect(controller).toContain("ignoreFlowEventsUntilRef");
		expect(controller).toContain("startFlowRun");
		expect(nodes).toContain("resolveFlowCanvasPorts");
		expect(nodes).toContain("id={port.id}");
		expect(picker).toContain('role="listbox"');
		expect(api).toContain('"flow.node.create"');
		expect(api).toContain('"flow.run.start"');
		expect(api).toContain('"flow.node.createConnected"');
	});
});
