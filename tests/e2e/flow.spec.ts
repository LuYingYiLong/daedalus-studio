import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/studio";

const NOW: string = "2026-09-15T00:00:00.000Z";

type Branch = {
	branchId: string;
	flowId: string;
	sessionId: string;
	parentBranchId: string | null;
	forkRequestId: string | null;
	forkRole: "user" | "assistant" | null;
	seedRequestId: string | null;
	headNodeId: string | null;
	pendingRegenerate: boolean;
	createdAt: string;
	updatedAt: string;
};

type FlowNode = {
	nodeId: string;
	flowId: string;
	branchId: string;
	sessionId: string;
	requestId: string;
	role: "user" | "assistant";
	parentNodeId: string | null;
	status: "completed";
	contentPreview: string;
	createdAt: string;
	updatedAt: string;
};

function workbench(sessionId: string): Record<string, unknown> {
	return {
		revision: 1,
		sessionId,
		composer: {
			text: "",
			chatMode: "agent",
			provider: "openai",
			model: "gpt-4o-mini",
			reasoningEffort: "medium",
			additionalContext: [],
		},
		messageQueue: [],
		pendingGuides: [],
		activeRun: { status: "idle" },
		pendingApproval: { count: 0, first: null },
		pendingToolBudget: null,
		nextStepHints: { hints: [] },
		activeSelection: { workspaceId: null, workspaceName: null, workspaceRoot: null },
	};
}

function sessionMetadata(branch: Branch, title: string = "Flow branch"): Record<string, unknown> {
	return {
		id: branch.sessionId,
		title,
		surface: "flow_branch",
		flow: { flowId: branch.flowId, branchId: branch.branchId },
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function sessionOpen(metadata: Record<string, unknown>): Record<string, unknown> {
	const sessionId: string = String(metadata.id);
	return {
		opened: true,
		metadata,
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
		pendingGuides: [],
		messageQueue: [],
		selectionAskThreads: [],
		workbench: workbench(sessionId),
		agentRuns: [],
		activeAgentRun: null,
		currentGoal: null,
		workspaceWarning: null,
	};
}

async function switchToFlow(page: Page): Promise<void> {
	await page.locator(".ant-segmented-item").filter({ hasText: /^(Flow|流)$/ }).click();
}

test.describe("Daedalus Flow", () => {
	test("creates a Flow, derives both node kinds, isolates Chat, and copies a branch", async ({ launchStudio, mockBackend }) => {
		const flowId: string = "flow-e2e";
		let revision: number = 1;
		let branchIndex: number = 1;
		let activeSessionId: string = "flow-session-1";
		const rootBranch: Branch = {
			branchId: "flow-branch-1",
			flowId,
			sessionId: activeSessionId,
			parentBranchId: null,
			forkRequestId: null,
			forkRole: null,
			seedRequestId: null,
			headNodeId: null,
			pendingRegenerate: false,
			createdAt: NOW,
			updatedAt: NOW,
		};
		const branches: Branch[] = [rootBranch];
		const nodes: FlowNode[] = [];
		const chatSessions: Array<Record<string, unknown>> = [];
		const flow = (): Record<string, unknown> => ({
			flowId,
			title: "E2E Flow",
			workspaceId: null,
			rootBranchId: rootBranch.branchId,
			revision,
			activeBranchId: null,
			activeRequestId: null,
			archivedAt: null,
			createdFromSessionId: null,
			createdAt: NOW,
			updatedAt: NOW,
		});
		const snapshot = (): Record<string, unknown> => ({ flow: flow(), branches, nodes, positions: [] });

		mockBackend.setHandler("flow.list", () => ({
			flows: branches.length === 0 ? [] : [{ ...flow(), branchCount: branches.length }],
		}));
		mockBackend.setHandler("flow.create", () => snapshot());
		mockBackend.setHandler("flow.get", () => snapshot());
		mockBackend.setHandler("session.list", () => ({ sessions: chatSessions }));
		mockBackend.setHandler("session.open", ({ params }) => {
			const sessionId: string = String((params as { sessionId: string }).sessionId);
			activeSessionId = sessionId;
			const branch = branches.find((candidate): boolean => candidate.sessionId === sessionId);
			if (branch !== undefined) return sessionOpen(sessionMetadata(branch));
			const chat = chatSessions.find((candidate): boolean => candidate.id === sessionId) ?? {
				id: sessionId,
				title: "Copied Flow chat",
				surface: "chat",
				createdAt: NOW,
				updatedAt: NOW,
			};
			return sessionOpen(chat);
		});
		mockBackend.setHandler("flow.branch.create", ({ params }) => {
			const input = params as { parentBranchId: string; sourceNodeId: string };
			const source = nodes.find((node): boolean => node.nodeId === input.sourceNodeId)!;
			branchIndex += 1;
			const branch: Branch = {
				branchId: `flow-branch-${branchIndex}`,
				flowId,
				sessionId: `flow-session-${branchIndex}`,
				parentBranchId: input.parentBranchId,
				forkRequestId: source.requestId,
				forkRole: source.role,
				seedRequestId: null,
				headNodeId: source.nodeId,
				pendingRegenerate: source.role === "user",
				createdAt: NOW,
				updatedAt: NOW,
			};
			branches.push(branch);
			revision += 1;
			return {
				branch,
				session: sessionMetadata(branch),
				seedAction: source.role === "user" ? "regenerate" : "compose",
				draft: { text: source.role === "user" ? source.contentPreview : "", additionalContext: [] },
				flow: snapshot(),
			};
		});
		mockBackend.setHandler("flow.branch.copyToChat", () => {
			const metadata = {
				id: "chat-from-flow",
				title: "Copied Flow chat",
				surface: "chat",
				createdAt: NOW,
				updatedAt: NOW,
			};
			chatSessions.push(metadata);
			return { metadata, draft: { text: "" } };
		});
		mockBackend.setHandler("ai.chat", ({ id }) => {
			const branch = branches.find((candidate): boolean => candidate.sessionId === activeSessionId)!;
			const isRegeneration: boolean = branch.forkRole === "user" && branch.pendingRegenerate;
			const userNodeId: string = isRegeneration ? branch.headNodeId! : `user:${id}`;
			if (!isRegeneration) {
				nodes.push({
					nodeId: userNodeId,
					flowId,
					branchId: branch.branchId,
					sessionId: branch.sessionId,
					requestId: id,
					role: "user",
					parentNodeId: branch.headNodeId,
					status: "completed",
					contentPreview: "Explain the Flow",
					createdAt: NOW,
					updatedAt: NOW,
				});
			}
			const assistantNodeId: string = `assistant:${id}`;
			nodes.push({
				nodeId: assistantNodeId,
				flowId,
				branchId: branch.branchId,
				sessionId: branch.sessionId,
				requestId: id,
				role: "assistant",
				parentNodeId: userNodeId,
				status: "completed",
				contentPreview: isRegeneration ? "Regenerated answer" : "Initial Flow answer",
				createdAt: NOW,
				updatedAt: NOW,
			});
			branch.headNodeId = assistantNodeId;
			branch.pendingRegenerate = false;
			revision += 1;
			setTimeout((): void => {
				mockBackend.sendEvent("flow.updated", { flowId, revision }, { sessionId: branch.sessionId, requestId: id });
				mockBackend.sendEvent("agent.message.done", { text: "Flow answer" }, { sessionId: branch.sessionId, requestId: id });
				mockBackend.sendEvent("agent.run.state", {
					schemaVersion: 1,
					runId: id,
					requestId: id,
					rootRequestId: id,
					revision: 1,
					intent: "answer",
					scope: "bounded",
					lane: "direct",
					stage: "completed",
					title: "Flow response",
					planId: null,
					todo: null,
					pause: null,
					verificationStatus: null,
					warnings: [],
					terminal: { resultStatus: "completed", completedAt: NOW },
					checkpoint: { successfulWriteFingerprints: [], evidence: [] },
					createdAt: NOW,
					updatedAt: NOW,
				}, { sessionId: branch.sessionId, requestId: id, runId: id });
			}, 20);
			return { accepted: true };
		});

		const { mainWindow } = await launchStudio();
		await switchToFlow(mainWindow);
		await mainWindow.locator('[data-studio-new-flow="true"]').click();
		await expect(mainWindow.locator('[data-studio-flow-surface="true"]')).toBeVisible();
		const composer = mainWindow.locator('[data-studio-composer="true"] textarea');
		await composer.fill("Explain the Flow");
		await composer.press("Enter");
		await expect.poll(() => mockBackend.getRequests("ai.chat").length).toBe(1);
		const firstRequestId: string = mockBackend.getRequests("ai.chat")[0]!.id;
		await expect(mainWindow.locator(`[data-flow-node-id="user:${firstRequestId}"]`)).toBeVisible();
		await expect(mainWindow.locator(`[data-flow-node-id="assistant:${firstRequestId}"]`)).toBeVisible();

		await mainWindow.locator(`[data-flow-node-id="user:${firstRequestId}"]`).getByRole("button", { name: /Regenerate|重新生成/ }).click();
		await expect.poll(() => mockBackend.getRequests("ai.chat").length).toBe(2);
		const secondRequestId: string = mockBackend.getRequests("ai.chat")[1]!.id;
		await expect(mainWindow.locator(`[data-flow-node-id="assistant:${secondRequestId}"]`)).toBeVisible();
		await expect.poll(() => branches.length).toBe(2);

		await mainWindow.locator(`[data-flow-node-id="assistant:${secondRequestId}"]`).getByRole("button", { name: /Derive|派生/ }).click();
		await expect.poll(() => branches.length).toBe(3);
		await expect(composer).toBeFocused();

		await mainWindow.getByRole("button", { name: /Copy as Chat|复制为对话/ }).click();
		await expect.poll(() => mockBackend.getRequests("flow.branch.copyToChat").length).toBe(1);
		await expect(mainWindow.locator('[data-studio-flow-surface="true"]')).toHaveCount(0);
		await expect(mainWindow.locator('[data-flow-node-id]')).toHaveCount(0);
	});

	test("copies an existing Chat session into an isolated Flow", async ({ launchStudio, mockBackend }) => {
		const chat = {
			id: "chat-source",
			title: "Chat source",
			surface: "chat",
			createdAt: NOW,
			updatedAt: NOW,
		};
		const branch: Branch = {
			branchId: "copied-branch",
			flowId: "copied-flow",
			sessionId: "copied-flow-session",
			parentBranchId: null,
			forkRequestId: null,
			forkRole: null,
			seedRequestId: null,
			headNodeId: null,
			pendingRegenerate: false,
			createdAt: NOW,
			updatedAt: NOW,
		};
		const flow = {
			flowId: branch.flowId,
			title: chat.title,
			workspaceId: null,
			rootBranchId: branch.branchId,
			revision: 1,
			activeBranchId: null,
			activeRequestId: null,
			archivedAt: null,
			createdFromSessionId: chat.id,
			createdAt: NOW,
			updatedAt: NOW,
		};
		const snapshot = { flow, branches: [branch], nodes: [], positions: [] };
		mockBackend.setHandler("session.list", () => ({ sessions: [chat] }));
		mockBackend.setHandler("session.open", ({ params }) => {
			return sessionOpen((params as { sessionId: string }).sessionId === chat.id ? chat : sessionMetadata(branch));
		});
		mockBackend.setHandler("flow.list", () => ({ flows: [] }));
		mockBackend.setHandler("flow.create.fromSession", () => snapshot);
		mockBackend.setHandler("flow.get", () => snapshot);

		const { mainWindow } = await launchStudio();
		const chatItem = mainWindow.getByText("Chat source", { exact: true });
		await expect(chatItem).toBeVisible();
		await chatItem.click({ button: "right" });
		await mainWindow.getByRole("menuitem", { name: /Copy as Flow|复制为 Flow/ }).click();
		await expect.poll(() => mockBackend.getRequests("flow.create.fromSession").length).toBe(1);
		await expect(mainWindow.locator('[data-studio-flow-surface="true"]')).toBeVisible();
		await expect(mainWindow.getByText("Chat source", { exact: true })).toBeVisible();
	});
});
