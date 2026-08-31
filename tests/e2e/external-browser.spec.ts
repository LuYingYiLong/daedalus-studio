import { chromium, type BrowserContext } from "playwright";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/studio";
import { installImageAttachmentScenario } from "./fixtures/image-attachments";
import type { ExternalBrowserScope } from "../../src/contracts/external-browser";
const exec = promisify(execFile);
test("external extension + native host: read, retained proposal, background action, cursor, cancel", async ({
	launchStudio,
	mockBackend,
	userDataDir,
}) => {
	test.skip(process.platform !== "win32");
	test.setTimeout(120000);
	installImageAttachmentScenario(mockBackend);
	mockBackend.setHandler("client.info", ({ connectionId }) => ({
		connection: { connectionId },
		features: { externalBrowser: 1, computerControl: 3 },
	}));
	mockBackend.setHandler("browser.external.update", () => ({ accepted: true }));
	const replies = new Map<
		string,
		{ ok: boolean; result?: Record<string, any>; error?: { code: string } }
	>();
	mockBackend.setHandler("browser.tool.result", ({ params }) => {
		const row = params as {
			callId: string;
			ok: boolean;
			result?: Record<string, any>;
		};
		replies.set(row.callId, row);
		return { accepted: true };
	});
	const server = createServer((_req, res) => {
		res.setHeader("Content-Type", "text/html");
		res.end(
			'<!doctype html><title>External test form</title><form action="/submitted"><label>Name<input id="name" name="name"></label><button id="send">Send</button></form><output id="result"></output><script>window.sent=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.sent++;document.querySelector("output").textContent="Submitted"}</script>',
		);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/form`;
	const hostName = `com.daedalus.browser.test_${randomUUID().replaceAll("-", "")}`,
		registered: string[] = [];
	const extensionId = "nogbahgjfkhmeelmjgkgdefilhobconm",
		manifestPath = join(userDataDir, "native-test-host.json");
	let context: BrowserContext | undefined;
	try {
		// 只注册本次测试新建的随机名称，不覆盖用户开发版/正式版的注册项
		await writeFile(
			manifestPath,
			JSON.stringify({
				name: hostName,
				description: "Daedalus isolated integration test",
				path: resolve("build/browser-host/daedalus-browser-development.exe"),
				type: "stdio",
				allowed_origins: [`chrome-extension://${extensionId}/`],
			}),
		);
		for (const browser of ["Google\\Chrome", "Chromium", "Microsoft\\Edge"]) {
			const key = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${hostName}`;
			const exists = await exec("reg.exe", ["query", key], {
				windowsHide: true,
			}).then(
				() => true,
				() => false,
			);
			if (exists) throw new Error("test_registry_collision");
			await exec(
				"reg.exe",
				["add", key, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"],
				{ windowsHide: true },
			);
			registered.push(key);
		}
		const { mainWindow, electronApp } = await launchStudio();
		await mainWindow.getByText("Screenshot history", { exact: true }).click();
		const settingsPromise = electronApp.waitForEvent("window");
		await mainWindow.evaluate(() =>
			window.electronAPI.windowControl.openSettings("browser"),
		);
		const settings = await settingsPromise;
		const enableStudio = settings.getByRole("switch", {
			name: /Allow external browser tasks|允许外部浏览器任务/,
		});
		await expect(enableStudio).not.toBeChecked();
		await expect(
			settings.getByText(/Disabled in Studio|Studio 尚未启用此功能/),
		).toBeVisible();
		const extension = resolve("build/browser-extension/development");
		context = await chromium.launchPersistentContext(
			join(userDataDir, "chromium-profile"),
			{
				channel: "chromium",
				headless: true,
				args: [
					`--disable-extensions-except=${extension}`,
					`--load-extension=${extension}`,
					"--disable-background-networking",
				],
			},
		);
		await context.route("**/*", (route) =>
			/^http:\/\/127\.0\.0\.1:/u.test(route.request().url()) ||
			route.request().url().startsWith("chrome-extension:")
				? route.continue()
				: route.abort(),
		);
		const worker =
			context.serviceWorkers()[0] ||
			(await context.waitForEvent("serviceworker"));
		await worker.evaluate((name) => {
			const runtime = (globalThis as any).chrome.runtime,
				native = runtime.connectNative.bind(runtime);
			runtime.connectNative = () => native(name);
		}, hostName);
		const status = await context.newPage();
		await status.goto(`chrome-extension://${extensionId}/status.html`);
		await status.locator("#enabled").check();
		// 复现先开启扩展、Studio 功能尚未开启的顺序，不能显示虚假的“已连接”
		await expect(status.locator("#error")).toContainText(
			/Studio is unavailable|暂时无法连接 Studio/,
		);
		await expect(status.locator("#state")).not.toHaveText(
			/^(Connected|已连接) ·/,
		);
		await expect(
			settings.getByRole("combobox", {
				name: /Default browser connection|默认浏览器连接/,
			}),
		).toBeDisabled();
		await enableStudio.click();
		await expect(enableStudio).toBeChecked();
		await expect
			.poll(
				() =>
					mainWindow.evaluate(
						async () =>
							(await window.electronAPI.externalBrowser!.getState()).connections
								.length,
					),
				{ timeout: 15000 },
			)
			.toBe(1);
		await expect(status.locator("#state")).toHaveText(/^(Connected|已连接) ·/);
		await expect(status.locator("#error")).toBeHidden();
		await expect(
			settings.getByRole("combobox", {
				name: /Default browser connection|默认浏览器连接/,
			}),
		).toBeEnabled();
		await expect(settings.getByText(/^(Connected|已连接)$/)).toBeVisible();
		await settings.screenshot({
			path: test.info().outputPath("browser-settings-connected.png"),
		});
		await status.screenshot({
			path: test.info().outputPath("extension-connected.png"),
		});
		// 关闭再启用 Studio 后，连接可重建，但旧操作授权不得恢复
		await enableStudio.click();
		await expect(enableStudio).not.toBeChecked();
		await expect(status.locator("#state")).not.toHaveText(
			/^(Connected|已连接) ·/,
		);
		await enableStudio.click();
		await expect(status.locator("#state")).toHaveText(/^(Connected|已连接) ·/);
		await settings.close();
		const target = await context.newPage();
		await target.goto(url);
		const other = await context.newPage();
		await other.goto(url.replace("/form", "/unrelated"));
		await expect
			.poll(() => mockBackend.getRequests("client.info").length)
			.toBeGreaterThan(0);
		const connectionId = mockBackend
			.getRequests("client.info")
			.at(-1)!.connectionId;
		let scope: ExternalBrowserScope = {
				connectionId,
				sessionId: "session-history",
				requestId: "external-turn-1",
				runId: "external-run-1",
				generation: "external-gen-1",
			},
			counter = 0;
		async function invoke(
			toolName: string,
			args: object,
			expectedError?: string,
		): Promise<Record<string, any>> {
			const callId = `external-call-${++counter}`;
			mockBackend.sendEvent(
				"browser.tool.request",
				{
					external: true,
					scope,
					toolCallId: `tool-${counter}`,
					callId,
					toolName,
					args,
				},
				{
					sessionId: scope.sessionId,
					requestId: scope.requestId,
					runId: scope.runId,
				},
			);
			await expect
				.poll(() => replies.has(callId), { timeout: 25000 })
				.toBe(true);
			const reply = replies.get(callId)!;
			await expect(mainWindow.getByText(/AI is working in a browser tab|AI 正在处理浏览器标签页/)).toHaveCount(0);
			if (expectedError) {
				expect(reply).toMatchObject({
					ok: false,
					error: { message: expectedError },
				});
				return {};
			}
			expect(reply, `${toolName} returned ${reply.error?.code}`).toMatchObject({
				ok: true,
			});
			return reply.result!;
		}
		const backgroundUrl = `${url}?background-fixture=1`;
		const background = await invoke("connect", { url: backgroundUrl });
		await invoke("wait", { targetId: background.targetId, condition: "load" });
		const backgroundTab = await worker.evaluate(
			async (expected) =>
				(await chrome.tabs.query({})).find((tab) => tab.url === expected),
			backgroundUrl,
		);
		expect(backgroundTab?.active).toBe(false);
		const duplicate = await context.newPage();
		await duplicate.goto(url);
		await duplicate.evaluate(() => {
			document.title = "Duplicate fixture";
		});
		const ambiguous = await invoke("connect", { url });
		expect(ambiguous.ambiguous).toBe(true);
		expect(ambiguous.matches).toHaveLength(2);
		expect(ambiguous.matches.every((match: any) => match.url === url)).toBe(
			true,
		);
		const connected = await invoke("connect", {
			url,
			matchId: ambiguous.matches.find(
				(match: any) => match.title !== "Duplicate fixture",
			).matchId,
		});
		await duplicate.close();
		expect(context.pages().filter((page) => page.url() === url)).toHaveLength(
			1,
		);
		await invoke(
			"wait",
			{
				targetId: connected.targetId,
				condition: "text",
				text: "missing fixture",
				timeoutMs: 100,
			},
			"browser_wait_timeout",
		);
		await invoke("wait", {
			targetId: connected.targetId,
			condition: "network_idle",
		});
		const observed = await invoke("wait", {
			targetId: connected.targetId,
			condition: "text",
			text: "Name",
		});
		expect(observed.visibleText).toContain("Name");
		const field = observed.elements.find((e: any) => e.name === "Name"),
			button = observed.elements.find((e: any) => e.name === "Send");
		const steps = [
			{
				id: "fill",
				elementId: field.id,
				action: "fill",
				value: "Ada",
				description: "Fill name",
				dependsOn: [],
			},
			{
				id: "submit",
				elementId: button.id,
				action: "submit",
				description: "Submit test form",
				dependsOn: ["fill"],
			},
		];
		const prepared = await invoke("prepare", {
			targetId: connected.targetId,
			observationId: observed.observationId,
			steps,
		});
		await expect(target.locator("#name")).toHaveValue("");
		expect(await target.evaluate(() => (window as any).sent)).toBe(0);
		mockBackend.sendEvent(
			"browser.tool.cancel",
			{ external: true, scope, finished: true, keepTarget: true },
			{ sessionId: scope.sessionId },
		);
		await expect
			.poll(() =>
				mainWindow.evaluate(
					async () =>
						(await window.electronAPI.externalBrowser!.getState()).active,
				),
			)
			.toBeNull();
		scope = {
			...scope,
			requestId: "external-turn-2",
			runId: "external-run-2",
			generation: "external-gen-2",
		};
		const execute = {
			targetId: connected.targetId,
			proposalId: "proposal-1",
			actionId: "proposal-1:fill",
			prepared,
			step: steps[0],
		};
		expect((await invoke("execute", execute)).status).toBe("dispatched");
		await expect(target.locator("#name")).toHaveValue("Ada");
		expect(await target.evaluate(() => (window as any).sent)).toBe(0);
		expect(await target.locator("[data-daedalus-feedback]").count()).toBe(1);
		expect(await other.locator("[data-daedalus-feedback]").count()).toBe(0);
		await mainWindow.screenshot({ path: test.info().outputPath("browser-control-no-banner.png") });
		const screenshot = await invoke("screenshot", {
			targetId: connected.targetId,
		});
		expect(screenshot.dataUrl).toMatch(/^data:image\/png;base64,/u);
		await invoke("execute", execute);
		expect(await target.evaluate(() => (window as any).sent)).toBe(0);
		await status.locator("#stop").click();
		await expect
			.poll(() =>
				mainWindow.evaluate(
					async () =>
						(await window.electronAPI.externalBrowser!.getState()).active,
				),
			)
			.toBeNull();
		await expect
			.poll(() =>
				mockBackend
					.getRequests("browser.external.update")
					.some((req) => (req.params as any).state === "revoke"),
			)
			.toBe(true);
		await mainWindow.evaluate(async () => {
			await window.electronAPI.externalBrowser!.configure({ enabled: false });
		});
	} finally {
		await context?.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		for (const key of registered)
			await exec("reg.exe", ["delete", key, "/f"], { windowsHide: true });
	}
});
