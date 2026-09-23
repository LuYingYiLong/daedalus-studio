import { test, expect } from "./fixtures/studio";
import { installFlowPerformanceScenario } from "./fixtures/flow-performance";
import type { FlowDocumentNodeStatus } from "../../src/renderer/src/platform/rpc/types";

test("keeps graph geometry while culling controls and preserving editing drafts", async ({
	launchStudio,
	mockBackend,
}) => {
	test.setTimeout(90_000);
	installFlowPerformanceScenario(mockBackend, 200);
	const { mainWindow: page } = await launchStudio();
	await page
		.locator(".ant-segmented-item")
		.filter({ hasText: /^Flow$/ })
		.click();
	await page.getByText("Performance 200", { exact: true }).first().click();
	await expect(page.locator(".react-flow__node")).toHaveCount(200);
	const first = page.locator('[data-flow-shell="perf-0"]');
	await expect(first).toHaveAttribute("data-flow-render-mode", "full");
	const input = first.locator("textarea").first();
	await input.fill("first edit");
	await page.waitForTimeout(300);
	await input.fill("second edit");
	await page.waitForTimeout(300);
	await first.locator("header").click();
	await page.keyboard.press("Control+z");
	await expect(input).toHaveValue("Node 0");
	await page.keyboard.press("Control+Shift+z");
	await expect(input).toHaveValue("second edit");
	await input.fill("草稿不能丢失");
	const countBefore = mockBackend.getRequests("flow.patch.commit").length;
	const pane = (await page.locator(".react-flow").boundingBox())!;
	await page.mouse.move(pane.x + pane.width * 0.7, pane.y + pane.height * 0.6);
	await page.mouse.down({ button: "middle" });
	await page.mouse.move(pane.x + pane.width * 0.7 - 250, pane.y + pane.height * 0.6 - 50, { steps: 12 });
	await expect(first).toHaveAttribute("data-flow-render-mode", "full");
	const during = mockBackend.getRequests("flow.patch.commit").slice(countBefore);
	expect(
		during
			.flatMap((request) => (request.params as { operations: { kind: string }[] }).operations ?? [])
			.filter((operation) => operation.kind === "node.move" || operation.kind === "viewport.update"),
	).toHaveLength(0);
	await page.mouse.up({ button: "middle" });
	await page.waitForTimeout(400);
	const portBefore = await first
		.locator(".react-flow__handle.source")
		.first()
		.evaluate((element) => {
			const node = element.closest(".react-flow__node")!.getBoundingClientRect(),
				port = element.getBoundingClientRect();
			const zoom = new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")!).transform).a;
			return { x: (port.x + port.width / 2 - node.x) / zoom, y: (port.y + port.height / 2 - node.y) / zoom };
		});
	await page.getByRole("button", { name: /^(?:Fit canvas|适应画布)$/ }).click();
	await expect.poll(async () => page.locator('[data-flow-render-mode="full"]').count()).toBe(0);
	await expect(page.locator(".react-flow__node")).toHaveCount(200);
	await expect(page.locator("[data-flow-canvas-layer]")).toHaveAttribute("data-flow-edge-count", "400");
	await expect(page.locator(".react-flow__edge")).toHaveCount(0);
	const portAfter = await first
		.locator(".react-flow__handle.source")
		.first()
		.evaluate((element) => {
			const node = element.closest(".react-flow__node")!.getBoundingClientRect(),
				port = element.getBoundingClientRect();
			const zoom = new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")!).transform).a;
			return { x: (port.x + port.width / 2 - node.x) / zoom, y: (port.y + port.height / 2 - node.y) / zoom };
		});
	expect(Math.abs(portAfter.x - portBefore.x)).toBeLessThan(1);
	expect(Math.abs(portAfter.y - portBefore.y)).toBeLessThan(1);
	await first.dblclick();
	await expect(first).toHaveAttribute("data-flow-render-mode", "full");
	await expect(first.locator("textarea").first()).toHaveValue("草稿不能丢失");
	await expect
		.poll(() =>
			mockBackend
				.getRequests("flow.patch.commit")
				.flatMap(
					(request) =>
						(request.params as { operations: { kind: string; payload: { config?: { text?: string } } }[] }).operations,
				)
				.some((operation) => operation.payload.config?.text === "草稿不能丢失"),
		)
		.toBe(true);
	await expect(page.locator("iframe")).toHaveCount(0);
	await expect(first.locator("textarea").first()).toBeFocused();
	await page.keyboard.press("Escape");
	for (let cycle = 0; cycle < 3; cycle++) {
		await page.getByRole("button", { name: /^(?:Fit canvas|适应画布)$/ }).click();
		await expect.poll(() => page.locator('[data-flow-render-mode="full"]').count()).toBe(0);
		await first.dblclick();
		await expect(first.locator("textarea").first()).toHaveValue("草稿不能丢失");
		await expect(first.locator("textarea").first()).toBeFocused();
		await expect(page.locator(".react-flow__node")).toHaveCount(200);
		expect(await page.locator('[data-flow-render-mode="full"]').count()).toBeLessThan(80);
		await page.keyboard.press("Escape");
	}
});

test("patches node runs without remounting unrelated controls or reading full snapshots", async ({
	launchStudio,
	mockBackend,
}) => {
	installFlowPerformanceScenario(mockBackend, 12, true);
	const { mainWindow: page } = await launchStudio();
	await page
		.locator(".ant-segmented-item")
		.filter({ hasText: /^Flow$/ })
		.click();
	await page.getByText("Performance 12", { exact: true }).first().click();
	const first = page.locator('[data-flow-node-id="perf-0"]');
	const second = page.locator('[data-flow-node-id="perf-1"]');
	await expect(first.locator("img")).toBeVisible();
	await expect(second).toBeVisible();
	await page.waitForTimeout(500);
	const unrelatedCommits = await first.getAttribute("data-flow-commit-count");
	const previousCommits = Number(await second.getAttribute("data-flow-commit-count"));
	const reads = mockBackend.getRequests("flow.get").length;
	for (let index = 0; index < 20; index++)
		mockBackend.sendEvent("flow.node.state", {
			flowId: "flow-performance",
			runId: "perf-run",
			nodeId: "perf-1",
			status: "completed",
			progress: index / 20,
		});
	await expect
		.poll(async () => Number(await second.getAttribute("data-flow-commit-count")))
		.toBeGreaterThan(previousCommits);
	await expect(first).toHaveAttribute("data-flow-commit-count", unrelatedCommits!);
	expect(mockBackend.getRequests("flow.get").length).toBe(reads);
	await expect(page.locator("iframe")).toHaveCount(0);
});

test("shows the node border beam only while running and exposes failure details in the header", async ({
	launchStudio,
	mockBackend,
}) => {
	installFlowPerformanceScenario(mockBackend, 12, true);
	const { mainWindow: page } = await launchStudio();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 12", { exact: true }).first().click();
	const node = page.locator('[data-flow-node-id="perf-1"]');
	const card = node.locator("article");
	const beam = node.locator(".ant-border-beam");
	const failed = node.locator('header [role="img"]');
	await expect(card).toHaveAttribute("data-node-status", "completed");
	await expect(beam).toBeHidden();
	await expect(node.locator('header [role="status"]')).toHaveCount(0);
	const input = await node.locator("textarea").first().elementHandle();
	const setStatus = async (status: FlowDocumentNodeStatus, error: string | null = null): Promise<void> => {
		mockBackend.sendEvent("flow.node.state", {
			flowId: "flow-performance", runId: "perf-run", nodeId: "perf-1", status,
			nodeRun: {
				runId: "perf-run", nodeId: "perf-1", typeId: "builtin/text", pluginVersion: "1.0.0",
				pluginFingerprint: "perf:text:1", configVersion: 1, status, error,
				inputFingerprint: null, output: null, startedAt: null, finishedAt: null,
			},
		});
		await expect(card).toHaveAttribute("data-node-status", status);
	};
	await setStatus("running");
	await expect(beam).toBeVisible();
	await expect(failed).toHaveCount(0);
	for (const status of ["waiting", "completed", "cached", "cancelled", "skipped", "queued", "idle"] as const) {
		await setStatus(status);
		await expect(beam).toBeHidden();
		await expect(failed).toHaveCount(0);
	}
	const error = "Provider request timed out. Please retry.";
	await setStatus("failed", error);
	await expect(beam).toBeHidden();
	await expect(failed).toBeVisible();
	await failed.hover();
	await expect(page.getByRole("tooltip")).toHaveText(error);
	await setStatus("running");
	await expect(beam).toBeVisible();
	await expect(failed).toHaveCount(0);
	await expect(page.getByRole("tooltip")).toBeHidden();
	await setStatus("failed", " ");
	await failed.focus();
	await expect(page.getByRole("tooltip")).toContainText(/未提供错误详情|No error details were provided/);
	expect(await input!.evaluate((element) => element.isConnected)).toBe(true);
});
