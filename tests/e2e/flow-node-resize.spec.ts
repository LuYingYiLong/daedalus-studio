import type { Locator } from "@playwright/test";
import { test, expect } from "./fixtures/studio";
import { installFlowPerformanceScenario } from "./fixtures/flow-performance";

const layout = (node: Locator): Promise<{ x: number; y: number; width: number; height: number }> => node.evaluate(element => {
	const matrix = new DOMMatrix(getComputedStyle(element).transform);
	return { x: matrix.e, y: matrix.f, width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight };
});

test("expands the Output preview vertically and allows it to shrink again", async ({ launchStudio, mockBackend }) => {
	installFlowPerformanceScenario(mockBackend, 1, true);
	const { mainWindow: page } = await launchStudio();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 1", { exact: true }).first().click();
	const node = page.locator('.react-flow__node[data-id="perf-0"]');
	const preview = node.getByRole("region", { name: /Output result|输出内容/ });
	await expect(preview).toBeVisible();
	const picture = preview.locator("img");
	await expect(picture).toBeVisible();
	await page.getByRole("button", { name: /Disable grid snapping|关闭网格吸附/ }).click();
	await page.waitForTimeout(500);
	const original = await layout(node);
	const previewHeight = await preview.evaluate(element => (element as HTMLElement).offsetHeight);
	const pictureHeight = await picture.evaluate(element => (element as HTMLImageElement).offsetHeight);
	await node.locator("header").hover();
	const control = node.locator('.react-flow__resize-control:has([data-flow-resize-corner="bottom-right"])');
	const box = (await control.boundingBox())!;
	const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await page.mouse.move(point.x, point.y);
	await page.mouse.down();
	await page.mouse.move(point.x, point.y + 200, { steps: 10 });
	await page.mouse.up();
	await expect.poll(async () => (await layout(node)).height).toBe(original.height + 200);
	await expect.poll(() => preview.evaluate(element => (element as HTMLElement).offsetHeight)).toBe(previewHeight + 200);
	await expect.poll(() => picture.evaluate(element => (element as HTMLImageElement).offsetHeight)).toBe(pictureHeight + 200);
	await expect(picture).toHaveCSS("object-fit", "contain");
	await page.screenshot({ path: test.info().outputPath("output-media-preview.png") });
	await expect(preview).toHaveCSS("overflow-y", "auto");
	await page.mouse.down();
	await page.mouse.move(point.x, point.y, { steps: 10 });
	await page.mouse.up();
	await expect.poll(() => layout(node)).toEqual(original);
	await expect.poll(() => preview.evaluate(element => (element as HTMLElement).offsetHeight)).toBe(previewHeight);
	await expect.poll(() => picture.evaluate(element => (element as HTMLImageElement).offsetHeight)).toBe(pictureHeight);
});

test("resizes all four corners, persists dimensions, and only avoids neighbours after resize ends", async ({ launchStudio, mockBackend }) => {
	installFlowPerformanceScenario(mockBackend, 3);
	const { mainWindow: page } = await launchStudio();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 3", { exact: true }).first().click();
	const node = page.locator('.react-flow__node[data-id="perf-0"]');
	const neighbour = page.locator('.react-flow__node[data-id="perf-1"]');
	await expect(node.locator("textarea")).toBeVisible();
	await page.waitForTimeout(700);
	const original = await layout(node);
	const originalNeighbour = await layout(neighbour);
	const operations = () => mockBackend.getRequests("flow.patch.commit").flatMap(request =>
		(request.params as { operations: Array<{ kind: string; payload: { nodeId?: string; width?: number; height?: number; x?: number; y?: number } }> }).operations);
	for (const [corner, dx, dy, cursor] of [
		["bottom-right", 192, 96, "nwse-resize"], ["top-left", -48, -48, "nwse-resize"],
		["top-right", 48, -48, "nesw-resize"], ["bottom-left", -48, 48, "nesw-resize"],
	] as const) {
		await node.locator("header").hover();
		const control = node.locator(`.react-flow__resize-control:has([data-flow-resize-corner="${corner}"])`);
		await expect(control).toHaveCSS("opacity", "1");
		await expect(control).toHaveCSS("cursor", cursor);
		await expect(control).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
		const iconBox = (await control.locator("svg").boundingBox())!;
		const nodeBox = (await node.boundingBox())!;
		expect(iconBox.x).toBeGreaterThan(nodeBox.x);
		expect(iconBox.y).toBeGreaterThan(nodeBox.y);
		expect(iconBox.x + iconBox.width).toBeLessThan(nodeBox.x + nodeBox.width);
		expect(iconBox.y + iconBox.height).toBeLessThan(nodeBox.y + nodeBox.height);
		const box = (await control.boundingBox())!;
		const savedBefore = operations().length;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 10 });
		await page.waitForTimeout(300);
		expect(await layout(neighbour)).toEqual(originalNeighbour);
		expect(operations().slice(savedBefore).filter(operation => operation.kind === "node.resize" || operation.kind === "node.move")).toEqual([]);
		const resized = await layout(node);
		expect(resized.width).toBeGreaterThan(original.width);
		expect(resized.height).toBeGreaterThan(original.height);
		const fixedX = corner.endsWith("left") ? resized.x + resized.width : resized.x;
		const fixedY = corner.startsWith("top") ? resized.y + resized.height : resized.y;
		expect(fixedX).toBeCloseTo(corner.endsWith("left") ? original.x + original.width : original.x, 0);
		expect(fixedY).toBeCloseTo(corner.startsWith("top") ? original.y + original.height : original.y, 0);
		await page.mouse.up();
		const positions = await neighbour.evaluate(element => new Promise<number[]>(resolve => {
			const samples: number[] = [], started = performance.now();
			const sample = (): void => {
				samples.push(new DOMMatrix(getComputedStyle(element).transform).e);
				if (performance.now() - started < 400) requestAnimationFrame(sample);
				else resolve(samples);
			};
			requestAnimationFrame(sample);
		}));
		if (corner === "bottom-right") {
			expect(new Set(positions.map(x => Math.round(x))).size).toBeGreaterThan(3);
			for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
		}
		await expect.poll(() => operations().slice(savedBefore).filter(operation => operation.kind === "node.resize").length).toBe(1);
		await page.waitForTimeout(350);
		if (corner === "bottom-right") {
			const pushed = await layout(neighbour);
			expect(pushed.x).toBeGreaterThan(originalNeighbour.x);
			expect(Math.abs(pushed.x % 24)).toBe(0);
			expect(Math.abs(pushed.y % 24)).toBe(0);
		}
		await node.locator("header").click();
		await page.keyboard.press("Control+z");
		await expect.poll(() => layout(node)).toEqual(original);
		await expect.poll(() => layout(neighbour)).toEqual(originalNeighbour);
		await page.waitForTimeout(350);
	}
	// 普通拖动即使造成重叠，也不触发避让
	const header = (await node.locator("header").boundingBox())!;
	await page.mouse.move(header.x + 60, header.y + header.height / 2);
	await page.mouse.down();
	await page.mouse.move(header.x + 204, header.y + header.height / 2, { steps: 8 });
	await page.mouse.up();
	await page.waitForTimeout(500);
	expect(await layout(neighbour)).toEqual(originalNeighbour);
	await node.locator("header").click();
	await page.keyboard.press("Control+z");
	await expect.poll(() => layout(node)).toEqual(original);
	await page.getByRole("button", { name: /Disable grid snapping|关闭网格吸附/ }).click();
	await node.locator("header").hover();
	const control = node.locator('.react-flow__resize-control:has([data-flow-resize-corner="bottom-right"])');
	const box = (await control.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 37, box.y + box.height / 2 + 43, { steps: 6 });
	await page.mouse.up();
	const saved = await layout(node);
	expect(saved.width).toBeCloseTo(original.width + 37, 0);
	expect(saved.height).toBeCloseTo(original.height + 43, 0);
	await expect.poll(() => operations().some(operation => operation.kind === "node.resize" && operation.payload.width === saved.width)).toBe(true);
	const noOp = (await control.boundingBox())!;
	const savedBeforeClick = operations().length;
	await page.mouse.click(noOp.x + noOp.width / 2, noOp.y + noOp.height / 2);
	await page.waitForTimeout(350);
	expect(await layout(node)).toEqual(saved);
	expect(operations().length).toBe(savedBeforeClick);
	await page.screenshot({ path: test.info().outputPath("resize-handles.png") });
	await page.reload();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 3", { exact: true }).first().click();
	await expect(node.locator("textarea")).toBeVisible();
	await expect.poll(() => layout(node)).toEqual(saved);
	await node.locator("header").hover();
	const shrink = (await control.boundingBox())!;
	await page.mouse.move(shrink.x + shrink.width / 2, shrink.y + shrink.height / 2);
	await page.mouse.down();
	await page.mouse.move(shrink.x + shrink.width / 2 - 37, shrink.y + shrink.height / 2 - 43, { steps: 6 });
	await page.mouse.up();
	await expect.poll(() => layout(node)).toEqual(original);
});

test("animates avoidance while alternately resizing two vertical output nodes", async ({ launchStudio, mockBackend }) => {
	installFlowPerformanceScenario(mockBackend, 2, true, "vertical-output");
	const { mainWindow: page } = await launchStudio();
	await page.emulateMedia({ reducedMotion: "reduce" });
	expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 2", { exact: true }).first().click();
	const node = page.locator('.react-flow__node[data-id="perf-0"]');
	const neighbour = page.locator('.react-flow__node[data-id="perf-1"]');
	await expect(node.getByRole("region", { name: /Output result|输出内容/ })).toBeVisible();
	await page.waitForTimeout(700);
	await page.getByRole("button", { name: /Disable grid snapping|关闭网格吸附/ }).click();
	const sampleY = (target: Locator): Promise<number[]> => target.evaluate(element => new Promise<number[]>(resolve => {
		const values: number[] = [], started = performance.now();
		const sample = (): void => {
			values.push(new DOMMatrix(getComputedStyle(element).transform).f);
			if (performance.now() - started < 400) requestAnimationFrame(sample);
			else resolve(values);
		};
		requestAnimationFrame(sample);
	}));
	const sampledAnimations: number[][] = [];
	for (const [anchor, target, corner, dy] of [
		[node, neighbour, "bottom-right", 192],
		[neighbour, node, "top-left", -260],
	] as const) {
		await anchor.locator("header").hover();
		const control = anchor.locator(`.react-flow__resize-control:has([data-flow-resize-corner="${corner}"])`);
		const box = (await control.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 10 });
		await page.mouse.up();
		const samples = await sampleY(target);
		sampledAnimations.push(samples);
	}
	for (const samples of sampledAnimations) {
		const from = samples[0]!;
		const to = samples.at(-1)!;
		expect(Math.abs(to - from)).toBeGreaterThan(20);
		expect(samples.some(position => Math.abs(position - from) > 2 && Math.abs(position - to) > 2)).toBe(true);
	}
});

test("creates at the pointer's lower right and animates neighbours away without moving the new node", async ({ launchStudio, mockBackend }) => {
	installFlowPerformanceScenario(mockBackend, 3);
	const { mainWindow: page } = await launchStudio();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 3", { exact: true }).first().click();
	const first = page.locator('.react-flow__node[data-id="perf-0"]');
	const neighbour = page.locator('.react-flow__node[data-id="perf-1"]');
	await expect(first.locator("textarea")).toBeVisible();
	await page.waitForTimeout(700);
	await page.getByRole("button", { name: /Disable grid snapping|关闭网格吸附/ }).click();
	const before = await layout(neighbour);
	const box = (await first.boundingBox())!;
	const pointer = { x: box.x + box.width + 22, y: box.y + 80 };
	await page.mouse.click(pointer.x, pointer.y, { button: "right" });
	await page.getByRole("menuitem", { name: /Basic|基础/ }).hover();
	await page.getByRole("menuitem", { name: /^(Text|文本)$/ }).click();
	const created = page.locator('.react-flow__node:not([data-id^="perf-"])');
	await expect(created).toHaveCount(1);
	await expect(created.locator("textarea")).toBeVisible();
	const createdBox = (await created.boundingBox())!;
	expect(createdBox.x).toBeCloseTo(pointer.x + 32, 0);
	expect(createdBox.y).toBeCloseTo(pointer.y + 32, 0);
	const destination = await layout(created);
	await expect.poll(async () => (await layout(neighbour)).x).toBeGreaterThan(before.x);
	await page.waitForTimeout(400);
	expect(await layout(created)).toEqual(destination);
	await created.locator("header").click();
	await page.keyboard.press("Control+z");
	await expect(created).toHaveCount(0);
	await expect.poll(() => layout(neighbour)).toEqual(before);
});
