import { describe, expect, it } from "vitest";
import {
	createHomeDraft,
	createWorkspaceFromSessionMetadata,
	getChatOutputTarget,
	getDisplayedComposerModel,
	getSessionSortTime,
	insertUserBlockBeforeRequestAssistant,
	mergeOptimisticUserBlocks,
	trimTimelineFromRequest
} from "@/domain/application/app-helpers";
import { normalizeLocalPathForCompare } from "@/features/workspace/controllers/context-helpers";
import type { TimelinePageState } from "@/domain/workbench/workbench-state";
import type { TimelineBlock } from "@/platform/rpc/types";

function page(blocks: TimelineBlock[], sessionId: string = "session-1"): TimelinePageState {
	return {
		sessionId,
		blocks,
		blockCount: blocks.length,
		blockOffset: 0,
		hasMoreBefore: false,
		hasMoreAfter: false
	};
}

function userBlock(requestId: string, id: string = requestId): TimelineBlock {
	return {
		id,
		type: "user",
		requestId,
		content: requestId,
		sentAtUtc: "2026-08-08T00:00:00.000Z",
		additionalContext: [],
		renderHints: {
			estimatedHeight: 96,
			contentChars: requestId.length,
			bodyPartCount: 1,
			heavyPartCount: 0
		}
	};
}

function assistantBlock(requestId: string, id: string = requestId): TimelineBlock {
	return {
		id,
		type: "assistant",
		requestId,
		content: requestId,
		startedAtUtc: "2026-08-08T00:00:00.000Z",
		completedAtUtc: "2026-08-08T00:00:01.000Z",
		bodyParts: []
	};
}

describe("app helpers", () => {
	it("normalizes local paths for safe comparisons", () => {
		expect(normalizeLocalPathForCompare("C:/Project/src/App.tsx")).toBe("c:/project/src/app.tsx");
		expect(normalizeLocalPathForCompare("C:\\Project\\src\\App.tsx")).toBe("c:/project/src/app.tsx");
	});

	it("selects workspace output only for workspace-capable chat modes", () => {
		expect(getChatOutputTarget("agent", "workspace-1")).toBe("workspace");
		expect(getChatOutputTarget("goal", "workspace-1")).toBe("workspace");
		expect(getChatOutputTarget("ask", "workspace-1")).toBe("chat");
		expect(getChatOutputTarget("agent", null)).toBe("chat");
	});

	it("defaults new session workspace launches to File Explorer", () => {
		expect(createHomeDraft().workspaceLaunch).toBe("file-explorer");
		expect(createHomeDraft().executionEnvironment).toBe("local");
	});

	it("reconstructs every source folder from worktree session metadata", () => {
		const sourceWorkspace = {
			id: "workspace-source",
			name: "Source project",
			kind: "godot",
			rootPath: "D:/source/main",
			icon: 0,
			color: 0,
			primarySourceFolderId: "main",
			sourceFolders: [
				{
					id: "main",
					path: "D:/source/main",
					capabilities: { git: true, godot: true }
				},
				{
					id: "tools",
					path: "D:/source/tools",
					capabilities: { git: true, godot: false }
				}
			]
		} as const;
		const workspace = createWorkspaceFromSessionMetadata(
			{
				id: "session-worktree",
				title: "Worktree",
				workspaceId: "worktree-session-worktree",
				createdAt: "",
				updatedAt: "",
				worktree: {
					id: "managed-session-worktree",
					sourceWorkspaceId: "workspace-source",
					sourceWorkspaceName: "Source project",
					runtimeWorkspaceId: "worktree-session-worktree",
					createdAt: "2026-08-19T00:00:00.000Z",
					sources: [
						{
							sourceFolderId: "main",
							sourcePath: "D:/source/main",
							worktreePath: "D:/managed/main",
							baseCommit: "a",
							baseRef: "main"
						},
						{
							sourceFolderId: "tools",
							sourcePath: "D:/source/tools",
							worktreePath: "D:/managed/tools",
							baseCommit: "b",
							baseRef: "main"
						}
					]
				}
			},
			{} as never,
			sourceWorkspace as never
		);

		expect(workspace?.id).toBe("worktree-session-worktree");
		expect(workspace?.rootPath).toBe("D:/managed/main");
		expect(workspace?.sourceFolders.map((source) => source.path)).toEqual(["D:/managed/main", "D:/managed/tools"]);
	});

	it("keeps the NewSessionHome model authoritative while a temporary session exists", () => {
		expect(getDisplayedComposerModel({
			isNewSessionHome: true,
			homeDraft: {
				...createHomeDraft(),
				providerId: "xiaomi-mimo",
				modelId: "mimo-v2.5"
			},
			workbench: {
				composer: {
					provider: "deepseek",
					model: "deepseek-v4-flash"
				}
			} as never,
			activeSessionMetadata: {
				provider: "deepseek",
				model: "deepseek-v4-flash"
			} as never,
			providerModelSelection: null
		})).toEqual({ providerId: "xiaomi-mimo", modelId: "mimo-v2.5" });
	});

	it("keeps the submitted home model visible until the first session snapshot confirms it", () => {
		expect(getDisplayedComposerModel({
			isNewSessionHome: false,
			homeDraft: createHomeDraft(),
			workbench: {
				composer: {
					provider: "deepseek",
					model: "deepseek-v4-flash"
				}
			} as never,
			activeSessionMetadata: {
				provider: "deepseek",
				model: "deepseek-v4-flash"
			} as never,
			providerModelSelection: null,
			firstTurnModelTransition: {
				providerId: "xiaomi-mimo",
				modelId: "mimo-v2.5-pro"
			}
		})).toEqual({ providerId: "xiaomi-mimo", modelId: "mimo-v2.5-pro" });
	});

	it("does not replace an existing session model with the global default while snapshots load", () => {
		expect(getDisplayedComposerModel({
			isNewSessionHome: false,
			homeDraft: createHomeDraft(),
			workbench: null,
			activeSessionMetadata: null,
			providerModelSelection: {
				activeModel: {
					providerId: "deepseek",
					modelId: "deepseek-v4-flash-vision-exp"
				}
			} as never
		})).toEqual({ providerId: null, modelId: null });
	});

	it("trims timeline content from a request boundary", () => {
		const result = trimTimelineFromRequest(page([userBlock("first"), userBlock("second"), userBlock("third")]), "second");

		expect(result.blocks.map((block) => block.requestId)).toEqual(["first"]);
		expect(result.blockCount).toBe(1);
		expect(result.hasMoreAfter).toBe(false);
	});

	it("preserves an optimistic user block when the server page has not materialized it yet", () => {
		const current = page([userBlock("request-1", "optimistic:request-1:user")]);
		const next = page([userBlock("request-2")]);
		const result = mergeOptimisticUserBlocks(current, next, "request-1");

		expect(result.blocks.map((block) => block.requestId)).toEqual(["request-2", "request-1"]);
	});

	it("inserts a late queued user block before its already-live assistant block", () => {
		const result = insertUserBlockBeforeRequestAssistant(
			[userBlock("request-earlier"), assistantBlock("request-queued")],
			userBlock("request-queued", "optimistic:request-queued:user")
		);

		expect(result.map((block) => `${block.type}:${block.requestId}`)).toEqual([
			"user:request-earlier",
			"user:request-queued",
			"assistant:request-queued"
		]);
	});

	it("keeps an optimistic user block before a persisted assistant during refresh", () => {
		const current = page([userBlock("request-queued", "optimistic:request-queued:user")]);
		const next = page([assistantBlock("request-queued")]);
		const result = mergeOptimisticUserBlocks(current, next, "request-queued");

		expect(result.blocks.map((block) => `${block.type}:${block.requestId}`)).toEqual([
			"user:request-queued",
			"assistant:request-queued"
		]);
	});

	it("falls back to a stable timestamp for session sorting", () => {
		expect(
			getSessionSortTime({
				createdAt: "2026-08-01T00:00:00.000Z",
				updatedAt: "2026-08-02T00:00:00.000Z"
			} as never)
		).toBe(Date.parse("2026-08-02T00:00:00.000Z"));
		expect(
			getSessionSortTime({
				createdAt: "2026-08-01T00:00:00.000Z",
				updatedAt: "invalid"
			} as never)
		).toBe(Date.parse("2026-08-01T00:00:00.000Z"));
	});
});
