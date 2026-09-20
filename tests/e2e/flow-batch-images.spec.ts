import { test, expect } from "./fixtures/studio";
import definitions from "./fixtures/flow-composable-definitions.json";
import type { FlowDocumentNode, FlowDocumentRun, FlowNodeTypeDefinition } from "../../src/renderer/src/platform/rpc/types";

test("batch → resize → composite → compare → approved save → failed-only retry", async ({ launchStudio, mockBackend }) => {
	const now = "2026-09-21T00:00:00.000Z", flowId = "flow-batch-ui";
	const types = definitions as unknown as FlowNodeTypeDefinition[];
	const rows = ["one", "two", "three"].map((prompt, index) => ({ id: `row-${index}`, prompt, negativePrompt: "", width: 1024, height: 1024, seed: index, count: 1 }));
	const flow = { flowId, title: "Batch images", workspaceId: null, pinned: false, revision: 1, graphRevision: 1, layoutRevision: 1, approvalMode: "manual", viewport: { x: 20, y: 90, zoom: 1 }, archivedAt: null, createdAt: now, updatedAt: now };
	const nodes = ["parameter-sets", "batch-text-to-image", "media-output", "image-resize", "image-input", "image-composite", "save-images"].map((name, index): FlowDocumentNode => {
		const definition = types.find(item => item.typeId === `builtin/${name}`)!;
		return { nodeId: `batch-${index}`, flowId, typeId: definition.typeId, pluginId: "builtin", pluginVersion: definition.pluginVersion, pluginFingerprint: definition.pluginFingerprint, configVersion: definition.configVersion, title: definition.defaultTitle,
			x: index === 0 ? 0 : index > 2 ? 1200 + (index - 3) * 400 : 700, y: index === 2 ? 480 : 0, width: index === 0 ? 650 : 370, height: index === 0 ? 510 : index === 2 ? 370 : 420, collapsed: false,
			config: { ...definition.defaultConfig, ...(index === 0 ? { rows } : index === 1 ? { provider: "mock", model: "mock" } : {}) },
			ports: [...definition.parameters.filter(parameter => parameter.mode !== "fixed").map(parameter => ({ ...parameter, direction: "input" })), ...definition.outputs.map(output => ({ ...output, direction: "output", required: false, multiple: false }))] as FlowDocumentNode["ports"],
			status: "idle", createdAt: now, updatedAt: now };
	});
	const edges = [[0, "rows", 1, "rows", "json"], [1, "images", 3, "image", "image"], [3, "images", 5, "image", "image"], [4, "image", 5, "overlay", "image"], [5, "images", 2, "input", "image"], [5, "images", 6, "images", "image"]].map(([source, sourcePort, target, targetPort, dataType], index) => ({ edgeId: `edge-${index}`, flowId, sourceNodeId: `batch-${source}`, sourcePort, targetNodeId: `batch-${target}`, targetPort, dataType }));
	let run: FlowDocumentRun | null = null, starts = 0;
	let approvals: Record<string, unknown>[] = [];
	const saved = new Set<string>();
	mockBackend.setHandler("flow.list", () => ({ flows: [flow] }));
	mockBackend.setHandler("flow.get", () => ({ flow, nodes, edges, runs: run ? [run] : [] }));
	mockBackend.setHandler("flow.node.types.list", () => ({ nodes: types, generation: "flow-composable-1" }));
	mockBackend.setHandler("flow.tools.list", () => ({ tools: [] }));
	mockBackend.setHandler("flow.approval.list", () => ({ approvals }));
	mockBackend.setHandler("flow.patch.commit", ({ params }) => {
		const { operations } = params as { operations: Array<{ mutationId: string; kind: string; payload: Record<string, unknown> }> };
		for (const operation of operations) if (operation.kind === "node.update") {
			const node = nodes.find(item => item.nodeId === operation.payload.nodeId);
			if (node && operation.payload.config) node.config = operation.payload.config as Record<string, unknown>;
		}
		return { flowId, graphRevision: ++flow.graphRevision, layoutRevision: flow.layoutRevision, operations, acceptedMutationIds: operations.map(operation => operation.mutationId) };
	});
	const artifacts = rows.map((row, index) => ({ artifactId: `flow-artifact-ui-${index}`, flowId, runId: "batch-run", nodeId: "batch-1", mimeType: "image/png", width: 1, height: 1, byteSize: 68, sha256: String(index).repeat(64), metadata: { itemId: row.id, seed: row.seed }, createdAt: now, previewArtifactId: null, durationMs: null, fps: null }));
	for (const method of ["flow.artifact.get", "flow.artifact.thumbnail"]) mockBackend.setHandler(method, ({ params }) => ({ ref: artifacts.find(item => item.artifactId === (params as { artifactId: string }).artifactId), dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcZkAAAAASUVORK5CYII=" }));
	mockBackend.setHandler("flow.run.get", () => run);
	mockBackend.setHandler("flow.run.list", () => ({ runs: run ? [run] : [] }));
	mockBackend.setHandler("flow.run.start", ({ params }) => {
		const force = (params as { forceNodeIds?: string[] }).forceNodeIds ?? [];
		expect(force).not.toContain("batch-1");
		starts++;
		const runId = `batch-run-${starts}`;
		const batchItems = Object.fromEntries(rows.map((row, ordinal) => [row.id, { flowId, runId, nodeId: "batch-1", itemId: row.id, ordinal, requestFingerprint: row.id, fingerprint: row.id, params: row, status: starts === 1 && ordinal === 2 ? "failed" : "completed", error: starts === 1 && ordinal === 2 ? "fixture rate limit" : null, attempts: starts === 1 || ordinal < 2 ? 1 : 2, providerJobId: null, output: [artifacts[ordinal]] }]));
		run = { flowId, runId, revision: flow.graphRevision, entryNodeIds: [], targetNodeIds: ["batch-2"], inputValues: {}, status: starts === 1 ? "partial_failure" : "completed", startedAt: now, finishedAt: now, error: null,
			nodes: nodes.map(node => ({ runId, nodeId: node.nodeId, typeId: node.typeId, pluginVersion: node.pluginVersion, pluginFingerprint: node.pluginFingerprint, configVersion: node.configVersion, status: starts === 1 && node.nodeId === "batch-1" ? "partial_failure" : "completed", inputFingerprint: node.nodeId, output: node.nodeId === "batch-2" ? { result: artifacts.slice(0, starts === 1 ? 2 : 3) } : null, error: null, startedAt: now, finishedAt: now, ...(node.nodeId === "batch-1" ? { batchItems } : {}) })) } as FlowDocumentRun;
		run.status = "waiting";
		run.finishedAt = null;
		run.nodes.find(node => node.nodeId === "batch-6")!.status = "waiting";
		approvals = [{ approvalId: `save-${starts}`, flowId, runId, nodeId: "batch-6", toolName: "mcp_image_import_flow_images", reason: "Save successful image results", status: "pending", requiredConsent: null, createdAt: now, resolvedAt: null }];
		setTimeout(() => mockBackend.sendEvent("flow.node.state", { flowId, runId, nodeId: "batch-6", status: "waiting" }, { runId }), 50);
		return run;
	});
	mockBackend.setHandler("flow.approval.resolve", ({ params }) => {
		expect((params as { decision: string }).decision).toBe("approve");
		for (const item of artifacts.slice(0, starts === 1 ? 2 : 3)) saved.add(item.artifactId);
		approvals = [];
		run!.status = starts === 1 ? "partial_failure" : "completed";
		run!.finishedAt = now;
		run!.nodes.find(node => node.nodeId === "batch-6")!.status = "completed";
		return run;
	});
	const { mainWindow: page, electronApp } = await launchStudio();
	await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1100));
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Batch images", { exact: true }).first().click();
	const tableNode = page.locator('.react-flow__node[data-id="batch-0"]');
	await expect(tableNode.getByText(/3 requests · 3 images|3 次请求 · 3 张图片/)).toBeVisible();
	const tableBounds = (await tableNode.locator(".ant-table-wrapper").boundingBox())!;
	const nodeBounds = (await tableNode.boundingBox())!;
	expect(tableBounds.x + tableBounds.width).toBeLessThanOrEqual(nodeBounds.x + nodeBounds.width);
	await tableNode.getByRole("textbox", { name: /^(Prompt|提示词)$/ }).first().fill("edited first row");
	await page.getByRole("button", { name: /^(Run|运\s*行)$/ }).click();
	const batchNode = page.locator('.react-flow__node[data-id="batch-1"]');
	await expect(batchNode.getByText(/Completed 2 \/ 3|已完成 2 \/ 3/)).toBeVisible();
	await page.getByRole("button", { name: /^(Approve|批\s*准)$/ }).click();
	await expect.poll(() => saved.size).toBe(2);
	expect((nodes[0]!.config.rows as typeof rows)[0]!.prompt).toBe("edited first row");
	const gallery = page.locator('.react-flow__node[data-id="batch-2"]');
	await gallery.getByRole("combobox").last().click();
	await page.locator('.ant-select-item-option[title="2"]').click();
	await expect(gallery.locator('img.ant-image-img')).toHaveCount(4);
	const reads = mockBackend.getRequests("flow.get").length;
	await batchNode.getByRole("button", { name: /Retry failed items|重试失败项/ }).click();
	await expect(batchNode.getByText(/Completed 3 \/ 3|已完成 3 \/ 3/)).toBeVisible();
	await page.getByRole("button", { name: /^(Approve|批\s*准)$/ }).click();
	await expect.poll(() => saved.size).toBe(3);
	expect(starts).toBe(2);
	// A new run verifies the saved graph once; incremental item events add no reads.
	expect(mockBackend.getRequests("flow.get").length).toBe(reads + 1);
	await page.screenshot({ path: test.info().outputPath("batch-comparison.png") });
});
