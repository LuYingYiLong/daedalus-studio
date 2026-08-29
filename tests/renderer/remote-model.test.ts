import { describe, expect, it } from "vitest";
import type { SessionMetadata, WorkspaceConfig } from "../../src/renderer/src/platform/rpc/types";
import {
	buildRemoteSessionGroups,
	getRecentRemoteSessions,
	getRemoteDraftStorageKey,
	normalizeRemoteScreen,
	resolveRemoteBackAction,
} from "../../src/renderer/src/remote/remote-model";

const workspaces: WorkspaceConfig[] = [
	{ id: "workspace-a", name: "Daedalus" } as WorkspaceConfig,
	{ id: "workspace-b", name: "Godot Tools" } as WorkspaceConfig,
];

const sessions: SessionMetadata[] = [
	{ id: "session-old", title: "Remote gateway", workspaceId: "workspace-a", updatedAt: "2026-08-27T10:00:00.000Z" } as SessionMetadata,
	{ id: "session-new", title: "Mobile polish", workspaceId: "workspace-a", updatedAt: "2026-08-28T10:00:00.000Z" } as SessionMetadata,
	{ id: "session-godot", title: "Plugin diagnostics", workspaceId: "workspace-b", updatedAt: "2026-08-28T08:00:00.000Z" } as SessionMetadata,
];

describe("remote mobile model", () => {
	it("keeps primary screens requiring a session behind the active-session boundary", () => {
		expect(normalizeRemoteScreen("trajectory", false)).toBe("sessions");
		expect(normalizeRemoteScreen("conversation", true)).toBe("conversation");
		expect(normalizeRemoteScreen("approvals", false)).toBe("approvals");
	});

	it("prioritizes closing transient mobile surfaces before leaving the session", () => {
		const base = {
			navigationOpen: false,
			createOpen: false,
			fullTrustOpen: false,
			planOpen: false,
			traceDetailOpen: false,
			toolBudgetOpen: false,
			activeScreen: "conversation" as const,
		};
		expect(resolveRemoteBackAction({ ...base, navigationOpen: true })).toBe("close-navigation");
		expect(resolveRemoteBackAction({ ...base, planOpen: true })).toBe("close-plan");
		expect(resolveRemoteBackAction({ ...base, activeScreen: "conversation" })).toBe("show-sessions");
		expect(resolveRemoteBackAction({ ...base, activeScreen: "sessions" })).toBe("exit");
	});

	it("filters by project or session title without changing project membership", () => {
		expect(buildRemoteSessionGroups(workspaces, sessions, "mobile")).toEqual([
			expect.objectContaining({ workspace: workspaces[0], sessions: [sessions[1]] }),
		]);
		expect(buildRemoteSessionGroups(workspaces, sessions, "godot")[0]).toEqual(
			expect.objectContaining({ workspace: workspaces[1], sessions: [sessions[2]] }),
		);
	});

	it("sorts recent sessions and uses a session-scoped transient draft key", () => {
		expect(getRecentRemoteSessions(sessions, 2).map((session: SessionMetadata): string => session.id)).toEqual(["session-new", "session-godot"]);
		expect(getRemoteDraftStorageKey("session-new")).toBe("daedalus.remote.draft.session-new");
	});
});
