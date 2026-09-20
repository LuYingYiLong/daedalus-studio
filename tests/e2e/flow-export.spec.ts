import { join } from "node:path";
import { test, expect } from "./fixtures/studio";
import { installFlowPerformanceScenario } from "./fixtures/flow-performance";

test("Flow tree exports after saved edits and restores collapsed layout on reload", async ({ launchStudio, mockBackend, userDataDir }) => {
	installFlowPerformanceScenario(mockBackend, 4);
	const exports: unknown[] = [];
	mockBackend.setHandler("flow.export", ({ params }) => {
		exports.push(params);
		return { exported: true, missingFileCount: 0 };
	});
	const { mainWindow: page, electronApp } = await launchStudio();
	const destination = join(userDataDir, "workflow.sqlite");
	await electronApp.evaluate(({ dialog, app }, filePath) => {
		app.setPath("documents", app.getPath("userData"));
		dialog.showSaveDialog = (async () => ({ canceled: false, filePath })) as typeof dialog.showSaveDialog;
	}, destination);
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	const entry = page.getByText("Performance 4", { exact: true }).first();
	await entry.click();
	const node = page.locator('.react-flow__node[data-id="perf-0"]');
	await expect(node.locator("textarea")).toBeVisible();
	await node.locator("textarea").fill("导出草稿");
	await node.getByRole("button", { name: /Collapse node|折叠节点/ }).click();
	await expect(node.locator("[data-flow-shell]")).toHaveAttribute("data-flow-collapsed", "true");
	await entry.click({ button: "right" });
	const exportItem = page.getByRole("menuitem", { name: /Export Flow data|导出 Flow 数据/ });
	await expect(exportItem).toBeVisible();
	await expect(page.getByRole("menuitem").last()).toHaveText(/Export Flow data|导出 Flow 数据/);
	await exportItem.click();
	await expect.poll(() => exports.length).toBe(1);
	expect(exports[0]).toEqual({ flowId: "flow-performance", destinationPath: destination });
	const exportTime = mockBackend.getRequests("flow.export")[0]!.receivedAt;
	const commits = mockBackend.getRequests("flow.patch.commit").filter(request => request.receivedAt <= exportTime);
	const operations = commits.flatMap(request => (request.params as { operations: Array<{ kind: string; payload: Record<string, unknown> }> }).operations);
	expect(operations.some(op => op.kind === "node.collapse" && op.payload.collapsed === true)).toBe(true);
	expect(operations.some(op => op.kind === "node.update" && (op.payload.config as { text: string }).text === "导出草稿")).toBe(true);
	await page.reload();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 4", { exact: true }).first().click();
	await expect(node.getByRole("button", { name: /Expand node|展开节点/ })).toBeVisible();
	await expect(node.locator("textarea")).toHaveCount(0);
	await node.getByRole("button", { name: /Expand node|展开节点/ }).click();
	await expect(node.locator("textarea")).toHaveValue("导出草稿");
	await electronApp.evaluate(({ dialog }) => {
		dialog.showSaveDialog = (async () => ({ canceled: true, filePath: "" })) as typeof dialog.showSaveDialog;
	});
	await page.getByText("Performance 4", { exact: true }).first().click({ button: "right" });
	await page.getByRole("menuitem", { name: /Export Flow data|导出 Flow 数据/ }).click();
	await page.waitForTimeout(250);
	expect(exports).toHaveLength(1);
});
