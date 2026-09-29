import { describe, expect, it, vi } from "vitest";
import type {
	WorkbenchPatch,
	WorkbenchPatchResult,
	WorkbenchSnapshot,
} from "@/platform/rpc/types";
import {
	patchContextForCurrentSession,
	type ContextPatchScope,
} from "@/features/workspace/controllers/context-patch";

const action: NonNullable<WorkbenchPatch["additionalContextAction"]> = {
	action: "addOrReplace",
	item: {
		id: "review-comment",
		kind: "git_diff_comment",
		title: "change.ts",
		summary: "Check this line",
		pinned: true,
		source: "manual",
	},
};

function workbench(sessionId: string): WorkbenchSnapshot {
	return { sessionId } as WorkbenchSnapshot;
}

describe("context patch session scope", () => {
	it("creates the NewSessionHome session before sending a review comment", async () => {
		let activeSessionId: string | null = null;
		let finishCreation!: (sessionId: string) => void;
		const queueWorkbenchPatch = vi.fn();
		const sendWorkbenchPatch = vi.fn(async (_patch: WorkbenchPatch, _applyResult?: boolean, beforeSend?: () => void): Promise<WorkbenchPatchResult> => {
			beforeSend?.();
			return { changed: true, workbench: workbench("new-daedalus-session") };
		});
		const applyWorkbench = vi.fn();
		const scope: ContextPatchScope = {
			getNavigationVersion: () => 2,
			getActiveSessionId: () => activeSessionId,
			ensureActiveSessionId: () => new Promise<string>((resolve) => {
				finishCreation = resolve;
			}),
			queueWorkbenchPatch,
			sendWorkbenchPatch,
			applyWorkbench,
		};

		const pending = patchContextForCurrentSession(action, scope);
		expect(sendWorkbenchPatch).not.toHaveBeenCalled();
		expect(queueWorkbenchPatch).not.toHaveBeenCalled();
		activeSessionId = "new-daedalus-session";
		finishCreation(activeSessionId);

		expect(await pending).toBe("applied");
		expect(sendWorkbenchPatch).toHaveBeenCalledWith(
			{ additionalContextAction: action },
			false,
			expect.any(Function),
		);
		expect(applyWorkbench).toHaveBeenCalledWith(workbench(activeSessionId));
	});

	it("drops a pending comment if navigation changes before session creation", async () => {
		let navigationVersion = 2;
		let activeSessionId: string | null = null;
		let finishCreation!: (sessionId: string) => void;
		const queueWorkbenchPatch = vi.fn();
		const sendWorkbenchPatch = vi.fn();
		const applyWorkbench = vi.fn();
		const scope: ContextPatchScope = {
			getNavigationVersion: () => navigationVersion,
			getActiveSessionId: () => activeSessionId,
			ensureActiveSessionId: () => new Promise<string>((resolve) => {
				finishCreation = resolve;
			}),
			queueWorkbenchPatch,
			sendWorkbenchPatch,
			applyWorkbench,
		};

		const pending = patchContextForCurrentSession(action, scope);
		navigationVersion = 3;
		activeSessionId = "other-session";
		finishCreation("new-daedalus-session");
		expect(await pending).toBe("stale");
		expect(sendWorkbenchPatch).not.toHaveBeenCalled();
		expect(queueWorkbenchPatch).not.toHaveBeenCalled();
		expect(applyWorkbench).not.toHaveBeenCalled();
	});

	it("does not apply a late response to another session", async () => {
		let navigationVersion = 2;
		let activeSessionId: string | null = null;
		let finishPatch!: (result: WorkbenchPatchResult) => void;
		const applyWorkbench = vi.fn();
		const scope: ContextPatchScope = {
			getNavigationVersion: () => navigationVersion,
			getActiveSessionId: () => activeSessionId,
			ensureActiveSessionId: async () => {
				activeSessionId = "new-daedalus-session";
				return activeSessionId;
			},
			queueWorkbenchPatch: vi.fn(),
			sendWorkbenchPatch: (_patch, _applyResult, beforeSend) => {
				beforeSend?.();
				return new Promise<WorkbenchPatchResult>((resolve) => {
					finishPatch = resolve;
				});
			},
			applyWorkbench,
		};

		const pending = patchContextForCurrentSession(action, scope);
		await Promise.resolve();
		navigationVersion = 3;
		activeSessionId = "other-session";
		finishPatch({ changed: true, workbench: workbench("new-daedalus-session") });
		expect(await pending).toBe("stale");
		expect(applyWorkbench).not.toHaveBeenCalled();
	});

	it("rejects a response belonging to the previously opened session", async () => {
		let activeSessionId: string | null = null;
		const applyWorkbench = vi.fn();
		const scope: ContextPatchScope = {
			getNavigationVersion: () => 2,
			getActiveSessionId: () => activeSessionId,
			ensureActiveSessionId: async () => {
				activeSessionId = "new-daedalus-session";
				return activeSessionId;
			},
			queueWorkbenchPatch: vi.fn(),
			sendWorkbenchPatch: async (_patch, _applyResult, beforeSend) => {
				beforeSend?.();
				return { changed: true, workbench: workbench("old-miscard-session") };
			},
			applyWorkbench,
		};

		await expect(patchContextForCurrentSession(action, scope)).rejects.toThrow(
			"context_patch_session_mismatch",
		);
		expect(applyWorkbench).not.toHaveBeenCalled();
	});

	it("keeps the existing immediate patch path for an open session", async () => {
		const queueWorkbenchPatch = vi.fn();
		const ensureActiveSessionId = vi.fn();
		const scope: ContextPatchScope = {
			getNavigationVersion: () => 2,
			getActiveSessionId: () => "current-session",
			ensureActiveSessionId,
			queueWorkbenchPatch,
			sendWorkbenchPatch: vi.fn(),
			applyWorkbench: vi.fn(),
		};

		expect(await patchContextForCurrentSession(action, scope)).toBe("queued");
		expect(queueWorkbenchPatch).toHaveBeenCalledWith(
			{ additionalContextAction: action },
			true,
		);
		expect(ensureActiveSessionId).not.toHaveBeenCalled();
	});
});
