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
	await page.waitForTimeout(700);
	const original = await dimensions(a);
	const source = (await a.locator(".react-flow__handle.source").boundingBox())!;
	const target = (await b.locator(".react-flow__handle.target").boundingBox())!;
	await page.mouse.click((source.x + source.width + target.x) / 2, (source.y + source.height / 2 + target.y + target.height / 2) / 2);
	const edge = page.locator('.react-flow__edge[data-id="perf-edge-0"]');
	await expect(edge).toBeVisible();
	const colors = await edge.locator("stop").evaluateAll(stops => stops.map(stop => stop.getAttribute("stop-color")));
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
	await expect(page.locator("[data-flow-canvas-layer]")).toHaveAttribute("data-flow-edge-count", "8");
	const left = b.locator('[data-flow-collapsed-ports="input"]');
	await expect(left).toHaveCSS("background-color", "rgb(140, 140, 140)");
	await expect.poll(async () => {
		const capsuleA = (await a.locator('[data-flow-collapsed-ports="output"]').boundingBox())!;
		const capsuleB = (await left.boundingBox())!;
		await page.mouse.move(capsuleA.x + 20, capsuleA.y - 20);
		await page.mouse.move((capsuleA.x + capsuleA.width + capsuleB.x) / 2, (capsuleA.y + capsuleA.height / 2 + capsuleB.y + capsuleB.height / 2) / 2);
		return edge.count();
	}).toBe(1);
	await expect.poll(async () => {
		const end = await edge.locator(".react-flow__edge-path").evaluate(element => {
			const path = element as SVGPathElement, point = path.getPointAtLength(path.getTotalLength());
			const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!);
			return { x: screen.x, y: screen.y };
		});
		const capsule = (await left.boundingBox())!;
		return Math.max(Math.abs(end.x - capsule.x), Math.abs(end.y - capsule.y - capsule.height / 2));
	}).toBeLessThan(2);
	expect(await edge.locator("stop").evaluateAll(stops => stops.map(stop => stop.getAttribute("stop-color")))).toEqual(colors);
	await page.screenshot({ path: test.info().outputPath("collapsed-nodes.png") });
	const header = (await a.locator("header").boundingBox())!;
	await page.mouse.move(header.x + 100, header.y + header.height / 2);
	await page.mouse.down();
	await page.mouse.move(header.x + 196, header.y + header.height / 2 + 48, { steps: 8 });
	await page.mouse.up();
	await page.waitForTimeout(400);
	expect(await dimensions(a)).toEqual(folded);
	for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
	await expect(a.locator("[data-flow-shell]")).toHaveAttribute("data-flow-render-mode", "outline");
	await page.getByRole("button", { name: "Fit View" }).click();
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
