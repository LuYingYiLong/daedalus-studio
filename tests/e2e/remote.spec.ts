import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { expect, test } from "./fixtures/studio";

const NOW: string = "2026-08-27T00:00:00.000Z";

function createRemoteWorkbench(activeRun: Record<string, unknown> = { status: "idle" }): Record<string, unknown> {
	return {
		revision: 1,
		sessionId: "session-remote-e2e",
		composer: { text: "", chatMode: "agent", additionalContext: [] },
		messageQueue: [],
		pendingGuides: [],
		activeRun,
		pendingApproval: { count: 0, first: null },
		pendingToolBudget: null,
		nextStepHints: { hints: [] },
		activeSelection: {
			workspaceId: "workspace-remote-e2e",
			workspaceName: "Remote E2E Project",
			workspaceRoot: "D:/RemoteE2E",
		},
	};
}

test.describe("Daedalus Studio Android Remote PWA", () => {
	test("pairs securely and exercises the mobile conversation, approval, plan and trace surface", async ({ launchStudio, mockBackend }) => {
		const previewMode: boolean = process.env.DAEDALUS_REMOTE_PREVIEW === "1";
		test.setTimeout(previewMode ? 0 : 120_000);
		const workspace = {
			id: "workspace-remote-e2e",
			name: "Remote E2E Project",
			kind: "godot",
			rootPath: "D:/RemoteE2E",
			icon: 0,
			color: 0,
			sourceFolders: [{ id: "primary", path: "D:/RemoteE2E", capabilities: { git: false, godot: true } }],
			primarySourceFolderId: "primary",
		};
		const previewSession = {
			id: "session-remote-e2e",
			title: "Remote 界面预览",
			workspaceId: workspace.id,
			workspaceName: workspace.name,
			chatMode: "agent",
			approvalMode: "manual",
			createdAt: NOW,
			updatedAt: NOW,
		};
		let sessions: Array<Record<string, unknown>> = previewMode ? [previewSession] : [];
		let timelineBlocks: Array<Record<string, unknown>> = previewMode ? [
			{ id: "preview-user", type: "user", requestId: "preview-request", content: "帮我检查一下移动端体验", sentAtUtc: NOW },
			{
				id: "preview-assistant",
				type: "assistant",
				requestId: "preview-request",
				content: "Remote 已连接。你可以在这里测试会话、Composer、计划和轨迹界面。",
				startedAtUtc: NOW,
				completedAtUtc: NOW,
				completionStatus: "responded",
				bodyParts: [{ type: "markdown", text: "Remote 已连接。你可以在这里测试会话、Composer、计划和轨迹界面。" }],
			},
		] : [];
		let workbench: Record<string, unknown> = createRemoteWorkbench();
		let pendingApprovals: Array<Record<string, unknown>> = [];
		let latestPlanId: string | null = null;
		let plan = {
			planId: "remote-plan-1",
			sessionId: "session-remote-e2e",
			requestId: "remote-plan-request",
			status: "clarification_required",
			title: "Remote implementation plan",
			previewMarkdown: "Inspect, implement, and verify.",
			question: "Which scope should be used?",
			recommendedReplies: [{ label: "Use the safe scope", text: "Use the safe scope" }],
			createdAt: NOW,
			updatedAt: NOW,
		};
		mockBackend.setHandler("workspace.list", () => ({ workspaces: [workspace], active: workspace.id, connected: [workspace.id] }));
		mockBackend.setHandler("session.list", () => ({ sessions }));
		mockBackend.setHandler("session.create", ({ params }) => {
			const input = params as { title: string; workspaceId: string; chatMode: string };
			const metadata = { id: "session-remote-e2e", title: input.title, workspaceId: input.workspaceId, workspaceName: workspace.name, chatMode: input.chatMode, approvalMode: "manual", createdAt: NOW, updatedAt: NOW };
			sessions = [metadata];
			return {
				...metadata,
				workbench: {
					revision: 0,
					sessionId: metadata.id,
					composer: { text: "", chatMode: input.chatMode, additionalContext: [] },
					messageQueue: [], pendingGuides: [], activeRun: { status: "idle" }, pendingApproval: { count: 0, first: null }, pendingToolBudget: null, nextStepHints: { hints: [] }, activeSelection: { workspaceId: workspace.id, workspaceName: workspace.name, workspaceRoot: workspace.rootPath },
				},
			};
		});
		mockBackend.setHandler("session.open", ({ params }) => {
			const sessionId: string = (params as { sessionId: string }).sessionId;
			const metadata = sessions.find((session) => session.id === sessionId) ?? sessions[0]!;
			return {
				opened: true,
				metadata,
				blockCount: timelineBlocks.length,
				blockOffset: 0,
				eventCount: 0,
				limit: 180,
				hasMoreBefore: false,
				hasMoreAfter: false,
				timelineBlocks,
				latestWorkflowSnapshot: null,
				latestAgentSnapshot: null,
				latestPlanClarification: latestPlanId === null ? null : { planId: latestPlanId },
				latestPlanApproval: null,
				pendingGuides: [],
				messageQueue: [],
				selectionAskThreads: [],
				workbench,
				agentRuns: [],
				activeAgentRun: null,
				currentGoal: null,
				workspaceWarning: null,
			};
		});
		mockBackend.setHandler("session.timeline", () => ({
			timeline: true,
			sessionId: "session-remote-e2e",
			blockCount: timelineBlocks.length,
			blockOffset: 0,
			eventCount: timelineBlocks.length,
			limit: 180,
			hasMoreBefore: false,
			hasMoreAfter: false,
			timelineBlocks,
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: latestPlanId === null ? null : { planId: latestPlanId },
			latestPlanApproval: null,
		}));
		mockBackend.setHandler("session.workbench.get", () => ({ changed: true, workbench }));
		mockBackend.setHandler("approval.list", () => ({ mode: "manual", pending: pendingApprovals }));
		mockBackend.setHandler("approval.approve", ({ params }) => {
			const approvalId: string = (params as { approvalId: string }).approvalId;
			pendingApprovals = pendingApprovals.filter((approval) => approval.approvalId !== approvalId);
			return { approved: true, approvalId, result: { content: "approved" }, continued: true };
		});
		mockBackend.setHandler("approval.reject", ({ params }) => {
			const approvalId: string = (params as { approvalId: string }).approvalId;
			pendingApprovals = pendingApprovals.filter((approval) => approval.approvalId !== approvalId);
			return { rejected: true, approvalId, toolName: "terminal.exec" };
		});
		mockBackend.setHandler("plan.get", () => plan);
		mockBackend.setHandler("plan.clarify", ({ params }) => {
			plan = { ...plan, question: `Clarified: ${(params as { reply: string }).reply}`, updatedAt: NOW };
			return plan;
		});
		mockBackend.setHandler("plan.revise", ({ params }) => {
			plan = { ...plan, status: "ready", previewMarkdown: `Revised: ${(params as { feedback: string }).feedback}`, question: "", updatedAt: NOW };
			return plan;
		});
		mockBackend.setHandler("plan.approve", () => ({
			planApproved: true,
			planId: plan.planId,
			executionRequestId: "remote-plan-execution",
			chatMode: "agent",
			workbench,
		}));
		const traceRecord = {
			recordId: "remote-trace-prompt",
			sessionId: "session-remote-e2e",
			sequence: 1,
			turn: 1,
			kind: "prompt",
			status: "success",
			requestId: "remote-trace-request",
			startedAt: NOW,
			finishedAt: NOW,
			durationMs: 12,
			detailLevel: "full",
			summary: { sectionCount: 1 },
			truncated: false,
			hasDetails: true,
			revision: 1,
		};
		const compactedTraceRecord = {
			...traceRecord,
			recordId: "remote-trace-compacted",
			sequence: 2,
			turn: 0,
			kind: "tool_call",
			detailLevel: "compacted",
			summary: { toolName: "workspace.read_file" },
			hasDetails: false,
			revision: 2,
		};
		mockBackend.setHandler("session.trace.summary", () => ({ revision: 2, turnCount: 1, modelCallCount: 1, toolCallCount: 1, errorCount: 0, durationMs: 120, inputTokens: 32, outputTokens: 12, hasDetails: true }));
		mockBackend.setHandler("session.trace.page", () => ({ revision: 2, records: [traceRecord, compactedTraceRecord] }));
		mockBackend.setHandler("session.trace.detail", () => ({
			record: traceRecord,
			promptSections: [{ id: "system", kind: "system", label: "System", content: "redacted mobile prompt", charCount: 22, contentHash: "trace-hash", truncated: false }],
			request: { temperature: 0.2 },
			response: { status: "ok" },
			redactions: ["authorization"],
			detailLevel: "full",
		}));
		mockBackend.setHandler("ai.chat", ({ id, params }) => {
			const message: string = (params as { message: string }).message;
			workbench = createRemoteWorkbench({ status: "running", requestId: id, runId: `run-${id}`, sequence: 1 });
			timelineBlocks = [{ id: `user-${id}`, type: "user", requestId: id, content: message, sentAtUtc: NOW }];
			mockBackend.sendEvent("session.workbench.updated", { workbench }, { sessionId: "session-remote-e2e", requestId: id, runId: `run-${id}` });
			if (message === "Keep running") return { accepted: true };
			setTimeout((): void => {
				timelineBlocks = [...timelineBlocks, {
					id: `assistant-${id}`,
					type: "assistant",
					requestId: id,
					content: "Remote streamed reply",
					startedAtUtc: NOW,
					completedAtUtc: NOW,
					completionStatus: "responded",
					bodyParts: [{ type: "markdown", text: "Remote streamed reply" }],
				}];
				workbench = createRemoteWorkbench();
				mockBackend.sendEvent("agent.message.done", { text: "Remote streamed reply" }, { sessionId: "session-remote-e2e", requestId: id, runId: `run-${id}` });
			}, 120);
			return { accepted: true };
		});
		mockBackend.setHandler("ai.cancel", ({ params }) => {
			const requestId: string = (params as { requestId: string }).requestId;
			workbench = createRemoteWorkbench();
			mockBackend.sendEvent("session.workbench.updated", { workbench }, { sessionId: "session-remote-e2e", requestId, runId: `run-${requestId}` });
			return { cancelled: true, requestId };
		});
		mockBackend.setHandler("agent.run.retry", () => ({ text: "retry accepted" }));

		const { electronApp, mainWindow } = await launchStudio();
		// Keep local E2E isolated from a developer's running Remote Gateway.
		await mainWindow.evaluate(async () => await window.electronAPI.remoteAccess.updatePorts({
			httpsPort: 38290,
			bootstrapPort: 38291,
		}));
		const state = await mainWindow.evaluate(async () => await window.electronAPI.remoteAccess.setEnabled(true));
		test.skip(state.status !== "running" || state.addresses.length === 0, `Remote Gateway unavailable: ${state.error ?? state.status}`);
		const pairing = await mainWindow.evaluate(async () => await window.electronAPI.remoteAccess.beginPairing());
		let context: BrowserContext | null = null;
		let remoteBrowser: Browser | null = null;
		let page: Page;
		if (previewMode) {
			const remoteWindowPromise: Promise<Page> = electronApp.waitForEvent("window");
			await electronApp.evaluate(async ({ BrowserWindow, session }, pairingUrl: string): Promise<void> => {
				for (const window of BrowserWindow.getAllWindows()) window.hide();
				const previewSession = session.fromPartition("daedalus-remote-preview");
				previewSession.setCertificateVerifyProc((_request, callback): void => callback(0));
				const previewWindow = new BrowserWindow({
					width: 412,
					height: 915,
					useContentSize: true,
					show: false,
					autoHideMenuBar: true,
					title: "Daedalus Remote Preview",
					webPreferences: {
						session: previewSession,
						nodeIntegration: false,
						contextIsolation: true,
						sandbox: true,
					},
				});
				await previewWindow.loadURL(pairingUrl);
				previewWindow.show();
			}, pairing.pairingUrls[0]!);
			page = await remoteWindowPromise;
		} else {
			remoteBrowser = await chromium.launch();
			context = await remoteBrowser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
			page = await context.newPage();
			await page.goto(pairing.pairingUrls[0]!);
		}
		page.on("console", (entry): void => console.log(`[remote:${entry.type()}] ${entry.text()}`));
		page.on("pageerror", (pageError): void => console.log(`[remote:pageerror] ${pageError.message}`));
		page.on("requestfailed", (request): void => console.log(`[remote:requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`));
		await expect.poll(async (): Promise<boolean> => await page.evaluate(async (): Promise<boolean> => {
			const response = await fetch("/api/v1/status", { credentials: "include", cache: "no-store" });
			if (!response.ok) return true;
			return ((await response.json()) as { pairingRequired: boolean }).pairingRequired;
		}), { timeout: 20_000 }).toBe(false);
		await expect.poll((): boolean => mockBackend.getRequests("client.hello").some((request) => (request.params as { clientType?: string }).clientType === "studio_remote"), { timeout: 20_000 }).toBe(true);
		await expect(page.locator("[data-remote-app=\"true\"]")).toBeVisible({ timeout: 20_000 });
		await expect(page.getByText("Remote E2E Project")).toBeVisible();
		if (previewMode) {
			console.log(`\nDaedalus Remote preview is ready at ${page.url()}`);
			console.log("Use the visible mobile window freely. Close it or press Ctrl+C to stop.\n");
			await Promise.race([
				new Promise<void>((resolve): void => { page.once("close", (): void => resolve()); }),
				new Promise<void>((resolve): void => { mainWindow.once("close", (): void => resolve()); }),
			]);
			return;
		}
		await page.getByRole("button", { name: /新建会话|New session/ }).click();
		await page.getByRole("button", { name: /创建普通会话|Create local session/ }).click();
		const createRequest = await mockBackend.waitForRequest("session.create");
		expect(createRequest.params).toMatchObject({ workspaceId: workspace.id, chatMode: "agent" });
		expect(createRequest.params).not.toHaveProperty("workspaceLaunch");
		await expect(page.getByText(/移动会话|Mobile session/).first()).toBeVisible();

		const composer = page.getByPlaceholder(/给 Studio 中的 AI 发送消息|Send a message to the AI in Studio/);
		await composer.fill("Stream from mobile");
		await page.getByRole("button", { name: /发送|Send/ }).click();
		await expect(page.getByText("Remote streamed reply")).toBeVisible({ timeout: 15_000 });
		expect(mockBackend.getRequests("ai.chat").at(-1)?.params).toMatchObject({ mode: "agent", message: "Stream from mobile" });

		await composer.fill("Keep running");
		await page.getByRole("button", { name: /发送|Send/ }).click();
		await expect(page.getByRole("button", { name: /停止|Stop/ })).toBeVisible({ timeout: 10_000 });
		await page.getByRole("button", { name: /停止|Stop/ }).click();
		await expect.poll((): number => mockBackend.getRequests("ai.cancel").length).toBe(1);
		await expect(page.getByRole("button", { name: /发送|Send/ })).toBeVisible({ timeout: 10_000 });
		await page.evaluate((): void => {
			window.dispatchEvent(new CustomEvent("daedalus:retry-agent-run", { detail: { runId: "remote-run-retry" } }));
		});
		await expect.poll((): number => mockBackend.getRequests("agent.run.retry").length).toBe(1);

		pendingApprovals = [{
			approvalId: "remote-approval-destructive",
			toolCallId: "remote-tool-call",
			toolName: "terminal.exec",
			llmToolName: "terminal_exec",
			reason: "Remote destructive approval",
			args: { command: "safe fixture command" },
			status: "pending",
			restored: false,
			interrupted: false,
			requestId: "remote-approval-request",
			createdAt: NOW,
			updatedAt: NOW,
			requiredConsent: { prompt: "Confirm remote command", expectedText: "ALLOW REMOTE" },
		}];
		mockBackend.sendEvent("session.workbench.updated", { workbench }, { sessionId: "session-remote-e2e", requestId: "remote-approval-request" });
		await expect(page.locator("[data-studio-approval=\"true\"]")).toBeVisible({ timeout: 10_000 });
		await expect(page.locator("[data-studio-approval-approve=\"true\"]")).toBeDisabled();
		await page.getByPlaceholder("ALLOW REMOTE").fill("ALLOW REMOTE");
		await page.locator("[data-studio-approval-approve=\"true\"]").click();
		const approvalRequest = await mockBackend.waitForRequest("approval.approve");
		expect(approvalRequest.params).toMatchObject({ approvalId: "remote-approval-destructive", consentText: "ALLOW REMOTE" });

		pendingApprovals = [{
			approvalId: "remote-approval-ordinary",
			toolCallId: "remote-tool-call-ordinary",
			toolName: "workspace.read_file",
			llmToolName: "workspace_read_file",
			reason: "Remote ordinary approval",
			args: { path: "README.md" },
			status: "pending",
			restored: false,
			interrupted: false,
			requestId: "remote-approval-request-ordinary",
			createdAt: NOW,
			updatedAt: NOW,
		}];
		mockBackend.sendEvent("session.workbench.updated", { workbench }, { sessionId: "session-remote-e2e", requestId: "remote-approval-request-ordinary" });
		await expect(page.locator("[data-studio-approval=\"true\"]")).toBeVisible({ timeout: 10_000 });
		await page.locator("[data-studio-approval-reject=\"true\"]").click();
		await expect.poll((): number => mockBackend.getRequests("approval.reject").length).toBe(1);

		latestPlanId = plan.planId;
		mockBackend.sendEvent("plan.clarification.requested", { planId: plan.planId }, { sessionId: "session-remote-e2e", requestId: plan.requestId });
		await page.getByRole("button", { name: /查看计划|Open plan/ }).click();
		const planInput = page.getByPlaceholder(/输入澄清回复或修改意见|Enter (?:a )?clarification reply or revision feedback/);
		await planInput.fill("Use the safe scope");
		await page.getByRole("button", { name: /提交澄清|Submit clarification/ }).click();
		await mockBackend.waitForRequest("plan.clarify");
		await planInput.fill("Tighten the scope");
		await page.getByRole("button", { name: /修改计划|Revise plan/ }).click();
		await mockBackend.waitForRequest("plan.revise");
		await expect(page.getByRole("button", { name: /批准计划|Approve plan/ })).toBeEnabled();
		await page.getByRole("button", { name: /批准计划|Approve plan/ }).click();
		await mockBackend.waitForRequest("plan.approve");

		await page.getByRole("button", { name: /轨迹|Trajectory/ }).click();
		await expect(page.getByText("prompt · success")).toBeVisible();
		await expect(page.getByText("tool_call · success")).toBeVisible();
		await page.getByText("prompt · success").click();
		await expect(page.getByText("remote-trace-prompt")).toBeVisible();
		await expect(page.getByText(/redacted mobile prompt/)).toBeVisible();
		await page.keyboard.press("Escape");

		const helloCountBeforeReconnect: number = mockBackend.getRequests("client.hello").filter((request) => (request.params as { clientType?: string }).clientType === "studio_remote").length;
		mockBackend.closeConnections();
		await expect.poll((): number => mockBackend.getRequests("client.hello").filter((request) => (request.params as { clientType?: string }).clientType === "studio_remote").length, { timeout: 20_000 }).toBeGreaterThan(helloCountBeforeReconnect);
		await expect(page.getByText(/已连接|Connected/)).toBeVisible({ timeout: 20_000 });

		const remoteHello = mockBackend.getRequests("client.hello").find((request) => (request.params as { clientType?: string }).clientType === "studio_remote");
		expect(remoteHello?.params).toMatchObject({ clientType: "studio_remote", capabilities: { remoteControl: true, browserTools: false, scheduledTasks: false } });
		const helloCountBeforeReload: number = mockBackend.getRequests("client.hello").filter((request) => (request.params as { clientType?: string }).clientType === "studio_remote").length;
		await page.reload();
		await expect(page.locator("[data-remote-app=\"true\"]")).toBeVisible({ timeout: 20_000 });
		await expect.poll((): number => mockBackend.getRequests("client.hello").filter((request) => (request.params as { clientType?: string }).clientType === "studio_remote").length).toBeGreaterThan(helloCountBeforeReload);

		const blocked = await page.evaluate(async (): Promise<{ ok: boolean; code?: string }> => await new Promise((resolve, reject): void => {
			const socket = new WebSocket(`wss://${location.host}/api/v1/rpc`);
			const timer = window.setTimeout((): void => reject(new Error("forbidden RPC timeout")), 5_000);
			socket.addEventListener("open", (): void => socket.send(JSON.stringify({ type: "request", id: "forbidden", method: "backend.shutdown" })));
			socket.addEventListener("message", (event): void => {
				const response = JSON.parse(String(event.data)) as { id?: string; ok?: boolean; error?: { code?: string } };
				if (response.id !== "forbidden") return;
				window.clearTimeout(timer);
				resolve({ ok: response.ok === true, code: response.error?.code });
				socket.close();
			});
		}));
		expect(blocked).toEqual({ ok: false, code: "remote_method_not_allowed" });
		expect(mockBackend.getRequests("backend.shutdown")).toHaveLength(0);

		const deviceId: string = state.devices[0]?.id ?? (await mainWindow.evaluate(async () => (await window.electronAPI.remoteAccess.getState()).devices[0]!.id));
		await mainWindow.evaluate(async (id: string) => await window.electronAPI.remoteAccess.revokeDevice(id), deviceId);
		await expect.poll(async (): Promise<boolean> => await page.evaluate(async (): Promise<boolean> => {
			const response = await fetch("/api/v1/status", { credentials: "include", cache: "no-store" });
			return response.ok && ((await response.json()) as { pairingRequired: boolean }).pairingRequired;
		})).toBe(true);
		await expect(page.getByText(/已断开|Disconnected/)).toBeVisible({ timeout: 20_000 });
		await context?.close();
		await remoteBrowser?.close();
	});
});
