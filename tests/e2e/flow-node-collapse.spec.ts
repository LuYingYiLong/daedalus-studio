import type { Locator } from "@playwright/test";
import { test, expect } from "./fixtures/studio";
import { installFlowPerformanceScenario } from "./fixtures/flow-performance";

const dimensions = (node: Locator) => node.evaluate(element => ({
	width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight,
}));

test("collapses to the header, groups anchors without changing edges, and restores dimensions and drafts", async ({ launchStudio, mockBackend }) => {
	installFlowPerformanceScenario(mockBackend, 4);
	const { mainWindow: page } = await launchStudio();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 4", { exact: true }).first().click();
	const a = page.locator('.react-flow__node[data-id="perf-0"]');
	const b = page.locator('.react-flow__node[data-id="perf-1"]');
	await expect(a.locator("textarea")).toBeVisible();
	const canvas = page.locator("[data-flow-canvas-layer]");
	await expect(canvas).toHaveAttribute("data-flow-edge-count", "8");
	const original = await dimensions(a);
	await a.locator("textarea").fill("未保存草稿");
	const reads = mockBackend.getRequests("flow.get").length;
	await a.getByRole("button", { name: /Collapse node|折叠节点/ }).click();
	await b.getByRole("button", { name: /Collapse node|折叠节点/ }).click();
	await expect(a.locator("textarea")).toHaveCount(0);
	await expect(a.locator(".react-flow__resize-control")).toHaveCount(0);
	await expect(a.locator("[data-flow-collapsed-ports]")).toHaveCount(2);
	await expect(a.getByRole("button", { name: /Expand node|展开节点/ })).toHaveAttribute("aria-expanded", "false");
	const folded = await dimensions(a);
	expect(folded.width).toBe(original.width);
	expect(folded.height).toBeLessThan(original.height);
	const headerOnlyHeight = await a.locator("header").evaluate(header => {
		const border = getComputedStyle(header.parentElement!);
		return (header as HTMLElement).offsetHeight + parseFloat(border.borderTopWidth) + parseFloat(border.borderBottomWidth);
	});
	expect(Math.abs(folded.height - headerOnlyHeight)).toBeLessThanOrEqual(1);
	await expect(canvas).toHaveAttribute("data-flow-edge-count", "8");
	const left = b.locator('[data-flow-collapsed-ports="input"]');
	await expect(left).toHaveCSS("background-color", "rgb(140, 140, 140)");
	await expect.poll(async () => {
		const outputCapsule = (await a.locator('[data-flow-collapsed-ports="output"]').boundingBox())!;
		const inputCapsule = (await left.boundingBox())!;
		const source = (await a.locator(".react-flow__handle.source").boundingBox())!;
		const target = (await b.locator(".react-flow__handle.target").boundingBox())!;
		return Math.max(
			Math.abs(source.x + source.width - outputCapsule.x - outputCapsule.width),
			Math.abs(source.y + source.height / 2 - outputCapsule.y - outputCapsule.height / 2),
			Math.abs(target.x - inputCapsule.x),
			Math.abs(target.y + target.height / 2 - inputCapsule.y - inputCapsule.height / 2),
		);
	}).toBeLessThanOrEqual(2);
	await page.screenshot({ path: test.info().outputPath("collapsed-nodes.png") });
	const header = (await a.locator("header").boundingBox())!;
	await page.mouse.move(header.x + 100, header.y + header.height / 2);
	await page.mouse.down();
	await page.mouse.move(header.x + 196, header.y + header.height / 2 + 48, { steps: 8 });
	await page.mouse.up();
	await page.waitForTimeout(400);
	expect(await dimensions(a)).toEqual(folded);
	for (let i = 0; i < 12; i++) await page.getByRole("button", { name: /^(?:Zoom out|缩小画布)$/ }).click();
	await expect(a.locator("[data-flow-shell]")).toHaveAttribute("data-flow-render-mode", "outline");
	await page.getByRole("button", { name: /^(?:Fit canvas|适应画布)$/ }).click();
	await expect(a.locator("[data-flow-shell]")).toHaveAttribute("data-flow-render-mode", "full");
	expect(await dimensions(a)).toEqual(folded);
	await a.getByRole("button", { name: /Expand node|展开节点/ }).click();
	await expect(a.locator("textarea")).toHaveValue("未保存草稿");
	await expect(a.locator("[data-flow-collapsed-ports]")).toHaveCount(0);
	await expect.poll(() => dimensions(a)).toEqual(original);
	const role = a.locator("[data-flow-node-role]");
	await expect(role).toHaveText("Node 0");
	await role.dblclick();
	const titleInput = a.locator("header").getByRole("textbox", { name: /Double-click to rename node|双击重命名节点/ });
	await expect(titleInput).toHaveValue("Node 0");
	await titleInput.fill("Renamed text node");
	await titleInput.press("Enter");
	await expect(role).toHaveText("Renamed text node");
	await expect.poll(() => mockBackend.getRequests("flow.patch.commit").some(request =>
		(request.params as { operations: Array<{ kind: string; payload: Record<string, unknown> }> }).operations.some(operation =>
			operation.kind === "node.update" && operation.payload.nodeId === "perf-0" && operation.payload.title === "Renamed text node",
		),
	)).toBe(true);
	const operations = mockBackend.getRequests("flow.patch.commit").flatMap(request =>
		(request.params as { operations: Array<{ kind: string }> }).operations);
	expect(operations.some(operation => ["node.resize", "edge.create", "edge.delete"].includes(operation.kind))).toBe(false);
	expect(mockBackend.getRequests("flow.get").length).toBe(reads);
});

test("node and canvas context menus support selection, collapse, duplicate, copy-paste, and adding nodes", async ({ launchStudio, mockBackend }) => {
	installFlowPerformanceScenario(mockBackend, 2);
	const { mainWindow: page } = await launchStudio();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 2", { exact: true }).first().click();
	const node = page.locator('.react-flow__node[data-id="perf-0"]');
	await node.click({ button: "right" });
	await expect(node).toHaveClass(/selected/);
	const paneRect = (await page.locator(".react-flow__pane").first().boundingBox())!;
	const collapseMenuItem = page.getByRole("menuitem", { name: /Collapse node|折叠节点/ });
	await page.mouse.click(paneRect.x + paneRect.width - 28, paneRect.y + paneRect.height - 28);
	await expect(collapseMenuItem).toBeHidden();
	await node.click({ button: "right" });
	await page.getByRole("menuitem", { name: /Collapse node|折叠节点/ }).click();
	await expect(node.locator("textarea")).toHaveCount(0);

	await node.click({ button: "right" });
	await page.getByRole("menuitem", { name: /Expand node|展开节点/ }).click();
	await expect(node.locator("textarea")).toBeVisible();
	await node.click({ button: "right" });
	await page.getByRole("menuitem", { name: /Rename node|重命名节点/ }).click();
	const titleInput = node.getByRole("textbox", { name: /Double-click to rename node|双击重命名节点/ });
	await titleInput.fill("Context renamed");
	await titleInput.press("Enter");
	await expect(node.locator("[data-flow-node-role]")).toHaveText("Context renamed");

	await node.click({ button: "right" });
	await page.getByRole("menuitem", { name: /Copy node|复制节点/ }).click();
	const canvas = page.locator(".react-flow__pane").first();
	const rect = (await canvas.boundingBox())!;
	await page.mouse.click(rect.x + rect.width - 28, rect.y + rect.height - 28, { button: "right" });
	await page.getByRole("menuitem", { name: /Paste node|粘贴节点/ }).click();
	await expect(page.locator(".react-flow__node")).toHaveCount(3);

	await page.mouse.click(rect.x + rect.width - 28, rect.y + rect.height - 28, { button: "right" });
	const addNodeMenuItem = page.getByRole("menuitem", { name: /Add node|添加节点/ });
	await addNodeMenuItem.hover();
	const pickerSearch = page.getByRole("dialog").getByPlaceholder(/Search nodes|搜索节点/);
	await expect(pickerSearch).toBeVisible();
	await expect(addNodeMenuItem).toBeVisible();
	await page.mouse.click(rect.x + rect.width - 28, rect.y + rect.height - 28);
	await expect(pickerSearch).toBeHidden();
	await expect(addNodeMenuItem).toBeHidden();

	await node.click({ button: "right" });
	await page.getByRole("menuitem", { name: /Duplicate node|拷贝节点/ }).click();
	await expect(page.locator(".react-flow__node")).toHaveCount(4);
});
