import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/studio";

const NOW = "2026-09-17T00:00:00.000Z";
const FLOW_ID = "flow-e2e";

async function selectFlowNodeType(page: Page, category: RegExp, nodeName: string): Promise<void> {
	await page.getByRole("menuitem", { name: category }).hover();
	const pickerBox = await page.getByRole("dialog", { name: /Add Flow node|添加 Flow 节点/ }).boundingBox();
	expect(pickerBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(260);
	const option = page.getByRole("menuitem", { name: nodeName, exact: true });
	await expect(option).toBeVisible();
	await option.click();
	await expect(page.getByRole("dialog", { name: /Add Flow node|添加 Flow 节点/ })).toBeHidden();
	await expect(option).toBeHidden();
	await expect(page.locator('[data-flow-node-picker-submenu-host] [class*="-leave"]')).toHaveCount(0);
}

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
	typeId: string;
	pluginId: string;
	pluginVersion: string;
	pluginFingerprint: string;
	configVersion: number;
	title: string;
	x: number;
	y: number;
	width: number;
	height: number;
	config: Record<string, unknown>;
	ports: Port[];
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
	return {
		id,
		label,
		direction: "input",
		dataTypes,
		required: false,
		multiple: false,
		defaultConnect,
	};
}

function output(id: string, label: string, dataTypes: Port["dataTypes"], defaultConnect = false): Port {
	return {
		id,
		label,
		direction: "output",
		dataTypes,
		required: false,
		multiple: true,
		defaultConnect,
	};
}

type DefinitionParameter =
	| { id: string; label: string; mode: "fixed"; configField: string }
	| { id: string; label: string; mode: "connection"; dataTypes: Port["dataTypes"]; required: boolean; multiple: boolean; defaultConnect: boolean }
	| { id: string; label: string; mode: "hybrid"; configField: string; dataTypes: Port["dataTypes"]; required: boolean; multiple: boolean; defaultConnect: boolean; hideControlWhenConnected: boolean };

function definitionPorts(definition: { parameters: DefinitionParameter[]; outputs: Array<{ id: string; label: string; dataTypes: Port["dataTypes"]; defaultConnect: boolean }> }): Port[] {
	return [
		...definition.parameters.flatMap((parameter): Port[] => parameter.mode === "fixed"
			? []
			: [input(parameter.id, parameter.label, parameter.dataTypes, parameter.defaultConnect)]),
		...definition.outputs.map((item): Port => output(item.id, item.label, item.dataTypes, item.defaultConnect)),
	];
}

const nodeDefinitions = [
	{
		typeId: "builtin/text",
		pluginId: "builtin",
		pluginVersion: "1.0.0",
		pluginFingerprint: "builtin:text:1",
		configVersion: 1,
		category: "basic",
		workspaceRequired: false,
		sideEffecting: false,
		executable: true,
		cachePolicy: "always",
		defaultTitle: "Text",
		defaultConfig: { text: "" },
		configSchema: { type: "object", properties: { text: { type: "string" } } },
		summaryFields: ["text"],
		ui: { kind: "schema" },
		parameters: [{ id: "text", label: "Text", mode: "fixed", configField: "text" }] satisfies DefinitionParameter[],
		outputs: [{ id: "output", label: "Text", dataTypes: ["text"] as Port["dataTypes"], defaultConnect: true }],
	},
	{
		typeId: "builtin/condition",
		pluginId: "builtin",
		pluginVersion: "1.0.0",
		pluginFingerprint: "builtin:condition:1",
		configVersion: 1,
		category: "basic",
		workspaceRequired: false,
		sideEffecting: false,
		executable: true,
		cachePolicy: "always",
		defaultTitle: "Condition",
		defaultConfig: { pointer: "/", operator: "equals", value: "" },
		configSchema: { type: "object", properties: { pointer: { type: "string" }, operator: { type: "string" }, value: {} } },
		summaryFields: ["operator", "pointer"],
		ui: { kind: "schema" },
		parameters: [
			{ id: "input", label: "Value", mode: "connection", dataTypes: ["text", "json"], required: false, multiple: false, defaultConnect: true },
			{ id: "pointer", label: "JSON Pointer", mode: "fixed", configField: "pointer" },
			{ id: "operator", label: "Operator", mode: "fixed", configField: "operator" },
			{ id: "value", label: "Compare value", mode: "fixed", configField: "value" },
		] satisfies DefinitionParameter[],
		outputs: [
			{ id: "true", label: "True", dataTypes: ["text", "json"] as Port["dataTypes"], defaultConnect: true },
			{ id: "false", label: "False", dataTypes: ["text", "json"] as Port["dataTypes"], defaultConnect: false },
		],
	},
	{
		typeId: "builtin/tool",
		pluginId: "builtin",
		pluginVersion: "1.0.0",
		pluginFingerprint: "builtin:tool:1",
		configVersion: 1,
		category: "workspace",
		workspaceRequired: false,
		sideEffecting: true,
		executable: true,
		cachePolicy: "never",
		defaultTitle: "Tool",
		defaultConfig: { toolName: "workspace_write", args: {}, bindings: [] },
		configSchema: { type: "object", properties: { toolName: { type: "string" }, args: { type: "object" }, bindings: { type: "array" } } },
		summaryFields: ["toolName"],
		ui: { kind: "schema" },
		parameters: [
			{ id: "input", label: "Arguments", mode: "connection", dataTypes: ["text", "json"], required: false, multiple: false, defaultConnect: true },
			{ id: "toolName", label: "Tool", mode: "fixed", configField: "toolName" },
			{ id: "args", label: "Arguments", mode: "fixed", configField: "args" },
			{ id: "bindings", label: "Bindings", mode: "fixed", configField: "bindings" },
		] satisfies DefinitionParameter[],
		outputs: [
			{ id: "result", label: "Result", dataTypes: ["json"] as Port["dataTypes"], defaultConnect: true },
			{ id: "text", label: "Text", dataTypes: ["text"] as Port["dataTypes"], defaultConnect: false },
		],
	},
	{
		typeId: "builtin/output",
		pluginId: "builtin",
		pluginVersion: "1.0.0",
		pluginFingerprint: "builtin:output:1",
		configVersion: 1,
		category: "basic",
		workspaceRequired: false,
		sideEffecting: false,
		executable: true,
		cachePolicy: "always",
		defaultTitle: "Output",
		defaultConfig: { format: "text" },
		configSchema: { type: "object", properties: { format: { type: "string" } } },
		summaryFields: ["format"],
		ui: { kind: "schema" },
		parameters: [
			{ id: "input", label: "Value", mode: "connection", dataTypes: ["text", "json", "artifact"], required: false, multiple: false, defaultConnect: true },
			{ id: "format", label: "Format", mode: "fixed", configField: "format" },
		] satisfies DefinitionParameter[],
		outputs: [],
	},
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
	await page
		.locator(".ant-segmented-item")
		.filter({ hasText: /^(Flow|流)$/ })
		.click();
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
		const snapshot = (): Record<string, unknown> => ({
			flow: { ...document, graphRevision, layoutRevision },
			nodes: nodes.map((node): FlowNode => ({ ...node })),
			edges: edges.map((edge): FlowEdge => ({ ...edge })),
			runs,
		});
		const addNode = (typeId: string, x: number, y: number, config: Record<string, unknown> = {}, requestedNodeId?: string): FlowNode => {
			const definition = nodeDefinitions.find((candidate): boolean => candidate.typeId === typeId)!;
			const node: FlowNode = {
				nodeId: requestedNodeId ?? `node-${++nodeIndex}`,
				flowId: FLOW_ID,
				typeId,
				pluginId: definition.pluginId,
				pluginVersion: definition.pluginVersion,
				pluginFingerprint: definition.pluginFingerprint,
				configVersion: definition.configVersion,
				title: definition.defaultTitle,
				x,
				y,
				width: 300,
				height: 180,
				config: { ...definition.defaultConfig, ...config },
				ports: definitionPorts(definition),
				status: "idle",
				createdAt: NOW,
				updatedAt: NOW,
			};
			nodes.push(node);
			return node;
		};
		const addEdge = (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort: string, dataType: FlowEdge["dataType"], requestedEdgeId?: string): FlowEdge => {
			const edge: FlowEdge = {
				edgeId: requestedEdgeId ?? `edge-${++edgeIndex}`,
				flowId: FLOW_ID,
				sourceNodeId,
				sourcePort,
				targetNodeId,
				targetPort,
				dataType,
			};
			edges.push(edge);
			return edge;
		};

		mockBackend.setHandler("flow.list", () => ({
			flows: created ? [{ ...document, graphRevision, layoutRevision }] : [],
			order: flowOrder(),
		}));
		mockBackend.setHandler("flow.create", () => {
			created = true;
			return snapshot();
		});
		mockBackend.setHandler("flow.get", () => snapshot());
		mockBackend.setHandler("flow.node.types.list", () => ({
			nodes: nodeDefinitions,
		}));
		mockBackend.setHandler("flow.tools.list", () => ({
			tools: [
				{
					name: "workspace_write",
					description: "Write a workspace file",
					inputSchema: {
						type: "object",
						properties: { path: { type: "string" } },
					},
					risk: "write",
				},
			],
		}));
		mockBackend.setHandler("flow.approval.list", () => ({ approvals }));
		mockBackend.setHandler("flow.patch.commit", ({ params }) => {
			const operations = (params as { operations: Array<{ mutationId: string; kind: string; payload: Record<string, unknown> }> }).operations;
			for (const operation of operations) {
				const payload = operation.payload;
				switch (operation.kind) {
				case "node.create":
					addNode(String(payload.typeId), Number(payload.x), Number(payload.y), (payload.config as Record<string, unknown> | undefined) ?? {}, String(payload.nodeId));
					graphRevision += 1;
					break;
				case "node.update": {
					const node = nodes.find((candidate): boolean => candidate.nodeId === payload.nodeId);
					if (node !== undefined) {
						if (typeof payload.title === "string") node.title = payload.title;
						if (typeof payload.config === "object" && payload.config !== null) node.config = payload.config as Record<string, unknown>;
					}
					graphRevision += 1;
					break;
				}
				case "node.delete": {
					const nodeId = String(payload.nodeId);
					const nodeOffset = nodes.findIndex((candidate): boolean => candidate.nodeId === nodeId);
					if (nodeOffset >= 0) nodes.splice(nodeOffset, 1);
					for (let edgeOffset = edges.length - 1; edgeOffset >= 0; edgeOffset -= 1) {
						if (edges[edgeOffset]?.sourceNodeId === nodeId || edges[edgeOffset]?.targetNodeId === nodeId) edges.splice(edgeOffset, 1);
					}
					graphRevision += 1;
					break;
				}
				case "node.move": {
					const node = nodes.find((candidate): boolean => candidate.nodeId === payload.nodeId);
					if (node !== undefined) Object.assign(node, { x: Number(payload.x), y: Number(payload.y) });
					layoutRevision += 1;
					break;
				}
				case "node.resize": {
					const node = nodes.find((candidate): boolean => candidate.nodeId === payload.nodeId);
					if (node !== undefined) Object.assign(node, { width: Number(payload.width), height: Number(payload.height) });
					layoutRevision += 1;
					break;
				}
				case "edge.create":
					edges.splice(0, edges.length, ...edges.filter((edge): boolean => edge.targetNodeId !== payload.targetNodeId || edge.targetPort !== payload.targetPort));
					addEdge(String(payload.sourceNodeId), String(payload.sourcePort), String(payload.targetNodeId), String(payload.targetPort), payload.dataType as FlowEdge["dataType"], String(payload.edgeId));
					graphRevision += 1;
					break;
				case "edge.delete": {
					const edgeOffset = edges.findIndex((edge): boolean => edge.edgeId === payload.edgeId);
					if (edgeOffset >= 0) edges.splice(edgeOffset, 1);
					graphRevision += 1;
					break;
				}
				case "viewport.update":
					Object.assign(document, { viewport: payload });
					layoutRevision += 1;
					break;
				}
			}
			return { flowId: FLOW_ID, graphRevision, layoutRevision, acceptedMutationIds: operations.map((operation): string => operation.mutationId), operations };
		});
		let runStartCount = 0;
		mockBackend.setHandler("flow.run.start", () => {
			runStartCount += 1;
			if (runStartCount > 1) {
				const runId = `run-e2e-${runStartCount}`;
				const queuedNodes = nodes.map((node): Record<string, unknown> => ({
					runId,
					nodeId: node.nodeId,
					typeId: node.typeId,
					pluginVersion: node.pluginVersion,
					pluginFingerprint: node.pluginFingerprint,
					configVersion: node.configVersion,
					status: "queued",
					inputFingerprint: null,
					output: null,
					error: null,
					startedAt: null,
					finishedAt: null,
				}));
				const queuedRun = { runId, flowId: FLOW_ID, revision: graphRevision, status: "running", startedAt: NOW, finishedAt: null, error: null, nodes: queuedNodes };
				const completedRun = {
					...queuedRun,
					status: "completed",
					finishedAt: NOW,
					nodes: queuedNodes.map((nodeRun): Record<string, unknown> => {
						const node = nodes.find((candidate): boolean => candidate.nodeId === nodeRun.nodeId)!;
						return {
							...nodeRun,
							status: "cached",
							inputFingerprint: `fingerprint-${node.nodeId}`,
							output: node.typeId === "builtin/output" ? { result: "cached result" } : { output: "cached result" },
							startedAt: NOW,
							finishedAt: NOW,
						};
					}),
				};
				runs = [completedRun];
				setTimeout((): void => mockBackend.sendEvent("flow.run.state", {
					flowId: FLOW_ID,
					runId,
					revision: graphRevision,
					status: "completed",
					run: completedRun,
				}, { runId }), 0);
				return queuedRun;
			}
			const runId = "run-e2e";
			const nodeRuns = nodes.map(
				(node): Record<string, unknown> => ({
					runId,
					nodeId: node.nodeId,
					typeId: node.typeId,
					pluginVersion: node.pluginVersion,
					pluginFingerprint: node.pluginFingerprint,
					configVersion: node.configVersion,
					status: node.typeId === "builtin/tool" ? "waiting" : node.typeId === "builtin/output" ? "queued" : "completed",
					inputFingerprint: `fingerprint-${node.nodeId}`,
					output: node.typeId === "builtin/text" ? { output: "hello" } : node.typeId === "builtin/condition" ? { true: "hello" } : null,
					error: null,
					startedAt: NOW,
					finishedAt: node.typeId === "builtin/tool" || node.typeId === "builtin/output" ? null : NOW,
				}),
			);
			runs = [
				{
					runId,
					flowId: FLOW_ID,
					revision: graphRevision,
					status: "waiting",
					startedAt: NOW,
					finishedAt: null,
					error: null,
					nodes: nodeRuns,
				},
			];
			const toolNode = nodes.find((node): boolean => node.typeId === "builtin/tool")!;
			approvals = [
				{
					approvalId: "approval-e2e",
					flowId: FLOW_ID,
					runId,
					nodeId: toolNode.nodeId,
					toolName: "workspace_write",
					reason: "Write result.txt",
					status: "pending",
					requiredConsent: null,
					createdAt: NOW,
					resolvedAt: null,
				},
			];
			setTimeout(
				(): void =>
					mockBackend.sendEvent(
						"flow.node.state",
						{
							flowId: FLOW_ID,
							runId,
							nodeId: toolNode.nodeId,
							status: "waiting",
						},
						{ runId },
					),
				0,
			);
			return runs[0];
		});
		mockBackend.setHandler("flow.approval.resolve", () => {
			approvals = approvals.map(
				(approval): Record<string, unknown> => ({
					...approval,
					status: "approved",
					resolvedAt: NOW,
				}),
			);
			const run = runs[0]!;
			const nodeRuns = (run.nodes as Array<Record<string, unknown>>).map((nodeRun): Record<string, unknown> => {
				const node = nodes.find((candidate): boolean => candidate.nodeId === nodeRun.nodeId)!;
				if (node.typeId === "builtin/tool")
					return {
						...nodeRun,
						status: "completed",
						output: { text: "approved result" },
						finishedAt: NOW,
					};
				if (node.typeId === "builtin/output")
					return {
						...nodeRun,
						status: "completed",
						output: { result: "approved result" },
						finishedAt: NOW,
					};
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

		await mainWindow.keyboard.press("Shift+A");
		await expect(mainWindow.getByRole("dialog", { name: /Add Flow node|添加 Flow 节点/ })).toBeVisible();
		await mainWindow.keyboard.press("Escape");

		const pane = mainWindow.locator(".react-flow__pane");
		await mainWindow.locator('section[aria-labelledby="flow-welcome-title"]').click({ button: "right", position: { x: 460, y: 260 } });
		await selectFlowNodeType(mainWindow, /Basic|基础/u, "Text");
		await expect.poll(() => mockBackend.getRequests("flow.patch.commit").length).toBeGreaterThanOrEqual(1);
		const textNode = mainWindow.locator('.react-flow__node:has([data-node-type="builtin/text"])');
		await expect(textNode).toBeVisible();
		await textNode.click();
		await expect(textNode.locator("textarea")).toBeVisible();
		await expect(textNode.locator("input")).toHaveCount(0);
		await expect(textNode.locator(".ant-collapse")).toHaveCount(0);
		await expect(textNode.getByRole("button", { name: /Delete node|删除节点/ })).toHaveCount(0);
		await expect(mainWindow.locator(".react-flow__minimap")).toHaveCount(0);

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
		await selectFlowNodeType(mainWindow, /Basic|基础/u, "Condition");
		await mainWindow.getByRole("button", { name: "Fit View" }).click();
		await expect(mainWindow.locator('.react-flow__node:has([data-node-type="builtin/condition"])')).toBeVisible();
		await mainWindow.keyboard.press("Shift+A");
		await selectFlowNodeType(mainWindow, /Workspace|工作区/u, "Tool");
		await mainWindow.keyboard.press("Shift+A");
		await selectFlowNodeType(mainWindow, /Basic|基础/u, "Output");
		await mainWindow.getByRole("button", { name: "Fit View" }).click();
		await expect(mainWindow.locator('.react-flow__node:has([data-node-type="builtin/tool"])')).toBeVisible();
		await expect(mainWindow.locator('.react-flow__node:has([data-node-type="builtin/output"])')).toBeVisible();
		await expect(mainWindow.locator(".react-flow__edge-default")).toHaveCount(1);
		const conditionInput = mainWindow
			.locator('.react-flow__node:has([data-node-type="builtin/condition"])')
			.locator('[data-flow-port-id="input"]');
		const conditionInputBox = await conditionInput.boundingBox();
		expect(conditionInputBox).not.toBeNull();
		await mainWindow.mouse.move(
			conditionInputBox!.x + conditionInputBox!.width / 2,
			conditionInputBox!.y + conditionInputBox!.height / 2,
		);
		await mainWindow.mouse.down();
		await mainWindow.mouse.move(paneBox!.x + paneBox!.width * 0.78, paneBox!.y + paneBox!.height * 0.78, {
			steps: 12,
		});
		await expect(mainWindow.locator(".react-flow__edge-default")).toHaveCount(0);
		await expect(mainWindow.locator(".react-flow__connection-path")).toHaveCount(1);
		const currentSourceBox = await source.boundingBox();
		expect(currentSourceBox).not.toBeNull();
		const connectionStart = await mainWindow.locator(".react-flow__connection-path").evaluate((path): { x: number; y: number } => {
			const svgPath = path as SVGPathElement;
			const matrix = svgPath.getScreenCTM();
			const point = svgPath.getPointAtLength(0);
			if (matrix === null) throw new Error("Connection path has no screen transform");
			const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
			return { x: screenPoint.x, y: screenPoint.y };
		});
		const sourceCenter = {
			x: currentSourceBox!.x + currentSourceBox!.width / 2,
			y: currentSourceBox!.y + currentSourceBox!.height / 2,
		};
		expect(Math.abs(connectionStart.x - sourceCenter.x)).toBeLessThan(2);
		expect(Math.abs(connectionStart.y - sourceCenter.y)).toBeLessThan(2);
		await mainWindow.mouse.up();
		await expect(mainWindow.locator(".react-flow__edge-default")).toHaveCount(0);
		await expect(mainWindow.getByRole("dialog", { name: /Add Flow node|添加 Flow 节点/ })).toHaveCount(0);
		const snapButton = mainWindow.getByRole("button", {
			name: /Disable grid snapping|关闭网格吸附/,
		});
		await expect(snapButton).toHaveAttribute("aria-pressed", "true");
		await snapButton.click();
		const disabledSnapButton = mainWindow.getByRole("button", {
			name: /Enable grid snapping|开启网格吸附/,
		});
		await expect(disabledSnapButton).toHaveAttribute("aria-pressed", "false");
		await disabledSnapButton.click();

		await mainWindow.getByRole("button", { name: /Run|运行/ }).click();
		await expect(mainWindow.getByRole("button", { name: /Stop|停止/ })).toBeVisible();
		await expect(mainWindow.getByText(/Pending approvals|待审批操作/)).toBeVisible();
		await mainWindow.getByRole("button", { name: /Approve|批\s*准/ }).click();
		await expect.poll(() => mockBackend.getRequests("flow.approval.resolve").length).toBe(1);
		await expect(mainWindow.locator('.react-flow__node:has([data-node-type="builtin/output"])')).toContainText("approved result");
		await mainWindow.getByRole("button", { name: /Run|运行/ }).click();
		await expect(mainWindow.locator('.react-flow__node:has([data-node-type="builtin/output"])')).toContainText("cached result");
		const flowTreeItem = mainWindow.locator(".ant-tree-treenode").filter({ hasText: "E2E Workflow" });
		await expect(flowTreeItem.locator(".ant-badge-dot")).toHaveCount(0);

		await mainWindow.evaluate((): void => {
			window.dispatchEvent(new Event("blur"));
		});
		mockBackend.sendEvent("flow.run.state", {
			flowId: FLOW_ID,
			runId: "run-unread-e2e",
			revision: graphRevision,
			status: "completed",
		}, { runId: "run-unread-e2e" });
		await expect(flowTreeItem.locator(".ant-badge-dot")).toHaveCount(1);
		await mainWindow.evaluate((): void => {
			window.dispatchEvent(new Event("focus"));
		});
		await expect(flowTreeItem.locator(".ant-badge-dot")).toHaveCount(0);

		const outputNode = mainWindow.locator('.react-flow__node:has([data-node-type="builtin/output"])');
		const patchCountBeforeDelete = mockBackend.getRequests("flow.patch.commit").length;
		await outputNode.locator("header").click();
		await mainWindow.keyboard.press("Delete");
		await expect(outputNode).toHaveCount(0);
		await expect.poll(() => mockBackend.getRequests("flow.patch.commit").length).toBeGreaterThan(patchCountBeforeDelete);
		await mainWindow.waitForTimeout(350);
		await expect(outputNode).toHaveCount(0);
	});
});
