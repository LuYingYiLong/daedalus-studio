import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Temporary session controller source", () => {
	const source: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useTemporarySessionController.ts",
	);

	it("serializes temporary session creation and preserves the home draft", () => {
		expect(source).toContain("temporarySessionCreationRef.current !== null");
		expect(source).toContain("temporary: true");
		expect(source).toContain("composerDraftsRef.current.set(created.id, currentDraftText);");
		expect(source).toContain("temporaryDraftSessionIdRef.current = created.id;");
	});

	it("restores materialized drafts with a local fallback on open failure", () => {
		expect(source).toContain("const result = await openSession(sessionId);");
		expect(source).toContain("beginLocalNewSessionDraft(");
		expect(source).toContain("deleteSessionWithLayout(sessionId)");
		expect(source).toContain('"Failed to restore New session"');
	});

	it("does not delete a temporary session while it still has a draft", () => {
		expect(source).toContain("const hasDraft: boolean =");
		expect(source).toContain("temporaryDraftSessionIdRef.current = activeSessionId;");
		expect(source).toContain("await deleteSessionWithLayout(temporaryId)");
	});
});
