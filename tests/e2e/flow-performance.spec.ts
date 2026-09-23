import { test, expect } from "./fixtures/studio";
import { installFlowPerformanceScenario } from "./fixtures/flow-performance";
import { readFile, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";

test.describe("Flow GPU performance", () => {
	test.skip(process.env.FLOW_PERF !== "1", "Run with FLOW_PERF=1 on the reference GPU machine");
	for (const count of [200, 500]) {
		test(`${count} nodes and ${count * 2} edges`, async ({ launchStudio, mockBackend }, testInfo) => {
			test.setTimeout(180_000);
			installFlowPerformanceScenario(mockBackend, count, true);
			const { mainWindow: page, electronApp } = await launchStudio({ hardwareAcceleration: true });
			await electronApp.evaluate(({ BrowserWindow }) => {
				BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000);
			});
			await page
				.locator(".ant-segmented-item")
				.filter({ hasText: /^(Flow|流)$/ })
				.click();
			await page.getByText(`Performance ${count}`, { exact: true }).first().click();
			await expect(page.locator(".react-flow__node").first()).toBeAttached();
			const canvas = page.locator(".react-flow");
			const box = (await canvas.boundingBox())!;
			await page.getByRole("button", { name: /^(?:Fit canvas|适应画布)$/ }).click();
			await page.waitForTimeout(350);
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			const initialZoom = await page
				.locator(".react-flow__viewport")
				.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
			await page.mouse.wheel(0, -Math.log2(0.9 / initialZoom) / 0.002);
			await page.waitForTimeout(1200);
			await expect(page.locator("iframe")).toHaveCount(0);
			const gpu = await electronApp.evaluate(async ({ app }) => ({
				features: app.getGPUFeatureStatus(),
				info: await app.getGPUInfo("complete"),
			}));
			const renderer = await page.evaluate(() => {
				const gl = document.createElement("canvas").getContext("webgl2");
				const info = gl?.getExtension("WEBGL_debug_renderer_info");
				const value = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
				gl?.getExtension("WEBGL_lose_context")?.loseContext();
				return value;
			});
			await testInfo.attach("controls.png", { body: await page.screenshot(), contentType: "image/png" });
			await electronApp.evaluate(async ({ contentTracing }) => {
				await contentTracing.startRecording({
					included_categories: ["devtools.timeline", "blink.user_timing", "v8", "cc", "gpu"],
				});
			});
			await page.evaluate(() => {
				Object.assign(window, { __DAEDALUS_FLOW_TRACE__: true });
				const sample = {
					frames: [] as number[],
					frameTimes: [] as number[],
					longTasks: [] as number[],
					marks: [] as { time: number; name: string }[],
					started: performance.now(),
					last: 0,
					active: true,
				};
				Object.assign(window, { __flowPerformanceSample: sample });
				const tick = (time: number): void => {
					if (!sample.active) return;
					if (sample.last) {
						sample.frames.push(time - sample.last);
						sample.frameTimes.push(time);
					}
					sample.last = time;
					requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
				const observer = new PerformanceObserver((entries) => {
					for (const entry of entries.getEntries()) sample.longTasks.push(entry.duration);
				});
				observer.observe({ entryTypes: ["longtask"] });
				Object.assign(window, { __flowPerformanceObserver: observer });
			});
			for (let sweep = 0; sweep < 12; sweep += 1) {
				if (sweep === 6) {
					await page.getByRole("button", { name: /^(?:Fit canvas|适应画布)$/ }).click();
					// 适配后的比例可能落在用户自定义 LOD 的滞回区，明确进入轮廓再测概览交互
					const fittedZoom = await page
						.locator(".react-flow__viewport")
						.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
					await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
					await page.mouse.wheel(0, Math.log2(fittedZoom / Math.min(fittedZoom, 0.12)) / 0.002);
					await expect(page.locator('[data-flow-render-mode="full"]')).toHaveCount(0);
					await page.waitForTimeout(900);
				}
				await page.evaluate((index) => {
					const sample = (window as unknown as { __flowPerformanceSample: { marks: { time: number; name: string }[] } })
						.__flowPerformanceSample;
					sample.marks.push({ time: performance.now(), name: `pan-${index}` });
				}, sweep);
				const direction = sweep % 2 === 0 ? -1 : 1;
				await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
				await page.mouse.down({ button: "middle" });
				await page.mouse.move(box.x + box.width * 0.5 + direction * 460, box.y + box.height * 0.55 + direction * 140, {
					steps: 24,
				});
				await page.mouse.up({ button: "middle" });
				await page.evaluate((index) => {
					const sample = (window as unknown as { __flowPerformanceSample: { marks: { time: number; name: string }[] } })
						.__flowPerformanceSample;
					sample.marks.push({ time: performance.now(), name: `stop-${index}` });
				}, sweep);
				await page.waitForTimeout(sweep % 2 === 0 ? 80 : 520);
				if (sweep < 6 && sweep % 3 === 0) {
					await page.mouse.wheel(0, direction * 220);
					await page.waitForTimeout(800);
				}
			}
			const metrics = await page.evaluate(() => {
				const host = window as unknown as {
					__flowPerformanceSample: {
						frames: number[];
						frameTimes: number[];
						longTasks: number[];
						active: boolean;
						marks: { name: string; time: number }[];
					};
					__flowPerformanceObserver: PerformanceObserver;
				};
				host.__flowPerformanceSample.active = false;
				host.__flowPerformanceObserver.disconnect();
				const sorted = [...host.__flowPerformanceSample.frames].sort((a, b) => a - b);
				return {
					...host.__flowPerformanceSample,
					p95: sorted[Math.floor(sorted.length * 0.95)],
					p99: sorted[Math.floor(sorted.length * 0.99)],
					dpr: devicePixelRatio,
					nodeDOM: document.querySelectorAll("[data-node-type]").length,
					edgeDOM: document.querySelectorAll(".react-flow__edge").length,
				};
			});
			const phases = metrics.marks
				.filter((mark) => mark.name.startsWith("pan-"))
				.map((start) => {
					const stop = metrics.marks.find((mark) => mark.name === start.name.replace("pan-", "stop-"))!;
					const frames = metrics.frames
						.filter((_, i) => metrics.frameTimes[i]! >= start.time && metrics.frameTimes[i]! <= stop.time + 650)
						.sort((a, b) => a - b);
					return {
						name: start.name,
						p95: frames[Math.floor(frames.length * 0.95)],
						p99: frames[Math.floor(frames.length * 0.99)],
						startSpike: Math.max(
							0,
							...metrics.frames.filter(
								(_, i) => metrics.frameTimes[i]! >= start.time && metrics.frameTimes[i]! <= start.time + 120,
							),
						),
						stopSpike: Math.max(
							0,
							...metrics.frames.filter(
								(_, i) => metrics.frameTimes[i]! >= stop.time && metrics.frameTimes[i]! <= stop.time + 650,
							),
						),
					};
				});
			const tracePath = testInfo.outputPath("chromium-trace.json");
			await electronApp.evaluate(async ({ contentTracing }, path) => {
				await contentTracing.stopRecording(path);
			}, tracePath);
			const trace = JSON.parse(await readFile(tracePath, "utf8")) as { traceEvents: { name: string; dur?: number }[] };
			const traceSummary = Object.fromEntries(
				["Layout", "UpdateLayoutTree", "Paint", "RasterTask", "FunctionCall", "MinorGC", "MajorGC"].map((name) => {
					const entries = trace.traceEvents.filter((event) => event.name === name && event.dur);
					return [
						name,
						{
							count: entries.length,
							totalMs: entries.reduce((sum, event) => sum + event.dur! / 1000, 0),
							maxMs: Math.max(0, ...entries.map((event) => event.dur! / 1000)),
						},
					];
				}),
			);
			await testInfo.attach("flow-performance.json", {
				body: JSON.stringify(
					{
						count,
						hardware: { cpu: cpus()[0]?.model, memory: totalmem() },
						gpu,
						renderer,
						phases,
						traceSummary,
						metrics,
					},
					null,
					2,
				),
				contentType: "application/json",
			});
			await writeFile(
				testInfo.outputPath("metrics.json"),
				JSON.stringify(
					{
						count,
						hardware: { cpu: cpus()[0]?.model, memory: totalmem() },
						gpu,
						renderer,
						phases,
						traceSummary,
						metrics,
					},
					null,
					2,
				),
			);
			await page.screenshot({ path: testInfo.outputPath("overview.png") });
			await testInfo.attach("chromium-trace", { path: tracePath, contentType: "application/json" });
			await testInfo.attach("overview.png", { body: await page.screenshot(), contentType: "image/png" });
			console.log(
				JSON.stringify({
					count,
					p95: metrics.p95,
					p99: metrics.p99,
					longTasks: metrics.longTasks,
					nodeDOM: metrics.nodeDOM,
					edgeDOM: metrics.edgeDOM,
					phases,
					traceSummary,
				}),
			);
			expect(gpu.features.gpu_compositing).toBe("enabled");
			expect(renderer).toBeTruthy();
			expect(renderer).not.toMatch(/SwiftShader|llvmpipe|software|Microsoft Basic Render/i);
			if (count === 200 && process.env.FLOW_PERF_BASELINE !== "1") {
				expect(metrics.p95).toBeLessThanOrEqual(25);
				expect(metrics.p99).toBeLessThanOrEqual(50);
				for (const phase of phases) {
					expect(phase.p95, `${phase.name} p95`).toBeLessThanOrEqual(25);
					expect(phase.p99, `${phase.name} p99`).toBeLessThanOrEqual(50);
				}
			}
		});
	}
});
