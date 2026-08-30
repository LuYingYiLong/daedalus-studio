import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "./fixtures/studio";

const MOCK_SESSION_ID: string = "session-e2e-1";

function createWorkbench(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		revision: 1,
		sessionId: MOCK_SESSION_ID,
		composer: {
			text: "",
			chatMode: "agent",
			provider: "openai",
			model: "gpt-4o-mini",
			additionalContext: [],
		},
		messageQueue: [],
		pendingGuides: [],
		activeRun: { status: "idle" },
		pendingApproval: { count: 0, first: null },
		pendingToolBudget: null,
		nextStepHints: { hints: [] },
		activeSelection: { workspaceId: null, workspaceName: null, workspaceRoot: null },
		...overrides,
	};
}

async function openSessionSurface(page: import("@playwright/test").Page): Promise<void> {
	await page.locator("[data-studio-new-session=\"true\"]").click();
	await expect(page.locator("[data-studio-composer=\"true\"]")).toBeVisible();
}

test.describe("Daedalus Studio 核心 Electron E2E", () => {
	test("全新用户启动显示首次引导", async ({ launchStudio, mockBackend }) => {
		const { mainWindow } = await launchStudio({ completedOnboarding: false });

		await expect(mainWindow.locator("[data-studio-onboarding=\"true\"]")).toBeVisible();
		await expect(mainWindow.locator("[data-step=\"welcome\"]")).toBeVisible();
		await expect(mainWindow.locator("[data-studio-onboarding=\"true\"] button.ant-btn-primary").last()).toBeVisible();
		await expect.poll(() => mockBackend.getRequests("backend.health").length).toBeGreaterThan(0);
		await mainWindow.getByRole("button", { name: /Start|开始/ }).click();
		await expect(mainWindow.locator("[data-step=\"provider\"]")).toBeVisible();
		await mainWindow.waitForTimeout(250);
		await mainWindow.getByRole("button", { name: /Skip|跳过/ }).click();
		await expect(mainWindow.locator("[data-step=\"godot_executable\"]")).toBeVisible();
		await mainWindow.waitForTimeout(250);
		await mainWindow.getByRole("button", { name: /Skip|跳过/ }).click();
		await expect(mainWindow.locator("[data-step=\"documentation\"]")).toBeVisible();
		await mainWindow.waitForTimeout(250);
		await mainWindow.getByRole("button", { name: /Skip|跳过/ }).click();
		await expect(mainWindow.locator("[data-step=\"godot_bridge\"]")).toBeVisible();
		await mainWindow.waitForTimeout(250);
		await mainWindow.getByRole("button", { name: /Skip|跳过/ }).click();
		await expect(mainWindow.locator("[data-step=\"complete\"]")).toBeVisible();
		await mainWindow.waitForTimeout(250);
		await mainWindow.getByRole("button", { name: /Enter.*Studio|进入.*Studio/ }).click();
		await expect(mainWindow.locator("[data-studio-home=\"true\"]")).toBeVisible({ timeout: 15_000 });
	});

	test("已完成引导的用户直接进入 Home", async ({ launchStudio, mockBackend }) => {
		const { mainWindow } = await launchStudio();

		await expect(mainWindow.locator("[data-studio-home=\"true\"]")).toBeVisible();
		await expect(mainWindow.locator("[data-studio-composer=\"true\"]")).toBeVisible();
		await expect.poll(() => mockBackend.getRequests("client.hello").length).toBeGreaterThan(0);
	});

	test("创建会话并消费 Mock Backend 的流式回复", async ({ launchStudio, mockBackend }) => {
		let chatRequestId: string | null = null;
		let persistedReplyAvailable: boolean = false;
		mockBackend.setHandler("session.timeline", ({ params }) => {
			const sessionId: string = (params as { sessionId?: string } | undefined)?.sessionId ?? MOCK_SESSION_ID;
			if (!persistedReplyAvailable || chatRequestId === null) {
				return {
					timeline: true,
					sessionId,
					blockCount: 0,
					blockOffset: 0,
					eventCount: 0,
					limit: 100,
					hasMoreBefore: false,
					hasMoreAfter: false,
					timelineBlocks: [],
					latestWorkflowSnapshot: null,
					latestAgentSnapshot: null,
					latestPlanClarification: null,
					latestPlanApproval: null,
				};
			}
			return {
				timeline: true,
				sessionId,
				blockCount: 2,
				blockOffset: 0,
				eventCount: 4,
				limit: 100,
				hasMoreBefore: false,
				hasMoreAfter: false,
				timelineBlocks: [
					{
						id: "e2e-user-block",
						type: "user",
						requestId: chatRequestId,
						content: "Hello from E2E",
						sentAtUtc: "2026-08-24T00:00:01.000Z",
					},
					{
						id: "e2e-assistant-block",
						type: "assistant",
						requestId: chatRequestId,
						content: "Mock reply from E2E",
						startedAtUtc: "2026-08-24T00:00:01.000Z",
						completedAtUtc: "2026-08-24T00:00:02.000Z",
						completionStatus: "responded",
						bodyParts: [{ type: "markdown", text: "Mock reply from E2E" }],
					},
				],
				latestWorkflowSnapshot: null,
				latestAgentSnapshot: null,
				latestPlanClarification: null,
				latestPlanApproval: null,
			};
		});
		mockBackend.setHandler("ai.chat", ({ id }) => {
			chatRequestId = id;
			persistedReplyAvailable = true;
			setTimeout(() => {
				mockBackend.sendEvent("agent.run.state", {
					schemaVersion: 1,
					runId: "e2e-run-1",
					requestId: id,
					rootRequestId: id,
					revision: 1,
					intent: "answer",
					scope: "bounded",
					lane: "direct",
					stage: "executing",
					title: "E2E response",
					planId: null,
					todo: null,
					pause: null,
					verificationStatus: null,
					warnings: [],
					terminal: null,
					checkpoint: { successfulWriteFingerprints: [], evidence: [] },
					createdAt: "2026-08-24T00:00:01.000Z",
					updatedAt: "2026-08-24T00:00:01.000Z",
				}, {
					sessionId: MOCK_SESSION_ID,
					requestId: id,
					runId: "e2e-run-1",
				});
			}, 20);
			setTimeout(() => {
				mockBackend.sendEvent("agent.message.delta", { text: "Mock reply from E2E" }, {
					sessionId: MOCK_SESSION_ID,
					requestId: id,
					runId: "e2e-run-1",
				});
			}, 40);
			setTimeout(() => {
				mockBackend.sendEvent("agent.message.done", { text: "Mock reply from E2E" }, {
					sessionId: MOCK_SESSION_ID,
					requestId: id,
					runId: "e2e-run-1",
				});
			}, 100);
			setTimeout(() => {
				mockBackend.sendEvent("agent.run.state", {
					schemaVersion: 1,
					runId: "e2e-run-1",
					requestId: id,
					rootRequestId: id,
					revision: 1,
					intent: "answer",
					scope: "bounded",
					lane: "direct",
					stage: "completed",
					title: "E2E response",
					planId: null,
					todo: null,
					pause: null,
					verificationStatus: null,
					warnings: [],
					terminal: { resultStatus: "completed", completedAt: "2026-08-24T00:00:02.000Z" },
					checkpoint: { successfulWriteFingerprints: [], evidence: [] },
					createdAt: "2026-08-24T00:00:01.000Z",
					updatedAt: "2026-08-24T00:00:02.000Z",
				}, {
					sessionId: MOCK_SESSION_ID,
					requestId: id,
					runId: "e2e-run-1",
				});
			}, 120);
			return { accepted: true };
		});
		const { mainWindow } = await launchStudio();
		await openSessionSurface(mainWindow);
		const composer = mainWindow.locator("[data-studio-composer=\"true\"] textarea");
		await composer.fill("Hello from E2E");
		await composer.press("Enter");
		await mockBackend.waitForRequest("ai.chat");
		await expect(mainWindow.locator("[data-studio-app-layer=\"true\"]")).not.toHaveAttribute("aria-hidden", "true");
		await expect(mainWindow.getByText("Mock reply from E2E")).toBeVisible({ timeout: 15_000 });
		await expect.poll(() => mockBackend.getRequests("ai.chat").length).toBe(1);
	});

		test("审批请求可拒绝并恢复终态", async ({ launchStudio, mockBackend }) => {
		let pending = true;
		mockBackend.setHandler("approval.list", () => ({
			mode: "manual",
			pending: pending
				? [{ approvalId: "approval-1", requestId: "request-approval-1", toolName: "terminal.exec", reason: "Needs permission" }]
				: [],
		}));
		const { mainWindow } = await launchStudio();
		await openSessionSurface(mainWindow);
		const composer = mainWindow.locator("[data-studio-composer=\"true\"] textarea");
		await composer.fill("Start approval flow");
		await composer.press("Enter");
		await mockBackend.waitForRequest("session.create");
		mockBackend.sendEvent("session.workbench.updated", {
			workbench: createWorkbench({
				activeRun: { status: "approval", requestId: "request-approval-1", sequence: 1 },
				pendingApproval: {
					count: 1,
					first: { approvalId: "approval-1", requestId: "request-approval-1", toolName: "terminal.exec", reason: "Needs permission" },
				},
			}),
		}, { sessionId: MOCK_SESSION_ID, requestId: "request-approval-1", runId: "e2e-run-approval" });
		await expect(mainWindow.locator("[data-studio-approval=\"true\"]")).toBeVisible({ timeout: 10_000 });
		pending = false;
		await mainWindow.locator("[data-studio-approval-reject=\"true\"]").click();
		await mockBackend.waitForRequest("approval.reject");
		await expect(mainWindow.locator("[data-studio-approval=\"true\"]")).toHaveCount(0);
	});

	test("设置窗口能修改并保留客户端偏好", async ({ launchStudio, mockBackend }) => {
		const { electronApp, mainWindow } = await launchStudio();
		const settingsWindowPromise = electronApp.waitForEvent("window");
		await mainWindow.locator("[data-studio-open-settings=\"true\"]").click();
		const settingsWindow = await settingsWindowPromise;
		await settingsWindow.waitForLoadState("domcontentloaded");
		await expect(settingsWindow.locator("[data-studio-settings-window=\"true\"]")).toBeVisible();
		await settingsWindow.getByRole("menuitem", { name: /General|常规|通用/ }).click();
		const preferenceSwitch = settingsWindow.locator("[data-settings-search-key=\"item:general.autoCompactActivityDetails\"] .ant-switch");
		const developerModeSwitch = settingsWindow.locator("[data-settings-search-key=\"item:general.developerMode\"] .ant-switch");
		const wasChecked: boolean = await preferenceSwitch.isChecked();
		expect(wasChecked).toBe(true);
		await expect(developerModeSwitch).toBeChecked();
		await preferenceSwitch.click();
		await developerModeSwitch.click();
		await expect.poll(() => mockBackend.getRequests("generalSettings.update").length).toBeGreaterThan(0);
		await settingsWindow.close();
		const reopenedSettingsPromise = electronApp.waitForEvent("window");
		await mainWindow.locator("[data-studio-open-settings=\"true\"]").click();
		const reopenedSettings = await reopenedSettingsPromise;
		await reopenedSettings.waitForLoadState("domcontentloaded");
		await reopenedSettings.getByRole("menuitem", { name: /General|常规|通用/ }).click();
		await expect(reopenedSettings.locator("[data-settings-search-key=\"item:general.autoCompactActivityDetails\"] .ant-switch")).toBeChecked({ checked: !wasChecked });
		await expect(reopenedSettings.locator("[data-settings-search-key=\"item:general.developerMode\"] .ant-switch")).not.toBeChecked();
	});

	test("轨迹 Dock 展示 Prompt、精简记录、实时更新和开发者模式摘要", async ({ launchStudio, mockBackend }) => {
		let developerMode: boolean = true;
		let revision: number = 12;
		const records: Record<string, unknown>[] = [
			{
				recordId: "trace-turn-1", sessionId: MOCK_SESSION_ID, sequence: 1, turn: 1, kind: "turn", status: "success",
				requestId: "trace-request-1", startedAt: "2026-08-24T00:00:01.000Z", finishedAt: "2026-08-24T00:00:02.000Z",
				durationMs: 1000, detailLevel: "summary", summary: {}, truncated: false, hasDetails: false, revision: 1,
			},
			{
				recordId: "trace-tool-old", parentId: "trace-turn-1", sessionId: MOCK_SESSION_ID, sequence: 2, turn: 1, kind: "tool_call", status: "success",
				requestId: "trace-request-1", runId: "trace-run-1", toolCallId: "trace-tool-call-old", startedAt: "2026-08-24T00:00:01.100Z", finishedAt: "2026-08-24T00:00:01.300Z",
				durationMs: 200, detailLevel: "compacted", summary: { toolName: "workspace.read_file" }, truncated: false, hasDetails: false, revision: 2,
			},
			{
				recordId: "trace-turn-11", sessionId: MOCK_SESSION_ID, sequence: 3, turn: 11, kind: "turn", status: "success",
				requestId: "trace-request-11", startedAt: "2026-08-24T00:00:11.000Z", finishedAt: "2026-08-24T00:00:12.000Z",
				durationMs: 1000, detailLevel: "summary", summary: {}, truncated: false, hasDetails: false, revision: 3,
			},
			{
				recordId: "trace-prompt-11", parentId: "trace-turn-11", sessionId: MOCK_SESSION_ID, sequence: 4, turn: 11, kind: "prompt", status: "success",
				requestId: "trace-request-11", runId: "trace-run-11", provider: "openai", model: "gpt-4o-mini", startedAt: "2026-08-24T00:00:11.010Z", finishedAt: "2026-08-24T00:00:11.020Z",
				durationMs: 10, inputTokens: 120, outputTokens: 0, detailLevel: "full", summary: { sectionCount: 2 }, truncated: false, hasDetails: true, revision: 4,
			},
			{
				recordId: "trace-approval-11", parentId: "trace-turn-11", sessionId: MOCK_SESSION_ID, sequence: 5, turn: 11, kind: "approval", status: "success",
				requestId: "trace-request-11", runId: "trace-run-11", toolCallId: "trace-tool-call-11", startedAt: "2026-08-24T00:00:11.200Z", finishedAt: "2026-08-24T00:00:11.500Z",
				durationMs: 300, detailLevel: "summary", summary: { approvalId: "approval-11" }, truncated: false, hasDetails: false, revision: 5,
			},
			{
				recordId: "trace-retry-11", parentId: "trace-turn-11", sessionId: MOCK_SESSION_ID, sequence: 6, turn: 11, kind: "retry", status: "success",
				requestId: "trace-request-11", runId: "trace-run-11", startedAt: "2026-08-24T00:00:11.500Z", finishedAt: "2026-08-24T00:00:11.600Z",
				durationMs: 100, detailLevel: "summary", summary: { reason: "transport" }, truncated: false, hasDetails: false, revision: 6,
			},
			{
				recordId: "trace-final-11", parentId: "trace-turn-11", sessionId: MOCK_SESSION_ID, sequence: 7, turn: 11, kind: "final_response", status: "success",
				requestId: "trace-request-11", runId: "trace-run-11", startedAt: "2026-08-24T00:00:11.700Z", finishedAt: "2026-08-24T00:00:12.000Z",
				durationMs: 300, outputTokens: 44, detailLevel: "full", summary: {}, truncated: false, hasDetails: true, revision: 7,
			},
		];
		const generalSettings = (): Record<string, unknown> => ({
			schemaVersion: 5, nextStepHintsEnabled: false, autoCompactActivityDetails: true, developerMode,
			godotExecutablePath: null, godotExecutableVersion: null, godotExecutableStatus: "unconfigured", godotExecutableError: null,
			updatedAt: "2026-08-24T00:00:00.000Z",
		});
		mockBackend.setHandler("generalSettings.get", generalSettings);
		mockBackend.setHandler("generalSettings.update", ({ params }) => {
			const patch = params as { developerMode?: boolean };
			if (patch.developerMode !== undefined) developerMode = patch.developerMode;
			return generalSettings();
		});
		mockBackend.setHandler("session.trace.summary", () => ({
			revision, turnCount: 11, modelCallCount: records.filter((record) => record.kind === "model_call").length,
			toolCallCount: 2, errorCount: 0, durationMs: 11_000, inputTokens: 480, outputTokens: 96, hasDetails: true,
		}));
		mockBackend.setHandler("session.trace.page", () => ({ revision, records }));
		mockBackend.setHandler("session.trace.detail", ({ params }) => {
			const recordId: string = (params as { recordId: string }).recordId;
			const record = records.find((candidate) => candidate.recordId === recordId);
			if (record === undefined) throw new Error(`Unknown trace ${recordId}`);
			if (record.detailLevel === "compacted") return { record, promptSections: [], redactions: [], detailLevel: "compacted" };
			if (!developerMode) return { record, promptSections: [], redactions: [], detailLevel: record.detailLevel, detailsHidden: true };
			return {
				record,
				promptSections: recordId === "trace-prompt-11" ? [{ id: "system", kind: "system", label: "System Prompt", content: "System policy from E2E", charCount: 22, contentHash: "hash", truncated: false }] : [],
				request: { temperature: 0.2, Authorization: "[redacted]" },
				response: recordId === "trace-final-11" ? "Final response from E2E" : { ok: true },
				redactions: ["request.Authorization"],
				detailLevel: record.detailLevel,
			};
		});

		const { electronApp, mainWindow } = await launchStudio();
		await openSessionSurface(mainWindow);
		const composer = mainWindow.locator("[data-studio-composer=\"true\"] textarea");
		await composer.fill("Create trajectory session");
		await composer.press("Enter");
		await mockBackend.waitForRequest("session.create");
		await mainWindow.locator("[data-studio-open-side-dock=\"true\"]").click();
		await mainWindow.locator("[data-studio-dock-add=\"true\"]").click();
		await mainWindow.getByRole("menuitem", { name: /Trajectory panel|轨迹面板/ }).click();

		const panel = mainWindow.locator("[data-testid=\"trajectory-panel\"]");
		await expect(panel).toBeVisible();
		await expect(panel.locator("[data-testid=\"trajectory-gantt\"]")).toBeVisible();
		await expect(panel.getByText(/Phase filters|阶段筛选/)).toBeVisible();
		await expect(panel.getByText(/Turn 11|第 11 轮/)).toBeVisible();
		await expect(panel.locator("[data-testid=\"trajectory-record-trace-tool-old\"]")).toContainText(/Details compacted|详情已精简/);
		const chartSurface = panel.locator("canvas").first();
		const chartBounds = await chartSurface.boundingBox();
		if (chartBounds === null) throw new Error("Trajectory Gantt surface is not visible");
		await mainWindow.mouse.move(
			chartBounds.x + chartBounds.width * 0.25,
			chartBounds.y + chartBounds.height / 2,
		);
		await mainWindow.mouse.down();
		await mainWindow.mouse.move(
			chartBounds.x + chartBounds.width * 0.96,
			chartBounds.y + chartBounds.height / 2,
		);
		await mainWindow.mouse.up();
		await expect(panel.locator("[data-testid=\"trajectory-record-trace-tool-old\"]")).toHaveCount(0);
		await expect(panel.locator("[data-testid=\"trajectory-record-trace-prompt-11\"]")).toBeVisible();
		await panel.locator("[data-testid=\"trajectory-record-trace-prompt-11\"]").click();
		await expect(panel.getByText("System Prompt")).toBeVisible();
		await panel.getByText("System Prompt").click();
		await expect(panel.getByText("System policy from E2E")).toBeVisible();
		await expect(panel.getByText("request.Authorization")).toBeVisible();

		const liveRecord = {
			recordId: "trace-model-live", parentId: "trace-turn-11", sessionId: MOCK_SESSION_ID, sequence: 8, turn: 11, kind: "model_call", status: "success",
			requestId: "trace-request-11", runId: "trace-run-11", provider: "openai", model: "gpt-4o-mini", startedAt: "2026-08-24T00:00:11.100Z", finishedAt: "2026-08-24T00:00:11.900Z",
			durationMs: 800, inputTokens: 360, outputTokens: 52, detailLevel: "full", summary: {}, truncated: false, hasDetails: true, revision: ++revision,
		};
		records.push(liveRecord);
		mockBackend.sendEvent("session.trace.updated", { revision, recordId: liveRecord.recordId, changeType: "completed", record: liveRecord }, { sessionId: MOCK_SESSION_ID, requestId: "trace-request-11", runId: "trace-run-11" });
		await expect(panel.locator("[data-testid=\"trajectory-record-trace-model-live\"]")).toBeVisible();

		const settingsWindowPromise = electronApp.waitForEvent("window");
		await mainWindow.locator("[data-studio-open-settings=\"true\"]").click();
		const settingsWindow = await settingsWindowPromise;
		await settingsWindow.waitForLoadState("domcontentloaded");
		await settingsWindow.getByRole("menuitem", { name: /General|常规|通用/ }).click();
		await settingsWindow.locator("[data-settings-search-key=\"item:general.developerMode\"] .ant-switch").click();
		await expect.poll(() => developerMode).toBe(false);
		await settingsWindow.close();
		await panel.locator("[data-testid=\"trajectory-record-trace-model-live\"]").click();
		await expect(panel.getByText(/Developer mode is off|开发者模式已关闭/)).toBeVisible();

		mockBackend.closeConnections();
		await expect.poll(() => mockBackend.getRequests("client.hello").length, { timeout: 20_000 }).toBeGreaterThan(1);
		await expect(panel.locator("[data-testid=\"trajectory-record-trace-model-live\"]")).toBeVisible();
	});

	test("超过十轮后时间线显示精简状态并保留最近一轮详情", async ({ launchStudio, mockBackend }) => {
		const timelineBlocks: Record<string, unknown>[] = [];
		for (let index: number = 1; index <= 11; index += 1) {
			const requestId: string = `compact-request-${index}`;
			const compacted: boolean = index === 1;
			timelineBlocks.push({
				id: `user-${index}`,
				type: "user",
				requestId,
				content: `Turn ${index}`,
				sentAtUtc: "2026-08-24T00:00:01.000Z",
			});
			timelineBlocks.push({
				id: `assistant-${index}`,
				type: "assistant",
				requestId,
				content: `Reply ${index}`,
				startedAtUtc: "2026-08-24T00:00:01.000Z",
				completedAtUtc: "2026-08-24T00:00:02.000Z",
				completionStatus: "responded",
				bodyParts: compacted
					? [
						{ type: "thinking", text: "compacted raw thought", done: true, detailLevel: "compacted", compactedSummary: "详情已精简" },
						{
							type: "tool",
							tool_call_id: "compact-tool-1",
							detailLevel: "compacted",
							compactedSummary: "详情已精简",
							events: [
								{ type: "tool.call", toolName: "mcp_workspace_read_text_file", toolCallId: "compact-tool-1", args: { path: "secret.txt" } },
								{ type: "tool.result", toolName: "mcp_workspace_read_text_file", toolCallId: "compact-tool-1", ok: true },
							],
						},
						{ type: "markdown", text: "Reply 1" },
					]
					: [
						{ type: "thinking", text: `full thought ${index}`, done: true },
						{
							type: "tool",
							tool_call_id: `full-tool-${index}`,
							events: [
								{ type: "tool.call", toolName: "mcp_workspace_read_text_file", toolCallId: `full-tool-${index}`, args: { path: `full-${index}.txt` } },
								{ type: "tool.result", toolName: "mcp_workspace_read_text_file", toolCallId: `full-tool-${index}`, ok: true, summary: `full tool output turn ${index}` },
							],
						},
						{ type: "markdown", text: `Reply ${index}` },
					],
			});
		}
		mockBackend.setHandler("session.timeline", ({ params }) => ({
			timeline: true,
			sessionId: (params as { sessionId?: string } | undefined)?.sessionId ?? MOCK_SESSION_ID,
			blockCount: timelineBlocks.length,
			blockOffset: 0,
			eventCount: 55,
			limit: 100,
			hasMoreBefore: false,
			hasMoreAfter: false,
			timelineBlocks,
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null,
		}));
		const sessionMetadata = {
			id: MOCK_SESSION_ID,
			title: "Compaction session",
			temporary: false,
			createdAt: "2026-08-24T00:00:00.000Z",
			updatedAt: "2026-08-24T00:00:02.000Z",
		};
		mockBackend.setHandler("session.list", () => ({ sessions: [sessionMetadata] }));
		mockBackend.setHandler("session.open", () => ({
			opened: true,
			metadata: sessionMetadata,
			blockCount: timelineBlocks.length,
			blockOffset: 0,
			eventCount: 55,
			limit: 100,
			hasMoreBefore: false,
			hasMoreAfter: false,
			timelineBlocks,
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null,
			pendingGuides: [],
			messageQueue: [],
			selectionAskThreads: [],
			workbench: createWorkbench(),
			agentRuns: [],
			activeAgentRun: null,
			currentGoal: null,
			workspaceWarning: null,
		}));
		const { mainWindow } = await launchStudio();
		await mainWindow.getByText("Compaction session", { exact: true }).click();
		await expect(mainWindow.getByText("Reply 11", { exact: true })).toBeVisible({ timeout: 15_000 });
		const timelineScroller = mainWindow.locator("[class*='messageList']").first();
		await timelineScroller.evaluate((element): void => {
			element.dispatchEvent(new WheelEvent("wheel", { deltaY: -1000, bubbles: true }));
			(element as HTMLElement).scrollTop = 0;
			element.dispatchEvent(new Event("scroll", { bubbles: true }));
		});
		await mainWindow.mouse.move(1000, 300);
		await mainWindow.mouse.wheel(0, -20_000);
		await mainWindow.mouse.click(1000, 300);
		await mainWindow.keyboard.press("Home");
		await mainWindow.waitForTimeout(500);
		await expect(mainWindow.getByText(/Thought details compacted|思考详情已精简/)).toBeVisible({ timeout: 15_000 });
		await expect(mainWindow.getByText("compacted raw thought")).toHaveCount(0);
		const toolLabels = mainWindow.getByText(/Read file|读取文件/);
		await toolLabels.first().click();
		await expect(mainWindow.getByText("详情已精简", { exact: true })).toBeVisible();
		await timelineScroller.evaluate((element): void => {
			(element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight;
			element.dispatchEvent(new Event("scroll", { bubbles: true }));
		});
		await mainWindow.mouse.move(1000, 300);
		await mainWindow.mouse.wheel(0, 20_000);
		await expect(mainWindow.getByText("Reply 11", { exact: true })).toBeVisible();
		await mainWindow.getByRole("button", { name: /full-11\.txt/ }).click();
		await expect(mainWindow.getByText("full tool output turn 11")).toBeVisible();
	});

	test("Backend 断连后自动重连并重新发送 hello", async ({ launchStudio, mockBackend }) => {
		const { mainWindow } = await launchStudio();
		const initialHelloCount: number = mockBackend.getRequests("client.hello").length;
		mockBackend.closeConnections();
		await expect.poll(() => mockBackend.getRequests("client.hello").length, { timeout: 20_000 }).toBeGreaterThan(initialHelloCount);
		await expect(mainWindow.locator("[data-studio-home=\"true\"]")).toBeVisible();
	});

	test("临时 Godot 项目可通过 UI 选择并注册", async ({ launchStudio, mockBackend, userDataDir }) => {
		const projectDirectory: string = join(userDataDir, "godot-fixture");
		await mkdir(projectDirectory, { recursive: true });
		await writeFile(join(projectDirectory, "project.godot"), "[application]\nconfig/name=E2E Fixture\n", "utf8");
		mockBackend.setHandler("environment.configure", ({ params }) => ({
			configured: true,
			godotExecutablePath: null,
			workspaceRoot: (params as { workspaceRoot: string }).workspaceRoot,
			workspaceId: "workspace-e2e",
			workspace: {
				id: "workspace-e2e",
				name: "E2E Fixture",
				kind: "godot",
				rootPath: projectDirectory,
				icon: 0,
				color: 0,
				sourceFolders: [{ id: "source-e2e", path: projectDirectory, capabilities: { git: false, godot: true } }],
				primarySourceFolderId: "source-e2e",
			},
		}));
		mockBackend.setHandler("workspace.update", ({ params }) => ({
			workspace: {
				id: "workspace-e2e",
				name: (params as { name: string }).name,
				kind: "godot",
				rootPath: projectDirectory,
				icon: 0,
				color: 0,
				sourceFolders: [{ id: "source-e2e", path: projectDirectory, capabilities: { git: false, godot: true } }],
				primarySourceFolderId: "source-e2e",
			},
		}));
		const { electronApp, mainWindow } = await launchStudio();
		await electronApp.evaluate(({ dialog }, selectedPath) => {
			(dialog as unknown as { showOpenDialog: () => Promise<unknown> }).showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
		}, projectDirectory);
		await mainWindow.locator("[data-studio-new-project=\"true\"]").dispatchEvent("click");
		await mainWindow.getByRole("button", { name: /Add folder|添加文件夹/ }).click();
		await mainWindow.getByRole("textbox", { name: /Project name|项目名称/ }).fill("E2E Fixture");
		await mainWindow.locator("[data-studio-project-confirm=\"true\"]").click();
		const configureRequest = await mockBackend.waitForRequest("environment.configure");
		await expect(mainWindow.getByText("E2E Fixture").first()).toBeVisible();
		await expect(configureRequest.params).toBeTruthy();
	});

	test("工作区文件可通过 Files panel 编辑并保存到磁盘", async ({ launchStudio, mockBackend, userDataDir }) => {
		const projectDirectory: string = join(userDataDir, "workspace-file-fixture");
		const filePath: string = join(projectDirectory, "notes.md");
		await mkdir(projectDirectory, { recursive: true });
		await writeFile(join(projectDirectory, "project.godot"), "[application]\nconfig/name=Workspace File Fixture\n", "utf8");
		await writeFile(filePath, "# Before\n\nThis content came from disk.\n", "utf8");

		const workspace = {
			id: "workspace-file-e2e",
			name: "Workspace File Fixture",
			kind: "godot" as const,
			rootPath: projectDirectory,
			icon: 0 as const,
			color: 0 as const,
			sourceFolders: [{ id: "source-file-e2e", path: projectDirectory, capabilities: { git: false, godot: true } }],
			primarySourceFolderId: "source-file-e2e",
		};
		mockBackend.setHandler("environment.configure", () => ({
			configured: true,
			godotExecutablePath: null,
			workspaceRoot: projectDirectory,
			workspaceId: workspace.id,
			workspace,
		}));
		mockBackend.setHandler("workspace.update", ({ params }) => ({
			workspace: { ...workspace, name: (params as { name: string }).name },
		}));

		const { electronApp, mainWindow } = await launchStudio();
		await electronApp.evaluate(({ dialog }, selectedPath) => {
			(dialog as unknown as { showOpenDialog: () => Promise<unknown> }).showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
		}, projectDirectory);
		await mainWindow.locator("[data-studio-new-project=\"true\"]").dispatchEvent("click");
		await mainWindow.getByRole("button", { name: /Add folder|添加文件夹/ }).click();
		await mainWindow.getByRole("textbox", { name: /Project name|项目名称/ }).fill("Workspace File Fixture");
		await mainWindow.locator("[data-studio-project-confirm=\"true\"]").click();
		await mockBackend.waitForRequest("environment.configure");
		await expect(mainWindow.getByText("Workspace File Fixture").first()).toBeVisible({ timeout: 15_000 });

		await mainWindow.locator("[data-studio-open-side-dock=\"true\"]").click();
		await expect(mainWindow.locator("[data-side-dock-open=\"true\"]")).toBeVisible();
		await mainWindow.locator("[data-studio-dock-add=\"true\"]").click();
		await mainWindow.getByRole("menuitem", { name: /Files panel|文件面板/ }).click();

		const filesPanel = mainWindow.locator("[data-studio-files-panel=\"true\"]");
		await expect(filesPanel).toBeVisible();
		await expect(filesPanel.getByText("notes.md", { exact: true })).toBeVisible({ timeout: 10_000 });
		await filesPanel.getByText("notes.md", { exact: true }).click();
		const editor = filesPanel.locator("[data-studio-monaco-editor=\"true\"]");
		await expect(editor).toBeVisible({ timeout: 15_000 });
		await editor.locator(".view-lines").click({ position: { x: 80, y: 16 } });
		await mainWindow.keyboard.press("Control+A");
		await mainWindow.keyboard.insertText("# After\n\nThis content was saved by the Studio E2E flow.\n");
		await filesPanel.getByRole("button", { name: /Save|保存/ }).click();
		await expect.poll(async () => readFile(filePath, "utf8"), { timeout: 15_000 }).toBe("# After\n\nThis content was saved by the Studio E2E flow.\n");
	});
});
