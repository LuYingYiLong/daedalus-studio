import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Home composer controller source", () => {
	it("keeps session creation, worktree setup, and first send in one flow", () => {
		const source: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"app",
			"runtime",
			"hooks",
			"useHomeComposerController.ts",
		);

		expect(source).toContain("await createSession({");
		expect(source).toContain("await createSessionWorktree(");
		expect(source).toContain("setActiveSessionId(activeSessionId);");
		expect(source).toContain("recordOpenedSession(activeSessionId);");
		expect(source).toContain("await sendChatMessage({");
	});

	it("keeps cancellation checkpoints and submission cleanup around the first send", () => {
		const source: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"app",
			"runtime",
			"hooks",
			"useHomeComposerController.ts",
		);
		const cancellationCheck: number = source.indexOf(
			"cancelledChatRequestIdsRef.current.has(requestId)",
		);
		const firstSend: number = source.indexOf("await sendChatMessage({");
		const cleanup: number = source.indexOf(
			"homeSubmissionPendingRef.current = false;",
		);

		expect(source).toContain("homeSubmissionPendingRef.current = true;");
		expect(cancellationCheck).toBeGreaterThanOrEqual(0);
		expect(firstSend).toBeGreaterThan(cancellationCheck);
		expect(cleanup).toBeGreaterThan(firstSend);
		expect(source).toContain("cancelledChatRequestIdsRef.current.delete(requestId);");
		expect(source).toContain("setIsHomeSubmitting(false);");
	});
});
