import { expect, test } from "./fixtures/studio";
import type { FlowDocumentNode, FlowNodeTypeDefinition } from "../../src/renderer/src/platform/rpc/types";

test("shows unconnected parameter handles on row hover and keeps connected handles visible", async ({ launchStudio, mockBackend }) => {
	const now = "2026-09-26T00:00:00.000Z";
	const flowId = "flow-handle-visibility-e2e";
	const parameter = (id: string) => ({
		id, label: id, mode: "hybrid" as const, configField: id, dataTypes: ["text" as const],
		required: false, multiple: false, defaultConnect: false, hideControlWhenConnected: false,
	});
	const definition: FlowNodeTypeDefinition = {
		typeId: "builtin/text", pluginId: "builtin", pluginVersion: "4.0.0", pluginFingerprint: "builtin:text:handle-visibility",
		configVersion: 4, category: "basic", workspaceRequired: false, sideEffecting: false, executable: true,
		cachePolicy: "always", defaultTitle: "Text", defaultConfig: { text: "hello", separator: "," },
		configSchema: { type: "object", properties: { text: { type: "string" }, separator: { type: "string" } } },
		summaryFields: ["text"], ui: { kind: "schema" }, parameters: [parameter("text"), parameter("separator")],
		outputs: [{ id: "output", label: "Output", dataTypes: ["text"], defaultConnect: true }],
	};
	const flow = { flowId, title: "Handle visibility", workspaceId: null, pinned: false, revision: 1, graphRevision: 1, layoutRevision: 1, approvalMode: "manual", viewport: { x: 100, y: 100, zoom: 1 }, archivedAt: null, createdAt: now, updatedAt: now };
	const nodes: FlowDocumentNode[] = ["source", "target"].map((id, index) => ({
		nodeId: id, flowId, typeId: definition.typeId, pluginId: "builtin", pluginVersion: definition.pluginVersion,
		pluginFingerprint: definition.pluginFingerprint, configVersion: definition.configVersion, title: id,
		x: index * 420, y: 0, width: 320, height: 240, collapsed: false, config: { ...definition.defaultConfig },
		ports: [
			{ id: "text", label: "text", direction: "input", dataTypes: ["text"], required: false, multiple: false, defaultConnect: false },
			{ id: "separator", label: "separator", direction: "input", dataTypes: ["text"], required: false, multiple: false, defaultConnect: false },
			{ id: "output", label: "Output", direction: "output", dataTypes: ["text"], required: false, multiple: true, defaultConnect: true },
		],
		status: "idle", createdAt: now, updatedAt: now,
	}));
	const edges = [{ edgeId: "connected-text", flowId, sourceNodeId: "source", sourcePort: "output", targetNodeId: "target", targetPort: "text", dataType: "text" }];
	mockBackend.setHandler("flow.list", () => ({ flows: [flow] }));
	mockBackend.setHandler("flow.get", () => ({ flow, nodes, edges, runs: [] }));
	mockBackend.setHandler("flow.node.types.list", () => ({ nodes: [definition], generation: "flow-parameters-2" }));
	mockBackend.setHandler("flow.tools.list", () => ({ tools: [] }));
	mockBackend.setHandler("flow.approval.list", () => ({ approvals: [] }));
	mockBackend.setHandler("flow.artifact.list", () => ({ artifacts: [] }));
	const { mainWindow: page } = await launchStudio();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Handle visibility", { exact: true }).first().click();
	const target = page.locator('[data-flow-node-id="target"]');
	const connected = target.locator('[data-flow-port-id="text"].react-flow__handle');
	const unconnected = target.locator('[data-flow-port-id="separator"].react-flow__handle');
	const unconnectedRow = unconnected.locator("xpath=../..");
	await expect(connected).toHaveCSS("opacity", "1");
	await expect(unconnected).toHaveCSS("opacity", "0");
	await unconnectedRow.hover();
	await expect(unconnected).toHaveCSS("opacity", "1");
	const rowBox = (await unconnectedRow.boundingBox())!;
	const handleBox = (await unconnected.boundingBox())!;
	const gapX = (rowBox.x + handleBox.x + handleBox.width) / 2;
	const centerY = handleBox.y + handleBox.height / 2;
	await page.mouse.move(gapX, centerY);
	await expect(unconnectedRow).toHaveAttribute("data-parameter-connected", "false");
	await expect.poll(() => unconnectedRow.evaluate((row) => row.matches(":hover"))).toBe(true);
	await expect(unconnected).toHaveCSS("opacity", "1");
	await page.mouse.move(handleBox.x + handleBox.width / 2, centerY);
	await expect(unconnected).toHaveCSS("opacity", "1");
	await target.locator("header").hover();
	await expect(unconnected).toHaveCSS("opacity", "0");
	await expect(connected).toHaveCSS("opacity", "1");
});
