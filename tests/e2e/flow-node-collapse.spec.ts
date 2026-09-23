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
	const operations = mockBackend.getRequests("flow.patch.commit").flatMap(request =>
		(request.params as { operations: Array<{ kind: string }> }).operations);
	expect(operations.some(operation => ["node.resize", "edge.create", "edge.delete"].includes(operation.kind))).toBe(false);
	expect(mockBackend.getRequests("flow.get").length).toBe(reads);
});
