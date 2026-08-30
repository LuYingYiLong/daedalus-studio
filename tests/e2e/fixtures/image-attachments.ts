import type { MockBackend } from "./mock-backend";
import type {
	AdditionalContextItem,
	WorkbenchPatch,
	WorkbenchSnapshot,
} from "../../../src/renderer/src/platform/rpc/types";

// 所有图片仅保存在测试内存中，禁止访问真实窗口、模型或本机附件目录。
export function installImageAttachmentScenario(backend: MockBackend) {
	const now = "2026-08-30T00:00:00.000Z";
	const workbenches = new Map<string, WorkbenchSnapshot>();
	const images = new Map<string, { sessionId: string; dataUrl: string }>();
	const sessions = new Map<
		string,
		{
			id: string;
			title: string;
			temporary: boolean;
			createdAt: string;
			updatedAt: string;
		}
	>();
	const timelines = new Map<string, unknown[]>();
	const active = new Map<string, string>();
	function workbench(id: string): WorkbenchSnapshot {
		if (!workbenches.has(id))
			workbenches.set(id, {
				revision: 1,
				sessionId: id,
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
				activeSelection: {
					workspaceId: null,
					workspaceName: null,
					workspaceRoot: null,
				},
			});
		return workbenches.get(id)!;
	}
	function timeline(sessionId: string) {
		const timelineBlocks = timelines.get(sessionId) ?? [];
		return {
			sessionId,
			blockCount: timelineBlocks.length,
			blockOffset: 0,
			eventCount: timelineBlocks.length,
			limit: 100,
			hasMoreBefore: false,
			hasMoreAfter: false,
			timelineBlocks,
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null,
		};
	}
	sessions.set("session-history", {
		id: "session-history",
		title: "Screenshot history",
		temporary: false,
		createdAt: now,
		updatedAt: now,
	});
	backend.setHandler("session.list", () => ({
		sessions: [...sessions.values()],
	}));
	backend.setHandler("session.selectionAsk.list", ({ params }) => ({
		sessionId: (params as { sessionId: string }).sessionId,
		threads: [],
	}));
	backend.setHandler("session.context.estimate", () => ({
		usedTokens: 100,
		inputTokens: 100,
		inputPercent: 1,
		committedTokens: 100,
		committedPercent: 1,
		outputReservePercent: 1,
		safetyMarginPercent: 1,
		availablePercent: 97,
		contextWindowTokens: 128000,
		percent: 1,
		availableTokens: 127900,
		historyTokens: 0,
		currentMessageTokens: 20,
		systemAndContextTokens: 80,
		outputReserveTokens: 1000,
		safetyMarginTokens: 1000,
		modelLabel: "GPT-4o mini",
		estimationSource: "local",
		canCompress: false,
		summaryActive: false,
		breakdown: [],
		pressure: "low",
		largestContributor: null,
	}));
	backend.setHandler("session.create", ({ params, connectionId }) => {
		const id = `session-capture-${sessions.size}`;
		const input = params as { temporary?: boolean };
		const metadata = {
			id,
			title: "Captured window session",
			temporary: input.temporary ?? false,
			createdAt: now,
			updatedAt: now,
		};
		sessions.set(id, metadata);
		active.set(connectionId, id);
		return { ...metadata, workbench: workbench(id) };
	});
	backend.setHandler("session.open", ({ params, connectionId }) => {
		const id = (params as { sessionId: string }).sessionId;
		active.set(connectionId, id);
		return {
			opened: true,
			metadata: sessions.get(id),
			...timeline(id),
			pendingGuides: [],
			messageQueue: [],
			selectionAskThreads: [],
			workbench: workbench(id),
			agentRuns: [],
			activeAgentRun: null,
			currentGoal: null,
			workspaceWarning: null,
		};
	});
	backend.setHandler("session.timeline", ({ params }) => ({
		timeline: true,
		...timeline((params as { sessionId: string }).sessionId),
	}));
	backend.setHandler("session.workbench.get", ({ connectionId }) => ({
		changed: true,
		workbench: workbench(active.get(connectionId) ?? "session-history"),
	}));
	backend.setHandler("session.workbench.patch", ({ params, connectionId }) => {
		const id = active.get(connectionId);
		if (!id) throw new Error("e2e_no_active_session");
		const current = workbench(id);
		const patch = params as WorkbenchPatch;
		let context = current.composer.additionalContext;
		const action = patch.additionalContextAction;
		if (action?.action === "addOrReplace")
			context = [
				...context.filter((item) => item.id !== action.item.id),
				action.item,
			];
		if (action?.action === "remove")
			context = context.filter((item) => item.id !== action.contextId);
		const next = {
			...current,
			revision: current.revision + 1,
			composer: {
				...current.composer,
				...patch.composer,
				additionalContext: context,
			},
		};
		workbenches.set(id, next);
		return { patched: true, workbench: next };
	});
	backend.setHandler("attachment.image.save", ({ params, connectionId }) => {
		const input = params as {
			sessionId: string;
			dataUrl: string;
			title: string;
			mimeType: string;
			byteSize: number;
			width: number;
			height: number;
		};
		if (active.get(connectionId) !== input.sessionId)
			throw new Error("e2e_wrong_attachment_session");
		const id = `image-${images.size + 1}`;
		images.set(id, { sessionId: input.sessionId, dataUrl: input.dataUrl });
		const attachment: AdditionalContextItem = {
			id,
			kind: "image",
			source: "manual",
			title: input.title,
			data: {
				attachmentId: id,
				mimeType: input.mimeType,
				byteSize: input.byteSize,
				width: input.width,
				height: input.height,
				thumbnailDataUrl: input.dataUrl,
			},
		};
		return { attachment };
	});
	backend.setHandler("attachment.image.get", ({ params, connectionId }) => {
		const attachmentId = (params as { attachmentId: string }).attachmentId;
		const image = images.get(attachmentId);
		if (!image || image.sessionId !== active.get(connectionId))
			throw new Error("e2e_image_not_found");
		return { attachmentId, dataUrl: image.dataUrl };
	});
	backend.setHandler("session.save", ({ connectionId }) => ({
		saved: true,
		sessionId: active.get(connectionId),
		messageCount: 1,
	}));
	backend.setHandler("session.delete", ({ params }) => {
		sessions.delete((params as { sessionId: string }).sessionId);
		return { deleted: true };
	});
	backend.setHandler("ai.chat", ({ id: requestId, params, connectionId }) => {
		const sessionId = active.get(connectionId)!;
		const input = params as {
			message: string;
			additionalContext?: AdditionalContextItem[];
		};
		sessions.get(sessionId)!.temporary = false;
		timelines.set(sessionId, [
			{
				id: "capture-user",
				type: "user",
				requestId,
				content: input.message,
				additionalContext:
					input.additionalContext ??
					workbench(sessionId).composer.additionalContext,
				sentAtUtc: now,
			},
			{
				id: "capture-assistant",
				type: "assistant",
				requestId,
				content: "Mock screenshot received",
				startedAtUtc: now,
				completedAtUtc: now,
				completionStatus: "responded",
				bodyParts: [{ type: "markdown", text: "Mock screenshot received" }],
			},
		]);
		return { accepted: true };
	});
	return { images, workbenches };
}
