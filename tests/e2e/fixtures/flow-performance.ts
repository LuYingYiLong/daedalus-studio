import type { MockBackend } from "./mock-backend";

export function installFlowPerformanceScenario(backend: MockBackend, count: number, mixed = false): void {
	const now = "2026-09-20T00:00:00.000Z";
	const flowId = "flow-performance";
	const input = {
		id: "input",
		label: "Input",
		mode: "connection",
		direction: "input",
		dataTypes: ["text"],
		required: false,
		multiple: true,
		defaultConnect: true,
	};
	const output = {
		id: "output",
		label: "Output",
		direction: "output",
		dataTypes: ["text"],
		required: false,
		multiple: true,
		defaultConnect: true,
	};
	const definition = {
		typeId: "builtin/text",
		pluginId: "builtin",
		pluginVersion: "1.0.0",
		pluginFingerprint: "perf:text:1",
		configVersion: 1,
		category: "basic",
		workspaceRequired: false,
		sideEffecting: false,
		executable: true,
		cachePolicy: "always",
		defaultTitle: "Text",
		defaultConfig: { text: "Text", mode: "text", quantity: 1 },
		summaryFields: ["text"],
		ui: { kind: "schema" },
		configSchema: {
			type: "object",
			properties: {
				text: { type: "string" },
				mode: { type: "string", enum: ["text", "json"] },
				quantity: { type: "number" },
			},
		},
		parameters: [
			input,
			...["text", "mode", "quantity"].map((id) => ({ id, label: id, mode: "fixed", configField: id })),
		],
		outputs: [output],
	};
	const outputDefinition = {
		...definition,
		typeId: "builtin/output",
		terminal: true,
		pluginFingerprint: "perf:output:1",
		defaultTitle: "Output",
	};
	const pluginDefinition = {
		...definition,
		typeId: "perf/node",
		pluginId: "perf",
		pluginFingerprint: "perf:plugin:1",
		defaultTitle: "Plugin",
		ui: { kind: "sandbox", entry: "index.html", actions: [] },
	};
	const nodes = Array.from({ length: count }, (_, index) => ({
		nodeId: `perf-${index}`,
		flowId,
		typeId: definition.typeId,
		pluginId: "builtin",
		pluginVersion: "1.0.0",
		pluginFingerprint: definition.pluginFingerprint,
		configVersion: 1,
		title: `Node ${index}`,
		x: (index % 20) * 400,
		y: Math.floor(index / 20) * 310,
		width: 320,
		height: 240,
		collapsed: false,
		config: { ...definition.defaultConfig, text: `Node ${index}` },
		ports: [input, output],
		status: "idle",
		createdAt: now,
		updatedAt: now,
	}));
	if (mixed)
		for (const [index, node] of nodes.entries()) {
			const selected = index % 5 === 0 ? outputDefinition : index % 7 === 0 ? pluginDefinition : definition;
			node.typeId = selected.typeId;
			node.pluginId = selected.pluginId;
			node.pluginFingerprint = selected.pluginFingerprint;
		}
	const edges = Array.from({ length: count * 2 }, (_, index) => ({
		edgeId: `perf-edge-${index}`,
		flowId,
		sourceNodeId: `perf-${index % count}`,
		targetNodeId: `perf-${((index % count) + (index < count ? 1 : 20)) % count}`,
		sourcePort: "output",
		targetPort: "input",
		dataType: "text",
	}));
	const flow = {
		flowId,
		title: `Performance ${count}`,
		workspaceId: null,
		pinned: false,
		revision: 1,
		graphRevision: 1,
		layoutRevision: 1,
		approvalMode: "manual",
		viewport: { x: 20, y: 80, zoom: 1 },
		archivedAt: null,
		createdAt: now,
		updatedAt: now,
	};
	const markdown = Array.from(
		{ length: 35 },
		(_, index) =>
			`### Section ${index}\n\nA paragraph with **emphasis**, a [link](https://example.com) and a list.\n\n- First\n- Second\n\n\`\`\`ts\nconst result = ${index};\n\`\`\``,
	).join("\n\n");
	const runs = mixed
		? [
				{
					runId: "perf-run",
					flowId,
					status: "completed",
					nodes: nodes.map((node, index) => ({
						runId: "perf-run",
						nodeId: node.nodeId,
						status: "completed",
						output:
							node.typeId === "builtin/output"
								? index % 10 === 0
									? { artifactId: "perf-image", mimeType: "image/svg+xml" }
									: { value: markdown }
								: null,
						error: null,
					})),
				},
			]
		: [];
	backend.setHandler("flow.artifact.get", () => ({
		ref: { artifactId: "perf-image", mimeType: "image/svg+xml" },
		dataBase64: Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#316181"/><circle cx="320" cy="180" r="120" fill="#adc56e"/></svg>',
		).toString("base64"),
	}));
	const snapshot = (): Record<string, unknown> => ({ flow, nodes, edges, runs });
	backend.setHandler("flow.list", () => ({
		flows: [flow],
		order: {
			schemaVersion: 1,
			pinnedFlowIds: [],
			recentFlowIds: [flowId],
			flowIdsByWorkspace: {},
			expandedSectionKeys: ["recent"],
			expandedWorkspaceIds: [],
			updatedAt: now,
		},
	}));
	backend.setHandler("flow.get", snapshot);
	backend.setHandler("flow.create", snapshot);
	backend.setHandler("flow.node.types.list", () => ({ nodes: [definition, outputDefinition, pluginDefinition] }));
	backend.setHandler("flow.tools.list", () => ({ tools: [] }));
	backend.setHandler("flow.approval.list", () => ({ approvals: [] }));
	backend.setHandler("flow.patch.commit", ({ params }) => {
		const operations = (
			params as { operations: Array<{ mutationId: string; kind: string; payload: Record<string, unknown> }> }
		).operations;
		for (const operation of operations) {
			if (operation.kind === "node.create") {
				nodes.push({ ...structuredClone(nodes[0]!), ...operation.payload, typeId: String(operation.payload.typeId),
					nodeId: String(operation.payload.nodeId), x: Number(operation.payload.x), y: Number(operation.payload.y),
					width: 300, height: 180, config: { ...definition.defaultConfig, ...operation.payload.config as object } });
			}
			if (operation.kind === "node.delete") {
				const index = nodes.findIndex(node => node.nodeId === operation.payload.nodeId);
				if (index >= 0) nodes.splice(index, 1);
			}
			if (operation.kind === "node.update") {
				const node = nodes.find(candidate => candidate.nodeId === operation.payload.nodeId);
				if (node && operation.payload.config) node.config = operation.payload.config as typeof node.config;
				flow.graphRevision++;
			}
			if (operation.kind === "viewport.update") flow.viewport = operation.payload as typeof flow.viewport;
			if (operation.kind === "node.move" || operation.kind === "node.resize" || operation.kind === "node.collapse") {
				const node = nodes.find((candidate) => candidate.nodeId === operation.payload.nodeId);
				if (node) Object.assign(node, operation.payload);
			}
		}
		flow.layoutRevision += 1;
		return {
			flowId,
			graphRevision: flow.graphRevision,
			layoutRevision: flow.layoutRevision,
			acceptedMutationIds: operations.map((operation) => operation.mutationId),
			operations,
		};
	});
}
