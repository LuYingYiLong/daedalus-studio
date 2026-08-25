import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("First-turn Worktree controller source", () => {
	it("keeps Worktree preparation and non-ready setup states behind one boundary", () => {
		const source: string = [
			readRepoFile(
				"src",
				"renderer",
				"src",
				"app",
				"runtime",
				"hooks",
				"useFirstTurnWorktreeController.ts",
			),
			readRepoFile(
				"src",
				"renderer",
				"src",
				"app",
				"runtime",
				"hooks",
				"useComposerTimelineRuntimeController.ts",
			),
		].join("\n");

		expect(source).toContain("await createSessionWorktree(");
		expect(source).toContain("worktreeResult.workbench === null");
		expect(source).toContain('status ?? "ready"');
		expect(source).toContain("setActiveSessionMetadata(worktreeResult.metadata);");
		expect(source).toContain("setWorkbench(worktreeResult.workbench);");
	});

	it("always clears preparation state and blocks the send when setup is not ready", () => {
		const source: string = [
			readRepoFile(
				"src",
				"renderer",
				"src",
				"app",
				"runtime",
				"hooks",
				"useFirstTurnWorktreeController.ts",
			),
			readRepoFile(
				"src",
				"renderer",
				"src",
				"app",
				"runtime",
				"hooks",
				"useComposerTimelineRuntimeController.ts",
			),
		].join("\n");

		expect(source).toContain("blocked: true");
		expect(source).toContain("setIsWorktreePreparing(false);");
		expect(source).toContain("replaceComposerInput(request.nextMessage, request.sessionId);");
		expect(source).toContain("Worktree setup failed. Retry, skip, or delete the worktree before sending.");
	});
});
