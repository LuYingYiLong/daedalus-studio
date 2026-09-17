import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/studio";

const NOW = "2026-09-17T00:00:00.000Z";
const FLOW_ID = "flow-e2e";

type Port = {
	id: string;
	label: string;
	direction: "input" | "output";
	dataTypes: Array<"text" | "json" | "artifact">;
	required: boolean;
	multiple: boolean;
	defaultConnect: boolean;
};

type FlowNode = {
	nodeId: string;
	flowId: string;
	type: string;
	title: string;
	x: number;
	y: number;
	width: number;
	height: number;
	config: Record<string, unknown>;
	status: string;
	createdAt: string;
	updatedAt: string;
};

type FlowEdge = {
	edgeId: string;
	flowId: string;
	sourceNodeId: string;
	sourcePort: string;
	targetNodeId: string;
	targetPort: string;
	dataType: "text" | "json" | "artifact";
};

function input(id: string, label: string, dataTypes: Port["dataTypes"], defaultConnect = false): Port {
	return { id, label, direction: "input", dataTypes, required: false, multiple: false, defaultConnect };
}

function output(id: string, label: string, dataTypes: Port["dataTypes"], defaultConnect = false): Port {
	return { id, label, direction: "output", dataTypes, required: false, multiple: true, defaultConnect };
}

const nodeDefinitions = [
	{ type: "text", category: "basic", workspaceRequired: false, sideEffecting: false, defaultTitle: "Text", defaultConfig: { text: "" }, ports: [output("output", "Text", ["text"], true)] },
	{ type: "condition", category: "basic", workspaceRequired: false, sideEffecting: false, defaultTitle: "Condition", defaultConfig: { pointer: "/", operator: "equals", value: "" }, ports: [input("input", "Value", ["text", "json"], true), output("true", "True", ["text", "json"], true), output("false", "False", ["text", "json"])] },
	{ type: "tool", category: "workspace", workspaceRequired: false, sideEffecting: true, defaultTitle: "Tool", defaultConfig: { toolName: "workspace_write", args: {}, bindings: [] }, ports: [input("input", "Arguments", ["text", "json"], true), output("result", "Result", ["json"], true), output("text", "Text", ["text"])] },
	{ type: "output", category: "basic", workspaceRequired: false, sideEffecting: false, defaultTitle: "Output", defaultConfig: { format: "text" }, ports: [input("input", "Value", ["text", "json", "artifact"], true)] },
];

function flowDocument(): Record<string, unknown> {
	return {
		flowId: FLOW_ID,
		title: "E2E Workflow",
		workspaceId: null,
		pinned: false,
		revision: 1,
		graphRevision: 1,
		layoutRevision: 1,
		approvalMode: "manual",
		viewport: { x: 0, y: 0, zoom: 1 },
		archivedAt: null,
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function flowOrder(): Record<string, unknown> {
	return {
		schemaVersion: 1,
		pinnedFlowIds: [],
		recentFlowIds: [FLOW_ID],
		flowIdsByWorkspace: {},
		expandedSectionKeys: ["pinned", "projects", "recent"],
		expandedWorkspaceIds: [],
		updatedAt: NOW,
	};
}

async function switchToFlow(page: Page): Promise<void> {
	await page.locator(".ant-segmented-item").filter({ hasText: /^(Flow|流)$/ }).click();
}

test.describe("Daedalus Flow node workflow", () => {
	test("creates nodes from every picker entry point, connects from empty space, and completes a Tool approval", async ({ launchStudio, mockBackend }) => {
		let created = false;
		let graphRevision = 1;
		let layoutRevision = 1;
		let nodeIndex = 0;
		let edgeIndex = 0;
		const nodes: FlowNode[] = [];
		const edges: FlowEdge[] = [];
		let runs: Array<Record<string, unknown>> = [];
		let approvals: Array<Record<string, unknown>> = [];
		const document = flowDocument();
		const snapshot = (): Record<string, unknown> => ({ flow: { ...document, graphRevision, layoutRevision }, nodes: nodes.map((node): FlowNode => ({ ...node })), edges: edges.map((edge): FlowEdge => ({ ...edge })), runs });
		const addNode = (type: string, x: number, y: number, config: Record<string, unknown> = {}): FlowNode => {
			const definition = nodeDefinitions.find((candidate): boolean => candidate.type === type)!;
			const node: FlowNode = { nodeId: `node-${++nodeIndex}`, flowId: FLOW_ID, type, title: definition.defaultTitle, x, y, width: 300, height: 180, config: { ...definition.defaultConfig, ...config }, status: "idle", createdAt: NOW, updatedAt: NOW };
			nodes.push(node);
			return node;
		};
		const addEdge = (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort: string, dataType: FlowEdge["dataType"]): FlowEdge => {
			const edge: FlowEdge = { edgeId: `edge-${++edgeIndex}`, flowId: FLOW_ID, sourceNodeId, sourcePort, targetNodeId, targetPort, dataType };
			edges.push(edge);
			return edge;
		};

		mockBackend.setHandler("flow.list", () => ({ flows: created ? [{ ...document, graphRevision, layoutRevision }] : [], order: flowOrder() }));
		mockBackend.setHandler("flow.create", () => { created = true; return snapshot(); });
		mockBackend.setHandler("flow.get", () => snapshot());
		mockBackend.setHandler("flow.node.types.list", () => ({ nodes: nodeDefinitions }));
		mockBackend.setHandler("flow.tools.list", () => ({ tools: [{ name: "workspace_write", description: "Write a workspace file", inputSchema: { type: "object", properties: { path: { type: "string" } } }, risk: "write" }] }));
		mockBackend.setHandler("flow.approval.list", () => ({ approvals }));
		mockBackend.setHandler("flow.node.create", ({ params }) => {
			const inputParams = params as { type: string; x: number; y: number; config?: Record<string, unknown> };
			addNode(inputParams.type, inputParams.x, inputParams.y, inputParams.config);
			graphRevision += 1;
			return snapshot();
		});
		mockBackend.setHandler("flow.node.createConnected", ({ params }) => {
			const inputParams = params as { type: string; x: number; y: number; config?: Record<string, unknown>; connection: { direction: "from_existing" | "to_existing"; existingNodeId: string; existingPort: string; newPort: string; dataType: FlowEdge["dataType"] } };
			const connected = addNode(inputParams.type, inputParams.x, inputParams.y, inputParams.config);
			const connection = inputParams.connection;
			const edge = connection.direction === "from_existing" ? addEdge(connection.existingNodeId, connection.existingPort, connected.nodeId, connection.newPort, connection.dataType) : addEdge(connected.nodeId, connection.newPort, connection.existingNodeId, connection.existingPort, connection.dataType);
			const tool = addNode("tool", connected.x + 360, connected.y, { toolName: "workspace_write", args: { path: "result.txt" }, bindings: [] });
			const result = addNode("output", connected.x + 720, connected.y, { format: "text" });
			addEdge(connected.nodeId, "true", tool.nodeId, "input", "text");
			addEdge(tool.nodeId, "text", result.nodeId, "input", "text");
			graphRevision += 1;
			return { snapshot: snapshot(), nodeId: connected.nodeId, edgeId: edge.edgeId };
		});
		mockBackend.setHandler("flow.node.update", ({ params }) => {
			const inputParams = params as { nodeId: string; patch: Partial<FlowNode> & { config?: Record<string, unknown> } };
			const node = nodes.find((candidate): boolean => candidate.nodeId === inputParams.nodeId)!;
			Object.assign(node, inputParams.patch);
			if (inputParams.patch.x !== undefined || inputParams.patch.y !== undefined) layoutRevision += 1;
			else graphRevision += 1;
			return snapshot();
		});
		mockBackend.setHandler("flow.viewport.update", ({ params }) => {
			const inputParams = params as { viewport: { x: number; y: number; zoom: number } };
			Object.assign(document, { viewport: inputParams.viewport });
			layoutRevision += 1;
			return { ...document, graphRevision, layoutRevision };
		});
		mockBackend.setHandler("flow.edge.create", ({ params }) => {
			const inputParams = params as Omit<FlowEdge, "edgeId">;
			addEdge(inputParams.sourceNodeId, inputParams.sourcePort, inputParams.targetNodeId, inputParams.targetPort, inputParams.dataType);
			graphRevision += 1;
			return snapshot();
		});
		mockBackend.setHandler("flow.run.start", () => {
			const runId = "run-e2e";
			const nodeRuns = nodes.map((node): Record<string, unknown> => ({ runId, nodeId: node.nodeId, status: node.type === "tool" ? "waiting" : node.type === "output" ? "queued" : "completed", inputFingerprint: `fingerprint-${node.nodeId}`, output: node.type === "text" ? { output: "hello" } : node.type === "condition" ? { true: "hello" } : null, error: null, startedAt: NOW, finishedAt: node.type === "tool" || node.type === "output" ? null : NOW }));
			runs = [{ runId, flowId: FLOW_ID, revision: graphRevision, status: "waiting", startedAt: NOW, finishedAt: null, error: null, nodes: nodeRuns }];
			const toolNode = nodes.find((node): boolean => node.type === "tool")!;
			approvals = [{ approvalId: "approval-e2e", flowId: FLOW_ID, runId, nodeId: toolNode.nodeId, toolName: "workspace_write", reason: "Write result.txt", status: "pending", requiredConsent: null, createdAt: NOW, resolvedAt: null }];
			setTimeout((): void => mockBackend.sendEvent("flow.node.state", { flowId: FLOW_ID, runId, nodeId: toolNode.nodeId, status: "waiting" }, { runId }), 0);
			return runs[0];
		});
		mockBackend.setHandler("flow.approval.resolve", () => {
			approvals = approvals.map((approval): Record<string, unknown> => ({ ...approval, status: "approved", resolvedAt: NOW }));
			const run = runs[0]!;
			const nodeRuns = (run.nodes as Array<Record<string, unknown>>).map((nodeRun): Record<string, unknown> => {
				const node = nodes.find((candidate): boolean => candidate.nodeId === nodeRun.nodeId)!;
				if (node.type === "tool") return { ...nodeRun, status: "completed", output: { text: "approved result" }, finishedAt: NOW };
				if (node.type === "output") return { ...nodeRun, status: "completed", output: { result: "approved result" }, finishedAt: NOW };
				return nodeRun;
			});
			runs = [{ ...run, status: "completed", finishedAt: NOW, nodes: nodeRuns }];
			return runs[0];
		});

		const { mainWindow } = await launchStudio();
		await switchToFlow(mainWindow);
		await mainWindow.locator('[data-studio-new-flow="true"]').click();
		await expect(mainWindow.locator('[data-studio-flow-surface="true"]')).toBeVisible();
		await expect.poll(() => mockBackend.getRequests("flow.node.types.list").length).toBeGreaterThan(0);

		await mainWindow.getByRole("button", { name: /Add node|添加节点/ }).click();
		await expect(mainWindow.getByRole("dialog", { name: /Add Flow node|添加 Flow 节点/ })).toBeVisible();
		await mainWindow.keyboard.press("Escape");
		await mainWindow.keyboard.press("Shift+A");
		await expect(mainWindow.getByRole("dialog", { name: /Add Flow node|添加 Flow 节点/ })).toBeVisible();
		await mainWindow.keyboard.press("Escape");

		const pane = mainWindow.locator(".react-flow__pane");
		await mainWindow.locator('section[aria-labelledby="flow-welcome-title"]').click({ button: "right", position: { x: 460, y: 260 } });
		await mainWindow.locator('[data-flow-node-type="text"]').click();
		await expect.poll(() => mockBackend.getRequests("flow.node.create").length).toBe(1);
		const textNode = mainWindow.locator('[data-flow-node-id="node-1"]');
		await expect(textNode).toBeVisible();

		const source = textNode.locator('[data-flow-port-id="output"]');
		const sourceBox = await source.boundingBox();
		const paneBox = await pane.boundingBox();
		expect(sourceBox).not.toBeNull();
		expect(paneBox).not.toBeNull();
		await mainWindow.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
		await mainWindow.mouse.down();
		await mainWindow.mouse.move(paneBox!.x + paneBox!.width * 0.12, paneBox!.y + paneBox!.height * 0.34, { steps: 12 });
		await mainWindow.mouse.up();
		await expect(mainWindow.getByRole("dialog", { name: /Add Flow node|添加 Flow 节点/ })).toBeVisible();
		await expect(mainWindow.locator('[data-flow-node-type="condition"]')).toBeVisible();
		await mainWindow.locator('[data-flow-node-type="condition"]').click();
		await expect.poll(() => mockBackend.getRequests("flow.node.createConnected").length).toBe(1);
		await expect(mainWindow.locator('[data-flow-node-id="node-2"]')).toBeVisible();
		await expect(mainWindow.locator('[data-flow-node-id="node-3"]')).toBeVisible();
		await expect(mainWindow.locator('[data-flow-node-id="node-4"]')).toBeVisible();

		await mainWindow.getByRole("button", { name: /Run|运行/ }).click();
		await expect(mainWindow.getByRole("button", { name: /Stop|停止/ })).toBeVisible();
		await expect(mainWindow.getByText(/Pending approvals|待审批操作/)).toBeVisible();
		await mainWindow.getByRole("button", { name: /Approve|批\s*准/ }).click();
		await expect.poll(() => mockBackend.getRequests("flow.approval.resolve").length).toBe(1);
		await expect(mainWindow.locator('[data-flow-node-id="node-4"]')).toContainText("approved result");
	});
});
