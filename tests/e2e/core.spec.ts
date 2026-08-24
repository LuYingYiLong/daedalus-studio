import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "./fixtures/studio";

const MOCK_SESSION_ID: string = "e2e-session-1";

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
		await expect(mainWindow.locator("[data-step=\"godot_plugin\"]")).toBeVisible();
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
		const preferenceSwitch = settingsWindow.getByRole("switch").nth(2);
		const wasChecked: boolean = await preferenceSwitch.isChecked();
		await preferenceSwitch.click();
		await expect.poll(() => mockBackend.getRequests("backend.health").length).toBeGreaterThan(0);
		await settingsWindow.close();
		const reopenedSettingsPromise = electronApp.waitForEvent("window");
		await mainWindow.locator("[data-studio-open-settings=\"true\"]").click();
		const reopenedSettings = await reopenedSettingsPromise;
		await reopenedSettings.waitForLoadState("domcontentloaded");
		await reopenedSettings.getByRole("menuitem", { name: /General|常规|通用/ }).click();
		await expect(reopenedSettings.getByRole("switch").nth(1)).toBeChecked({ checked: !wasChecked });
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
			godotProjectPath: (params as { godotProjectPath: string }).godotProjectPath,
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
			godotProjectPath: projectDirectory,
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
