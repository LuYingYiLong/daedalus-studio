import { describe, expect, it } from "vitest";
import type { SessionMetadata } from "@/platform/rpc/types";
import { isComposerWorkspaceSelectionLocked } from "@/domain/composer/composer-workspace-lock";

function metadata(value: Partial<SessionMetadata>): SessionMetadata {
	return value as SessionMetadata;
}

describe("composer workspace lock", () => {
	it("allows an unbound temporary new session to select a workspace", () => {
		expect(isComposerWorkspaceSelectionLocked(
			"session-temporary",
			metadata({ temporary: true })
		)).toBe(false);
	});

	it("locks a temporary session after it is bound to a workspace", () => {
		expect(isComposerWorkspaceSelectionLocked(
			"session-temporary",
			metadata({ temporary: true, workspaceId: "workspace-a" })
		)).toBe(true);
	});

	it("locks existing sessions even when legacy metadata has no workspace", () => {
		expect(isComposerWorkspaceSelectionLocked(
			"session-existing",
			metadata({ temporary: false })
		)).toBe(true);
		expect(isComposerWorkspaceSelectionLocked("session-loading", null)).toBe(true);
	});

	it("does not lock the pre-session home state", () => {
		expect(isComposerWorkspaceSelectionLocked(null, null)).toBe(false);
	});
});
