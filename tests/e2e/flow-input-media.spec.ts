import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, test } from "./fixtures/studio";
import type { FlowDocumentNode, FlowNodeTypeDefinition } from "../../src/renderer/src/platform/rpc/types";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcZkAAAAASUVORK5CYII=";

test("imports an external image into an editable Flow Input and previews its Artifact", async ({ launchStudio, mockBackend, userDataDir }) => {
	const now = "2026-09-26T00:00:00.000Z";
	const flowId = "flow-input-media-e2e";
	const nodeId = "node-input-media-e2e";
	const ref = {
		artifactId: "flow-artifact-input-media-e2e", flowId, runId: null, nodeId,
		mimeType: "image/png", sha256: "a".repeat(64), byteSize: 68,
		width: 1, height: 1, metadata: { source: "flow-input", originalName: "outside.png" },
		createdAt: now,
	};
	const definition: FlowNodeTypeDefinition = {
		typeId: "builtin/flow-input", pluginId: "builtin", pluginVersion: "4.0.0", pluginFingerprint: "builtin:flow-input:e2e",
		configVersion: 4, category: "basic", workspaceRequired: false, sideEffecting: false, executable: true,
		cachePolicy: "never", defaultTitle: "Flow Input", defaultConfig: { label: "Image", dataType: "image", cardinality: "one", defaultValue: null },
		configSchema: { type: "object", properties: {
			label: { type: "string" }, dataType: { type: "string", enum: ["text", "image", "video", "number"] },
			cardinality: { type: "string", enum: ["one", "many"] }, defaultValue: { "x-daedalus-control": "flow-input-value" },
		} },
		summaryFields: ["label", "dataType"], ui: { kind: "schema" },
		parameters: ["label", "dataType", "cardinality", "defaultValue"].map((field) => ({ id: field, label: field, mode: "fixed" as const, configField: field })),
		outputs: [{ id: "output", label: "Value", dataTypes: ["image"], defaultConnect: true }],
	};
	const flow = { flowId, title: "Image input", workspaceId: null, pinned: false, revision: 1, graphRevision: 1, layoutRevision: 1, approvalMode: "manual", viewport: { x: 100, y: 100, zoom: 1 }, archivedAt: null, createdAt: now, updatedAt: now };
	const node: FlowDocumentNode = {
		nodeId, flowId, typeId: definition.typeId, pluginId: "builtin", pluginVersion: definition.pluginVersion,
		pluginFingerprint: definition.pluginFingerprint, configVersion: definition.configVersion, title: "Image input",
		x: 0, y: 0, width: 420, height: 400, collapsed: false, config: { ...definition.defaultConfig },
		ports: [{ id: "output", label: "Value", direction: "output", dataTypes: ["image"], required: false, multiple: true, defaultConnect: true }],
		status: "idle", createdAt: now, updatedAt: now,
	};
	mockBackend.setHandler("flow.list", () => ({ flows: [flow] }));
	mockBackend.setHandler("flow.get", () => ({ flow, nodes: [node], edges: [], runs: [] }));
	mockBackend.setHandler("flow.node.types.list", () => ({ nodes: [definition], generation: "flow-parameters-2" }));
	mockBackend.setHandler("flow.tools.list", () => ({ tools: [] }));
	mockBackend.setHandler("flow.approval.list", () => ({ approvals: [] }));
	mockBackend.setHandler("flow.artifact.list", () => ({ artifacts: [] }));
	mockBackend.setHandler("flow.artifact.import", ({ params }) => {
		expect((params as { kind: string }).kind).toBe("image");
		return { ref };
	});
	for (const method of ["flow.artifact.get", "flow.artifact.thumbnail"])
		mockBackend.setHandler(method, () => ({ ref, dataBase64: png }));
	mockBackend.setHandler("flow.patch.commit", ({ params }) => {
		const operations = (params as { generation: string; operations: Array<{ mutationId: string; kind: string; payload: Record<string, unknown> }> }).operations;
		for (const operation of operations) if (operation.kind === "node.update" && operation.payload.config)
			node.config = operation.payload.config as Record<string, unknown>;
		return { flowId, graphRevision: ++flow.graphRevision, layoutRevision: flow.layoutRevision, operations, acceptedMutationIds: operations.map((operation) => operation.mutationId) };
	});
	const sourcePath = join(userDataDir, "outside.png");
	await writeFile(sourcePath, Buffer.from(png, "base64"));
	const { mainWindow: page, electronApp } = await launchStudio();
	await electronApp.evaluate(({ dialog }, filePath) => {
		dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [filePath] })) as typeof dialog.showOpenDialog;
	}, sourcePath);
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Image input", { exact: true }).first().click();
	const shell = page.locator(`[data-flow-node-id="${nodeId}"]`);
	await shell.getByRole("button", { name: /Choose file|选择文件/ }).click();
	await expect.poll(() => (node.config.defaultValue as { artifactId?: string } | null)?.artifactId).toBe(ref.artifactId);
	await expect(shell.locator("input.ant-input[readonly]")).toHaveValue("outside.png");
	await expect(shell.locator("img.ant-image-img")).toBeVisible();
});
