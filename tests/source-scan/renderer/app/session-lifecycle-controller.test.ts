import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session lifecycle controller source", () => {
	const source: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useSessionLifecycleController.ts",
	);

	it("resolves the session workspace from active, known, or persisted data", () => {
		expect(source).toContain("activeWorkspace?.id === session.workspaceId");
		expect(source).toContain("homeWorkspaceOptions.find(");
		expect(source).toContain("createSingleSourceWorkspaceSnapshot({");
	});

	it("cleans running and unread state when archiving a session", () => {
		expect(source).toContain("removeRunningSessions(current, [session.id])");
		expect(source).toContain("removeUnreadSessions(currentSessionIds, [session.id])");
		expect(source).toContain("await handleNewSession({");
		expect(source).toContain("restoreTemporaryDraft: true");
	});

	it("only applies rename and integrity results to the active session", () => {
		expect(source).toContain("if (session.id !== activeSessionId)");
		expect(source).toContain("activeSessionIdRef.current !== sessionId || result.ok");
		expect(source).toContain("checkSessionIntegrity(sessionId)");
	});
});
