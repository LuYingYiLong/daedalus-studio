import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	chromium,
	type Browser,
	type BrowserContext,
	type Page,
	type CDPSession,
} from "playwright";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { createExternalDomRuntime } from "../../src/main/services/browser/external-dom-runtime";

const cursorSvg = readFileSync(
	new URL("../../src/renderer/src/assets/icons/ai-cursor.svg", import.meta.url),
	"utf8",
);
describe("isolated browser execution against a local form", () => {
	let browser: Browser, context: BrowserContext, server: Server, origin: string;
	beforeAll(async () => {
		server = createServer((_req, res) => {
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.end(
				'<!doctype html><title>Test only</title><form action="/submitted"><label>Name<input id="name" name="name"></label><label>Password<input type="password" value="local-test-secret"></label><button id="submit">Send</button></form><button type="button" id="other">Other</button><script>window.submits=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submits++}</script>',
			);
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
		browser = await chromium.launch({ headless: true });
		context = await browser.newContext();
		await context.route("**/*", (route) =>
			route.request().url().startsWith(origin)
				? route.continue()
				: route.abort(),
		);
	}, 30000);
	afterAll(async () => {
		await context?.close();
		await browser?.close();
		await new Promise<void>((resolve) => server?.close(() => resolve()));
	});
	async function pageRuntime(): Promise<{
		page: Page;
		cdp: CDPSession;
		call(op: string, args?: object): Promise<Record<string, any>>;
		setVisibility(hidden: boolean): Promise<void>;
	}> {
		const page = await context.newPage();
		await page.goto(origin);
		const cdp = await context.newCDPSession(page),
			tree = await cdp.send("Page.getFrameTree"),
			world = await cdp.send("Page.createIsolatedWorld", {
				frameId: tree.frameTree.frame.id,
				worldName: "daedalus-test",
			});
		await cdp.send("Runtime.evaluate", {
			contextId: world.executionContextId,
			expression: `(${createExternalDomRuntime.toString()})(${JSON.stringify({ cursorSvg, color: "#488fc1" })})`,
		});
		const call = async (
			op: string,
			args: object = {},
		): Promise<Record<string, any>> => {
			const result = await cdp.send("Runtime.evaluate", {
				contextId: world.executionContextId,
				expression: `globalThis.__daedalusExternal(${JSON.stringify(op)},${JSON.stringify(args)})`,
				returnByValue: true,
			});
			if (result.exceptionDetails)
				throw new Error(
					result.exceptionDetails.exception?.description || "evaluation failed",
				);
			return result.result.value;
		};
		await call("activate", { generation: "test-generation" });
		const setVisibility = async (hidden: boolean): Promise<void> => {
			// Headless Chromium 不模拟标签页遮挡；仅在测试隔离 world 注入可见性事件
			await cdp.send("Runtime.evaluate", {
				contextId: world.executionContextId,
				expression: `Object.defineProperty(document, 'hidden', { configurable: true, value: ${hidden} }); document.dispatchEvent(new Event('visibilitychange'))`,
			});
		};
		return { page, cdp, call, setVisibility };
	}
	it("keeps the read-only cursor visible across idle periods and scrolling while its lease is alive", async () => {
		const { page, cdp, call } = await pageRuntime();
		const feedback = page.locator('[data-daedalus-feedback="true"]');
		await feedback.waitFor({ state: "visible" });
		expect(await feedback.getAttribute("data-activity")).toBe("reading");
		// 检查 closed shadow 内真正的 SVG，不只检查空宿主节点存在
		const { root } = await cdp.send("DOM.getDocument", {
			depth: -1,
			pierce: true,
		});
		const findFeedback = (node: typeof root): typeof root | undefined =>
			node.attributes?.includes("data-daedalus-feedback")
				? node
				: node.children?.map(findFeedback).find(Boolean);
		const shadow = findFeedback(root)?.shadowRoots?.[0];
		expect(shadow?.shadowRootType).toBe("closed");
		expect(JSON.stringify(shadow)).toContain('"localName":"svg"');
		expect(JSON.stringify(shadow)).not.toContain('"nodeValue":"AI"');
		await page.screenshot({
			path: "test-results/browser-feedback/reading.png",
		});
		const first = await feedback.elementHandle();
		for (let i = 0; i < 4; i++) {
			await new Promise((resolve) => setTimeout(resolve, 1500));
			await call("heartbeat", { generation: "test-generation" });
			expect(await feedback.isVisible()).toBe(true);
		}
		await call("wait", { condition: "load" });
		expect(await feedback.getAttribute("data-activity")).toBe("waiting");
		await page.evaluate(() => {
			document.body.style.height = "5000px";
		});
		await call("scroll", { direction: "down", pages: 0.5 });
		expect(await feedback.getAttribute("data-activity")).toBe("scroll");
		await page.screenshot({
			path: "test-results/browser-feedback/scrolling.png",
		});
		await call("observe");
		expect(await first!.evaluate((element) => element.isConnected)).toBe(true);
		expect(await feedback.count()).toBe(1);
		await call("hide");
		expect(await first!.isVisible()).toBe(false);
		await call("heartbeat", { generation: "test-generation" });
		expect(await first!.isVisible()).toBe(false);
		await call("show");
		expect(await first!.isVisible()).toBe(true);
		await page.close();
	}, 15000);
	it("clears on finish and rejects late show, heartbeat and activation from the old turn", async () => {
		const { page, call } = await pageRuntime();
		const feedback = page.locator('[data-daedalus-feedback="true"]');
		await call("hide");
		await call("suspend");
		await call("show");
		await call("heartbeat", { generation: "test-generation" });
		expect(await feedback.count()).toBe(0);
		await expect(
			call("activate", { generation: "test-generation" }),
		).rejects.toThrow("browser_scope_stale");
		await call("activate", { generation: "next-generation" });
		expect(await feedback.isVisible()).toBe(true);
		await call("clear");
		await call("heartbeat", { generation: "next-generation" });
		expect(await feedback.count()).toBe(0);
		await page.close();
	});
	it("hides only the target tab feedback on tab switches and restores it without replay", async () => {
		const { page, call, setVisibility } = await pageRuntime();
		const feedback = page.locator('[data-daedalus-feedback="true"]');
		await page.bringToFront();
		expect(await feedback.isVisible()).toBe(true);
		const other = await context.newPage();
		await other.goto(origin);
		await other.bringToFront();
		await setVisibility(true);
		expect(await feedback.isVisible()).toBe(false);
		expect(await other.locator('[data-daedalus-feedback="true"]').count()).toBe(
			0,
		);
		await call("heartbeat", { generation: "test-generation" });
		await page.bringToFront();
		await setVisibility(false);
		await feedback.waitFor({ state: "visible" });
		expect(await feedback.getAttribute("data-activity")).toBe("reading");
		await other.close();
		await page.close();
	});
	it("expires an orphaned cursor even if a stale generation keeps sending heartbeats", async () => {
		const { page, call } = await pageRuntime();
		await call("heartbeat", { generation: "old-generation" });
		await page
			.locator('[data-daedalus-feedback="true"]')
			.waitFor({ state: "detached", timeout: 7500 });
		await call("heartbeat", { generation: "test-generation" });
		await call("show");
		expect(await page.locator('[data-daedalus-feedback="true"]').count()).toBe(
			0,
		);
		await page.close();
	}, 10000);
	it("wait checks visible evidence and scroll uses bounded viewport pages", async () => {
		const { page, call } = await pageRuntime();
		expect((await call("wait", { condition: "load" })).ready).toBe(true);
		expect(
			(await call("wait", { condition: "text", text: "Name" })).ready,
		).toBe(true);
		expect(
			(await call("wait", { condition: "text", text: "not on page" })).ready,
		).toBe(false);
		expect(
			(await call("wait", { condition: "text", text: "local-test-secret" }))
				.ready,
		).toBe(false);
		await expect(call("wait", { condition: "text", text: "" })).rejects.toThrow(
			"browser_invalid_wait",
		);
		await page.evaluate(() => {
			document.body.style.height = "5000px";
		});
		const scroll = await call("scroll", { direction: "down", pages: 0.5 });
		expect(scroll.scrollY).toBe((await page.evaluate(() => innerHeight)) / 2);
		await expect(
			call("scroll", { direction: "left", pages: 1 }),
		).rejects.toThrow("browser_invalid_scroll");
		await expect(
			call("scroll", { direction: "down", pages: 99 }),
		).rejects.toThrow("browser_invalid_scroll");
		await page.close();
	});
	it("isolates references, fills without submitting, deduplicates submit and excludes cursor", async () => {
		const { page, call } = await pageRuntime();
		expect(await page.evaluate(() => "__daedalusExternal" in globalThis)).toBe(
			false,
		);
		const obs = await call("observe"),
			fill = obs.elements.find((e: any) => e.name === "Name"),
			submit = obs.elements.find((e: any) => e.name === "Send");
		expect(JSON.stringify(obs)).not.toContain("local-test-secret");
		const prepared = await call("prepare", {
			observationId: obs.observationId,
			steps: [
				{ id: "fill", elementId: fill.id, action: "fill", value: "Ada" },
				{ id: "submit", elementId: submit.id, action: "submit" },
			],
		});
		expect(
			(
				await call("execute", {
					prepareId: prepared.prepareId,
					stepId: "fill",
					actionId: "fill",
				})
			).status,
		).toBe("dispatched");
		await expect(page.locator("#name").inputValue()).resolves.toBe("Ada");
		expect(await page.evaluate(() => (window as any).submits)).toBe(0);
		await page.screenshot({ path: "test-results/browser-feedback/input.png" });
		await call("execute", {
			prepareId: prepared.prepareId,
			stepId: "submit",
			actionId: "submit",
		});
		await call("execute", {
			prepareId: prepared.prepareId,
			stepId: "submit",
			actionId: "submit",
		});
		expect(await page.evaluate(() => (window as any).submits)).toBe(1);
		const next = await call("observe");
		expect(next.elements).toHaveLength(obs.elements.length);
		await call("hide");
		expect(
			await page
				.locator('[data-daedalus-feedback="true"]')
				.first()
				.evaluate((e) => getComputedStyle(e).display),
		).toBe("none");
		await call("show");
		await call("clear");
		await expect(
			page.locator('[data-daedalus-feedback="true"]').count(),
		).resolves.toBe(0);
		await page.close();
	});
	it("rejects changed fields, ambiguity, password inputs and implicit submission", async () => {
		const { page, call } = await pageRuntime();
		const obs = await call("observe"),
			submit = obs.elements.find((e: any) => e.name === "Send"),
			field = obs.elements.find((e: any) => e.name === "Name"),
			password = obs.elements.find((e: any) => e.type === "password");
		await expect(
			call("prepare", {
				observationId: obs.observationId,
				steps: [{ id: "submit", action: "click", elementId: submit.id }],
			}),
		).rejects.toThrow("browser_submit_must_be_explicit");
		await expect(
			call("prepare", {
				observationId: obs.observationId,
				steps: [
					{
						id: "password",
						action: "fill",
						value: "secret",
						elementId: password.id,
					},
				],
			}),
		).rejects.toThrow("browser_target_forbidden");
		const prepared = await call("prepare", {
			observationId: obs.observationId,
			steps: [
				{ id: "fill", action: "fill", value: "Ada", elementId: field.id },
			],
		});
		await page.locator("#name").fill("User edit");
		await expect(
			call("execute", {
				prepareId: prepared.prepareId,
				stepId: "fill",
				actionId: "new",
			}),
		).rejects.toThrow("browser_form_changed");
		await page.close();
	});
	it("React-style replacement matches exactly, but added fields do not inherit approval", async () => {
		const { page, call } = await pageRuntime();
		const obs = await call("observe"),
			field = obs.elements.find((e: any) => e.name === "Name"),
			submit = obs.elements.find((e: any) => e.name === "Send");
		const prepared = await call("prepare", {
			observationId: obs.observationId,
			steps: [
				{ id: "fill", action: "fill", value: "Ada", elementId: field.id },
				{ id: "submit", action: "submit", elementId: submit.id },
			],
		});
		await page
			.locator("#name")
			.evaluate((e) => e.replaceWith(e.cloneNode(true)));
		expect(
			(
				await call("execute", {
					prepareId: prepared.prepareId,
					stepId: "fill",
					actionId: "fill",
				})
			).status,
		).toBe("dispatched");
		await page.locator("form").evaluate((form) => {
			const field = document.createElement("input");
			field.name = "unexpected";
			form.append(field);
		});
		await expect(
			call("execute", {
				prepareId: prepared.prepareId,
				stepId: "submit",
				actionId: "submit",
			}),
		).rejects.toThrow("browser_form_changed");
		expect(await page.evaluate(() => (window as any).submits)).toBe(0);
		await page.close();
	});
	it("same-origin frame fields are operable and nested cross-origin frames remain masked", async () => {
		const { page, call } = await pageRuntime();
		await page.evaluate(() => {
			const frame = document.createElement("iframe");
			frame.srcdoc =
				'<label>Nested field<input id="nested" name="nested"></label><iframe sandbox srcdoc="Private embedded content"></iframe>';
			document.body.append(frame);
		});
		await page.frameLocator("body > iframe").locator("#nested").waitFor();
		const observation = await call("observe");
		const node = observation.elements.find(
			(e: any) => e.name === "Nested field",
		);
		expect(node.frame).toEqual([0]);
		const prepared = await call("prepare", {
			observationId: observation.observationId,
			steps: [
				{ id: "nested", action: "fill", value: "Test", elementId: node.id },
			],
		});
		expect(
			(
				await call("execute", {
					prepareId: prepared.prepareId,
					stepId: "nested",
					actionId: "nested",
				})
			).status,
		).toBe("dispatched");
		expect(
			await page.frameLocator("body > iframe").locator("#nested").inputValue(),
		).toBe("Test");
		await call("hide");
		// 一个密码字段和同源 iframe 内的跨域子页均被遮盖
		expect(await page.locator("[data-daedalus-feedback] > div").count()).toBe(
			2,
		);
		await call("show");
		await page.close();
	});
});
