import { describe, expect, it } from "vitest";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import type { WorkspaceTreeOrderPreferences } from "@/platform/rpc/workspace-api";
import {
	canDropWorkspaceTreeNode,
	moveSectionSessionInTreeOrder,
	moveSessionInTreeOrder,
	moveWorkspaceInTreeOrder,
	reconcileWorkspaceTreeOrder,
	sortSessionsByTreeOrder,
	sortWorkspacesByTreeOrder,
	sortWorkspaceSessionsByTreeOrder
} from "@/domain/workspace/workspace-tree-order";

const WORKSPACES: WorkspaceConfig[] = [
	{ id: "workspace-a", name: "A", kind: "godot", rootPath: "D:/A", icon: 0, color: 0, sourceFolders: [], primarySourceFolderId: "" },
	{ id: "workspace-b", name: "B", kind: "godot", rootPath: "D:/B", icon: 0, color: 0, sourceFolders: [], primarySourceFolderId: "" }
];
const SESSIONS: SessionMetadata[] = [
	{ id: "session-a-new", title: "A new", workspaceId: "workspace-a", createdAt: "", updatedAt: "" },
	{ id: "session-b", title: "B", workspaceId: "workspace-b", createdAt: "", updatedAt: "" },
	{ id: "session-a-old", title: "A old", workspaceId: "workspace-a", createdAt: "", updatedAt: "" },
	{ id: "session-pinned", title: "Pinned", workspaceId: "workspace-a", pinned: true, createdAt: "", updatedAt: "" },
	{ id: "session-pinned-2", title: "Pinned 2", pinned: true, createdAt: "", updatedAt: "" },
	{ id: "session-recent", title: "Recent", createdAt: "", updatedAt: "" },
	{ id: "session-recent-2", title: "Recent 2", createdAt: "", updatedAt: "" }
];

function order(overrides: Partial<WorkspaceTreeOrderPreferences> = {}): WorkspaceTreeOrderPreferences {
	return {
		schemaVersion: 2,
		workspaceIds: ["workspace-a", "workspace-b"],
		sessionIdsByWorkspace: {
			"workspace-a": ["session-a-new", "session-a-old"],
			"workspace-b": ["session-b"]
		},
		pinnedSessionIds: ["session-pinned", "session-pinned-2"],
		recentSessionIds: ["session-recent", "session-recent-2"],
		expandedSectionKeys: ["pinned", "projects", "recent"],
		expandedWorkspaceIds: ["workspace-a"],
		updatedAt: "2026-07-30T00:00:00.000Z",
		...overrides
	};
}

describe("workspace tree order", (): void => {
	it("keeps saved positions and inserts newly visible entries first", (): void => {
		const result = reconcileWorkspaceTreeOrder(order({
			workspaceIds: ["workspace-b", "workspace-a"],
			sessionIdsByWorkspace: {
				"workspace-a": ["session-a-old"],
				"workspace-b": ["session-b"]
			}
		}), [...WORKSPACES, {
			id: "workspace-c",
			name: "C",
			kind: "godot",
			rootPath: "D:/C",
			icon: 0,
			color: 0,
			sourceFolders: [],
			primarySourceFolderId: ""
		}], SESSIONS);

		expect(result.workspaceIds).toEqual(["workspace-c", "workspace-b", "workspace-a"]);
		expect(result.sessionIdsByWorkspace["workspace-a"]).toEqual(["session-a-new", "session-a-old"]);
		expect(result.sessionIdsByWorkspace["workspace-c"]).toEqual([]);
		expect(result.pinnedSessionIds).toEqual(["session-pinned", "session-pinned-2"]);
		expect(result.recentSessionIds).toEqual(["session-recent", "session-recent-2"]);
		expect(result.expandedWorkspaceIds).toEqual(["workspace-c", "workspace-a"]);
	});

	it("keeps collapsed workspaces collapsed and removes deleted expansion ids", (): void => {
		const result = reconcileWorkspaceTreeOrder(order({
			workspaceIds: ["workspace-a", "workspace-b", "workspace-deleted"],
			expandedWorkspaceIds: ["workspace-b", "workspace-deleted"]
		}), WORKSPACES, SESSIONS);

		expect(result.expandedWorkspaceIds).toEqual(["workspace-b"]);
	});

	it("moves workspaces and sessions only in their own order arrays", (): void => {
		const workspaceResult = moveWorkspaceInTreeOrder(order(), "workspace-b", "workspace-a", "before");
		expect(workspaceResult.workspaceIds).toEqual(["workspace-b", "workspace-a"]);

		const sessionResult = moveSessionInTreeOrder(order(), "workspace-a", "session-a-old", "session-a-new", "before");
		expect(sessionResult.sessionIdsByWorkspace["workspace-a"]).toEqual(["session-a-old", "session-a-new"]);
		expect(sessionResult.sessionIdsByWorkspace["workspace-b"]).toEqual(["session-b"]);

		const pinnedResult = moveSectionSessionInTreeOrder(
			order(),
			"pinned",
			"session-pinned-2",
			"session-pinned",
			"before"
		);
		expect(pinnedResult.pinnedSessionIds).toEqual(["session-pinned-2", "session-pinned"]);
		expect(pinnedResult.recentSessionIds).toEqual(["session-recent", "session-recent-2"]);
	});

	it("only allows root workspace gaps and same-workspace session gaps", (): void => {
		const preferences = order();
		expect(canDropWorkspaceTreeNode(
			{ kind: "workspace", workspaceId: "workspace-a" },
			{ kind: "workspace", workspaceId: "workspace-b" },
			true,
			preferences
		)).toBe(true);
		expect(canDropWorkspaceTreeNode(
			{ kind: "workspace", workspaceId: "workspace-a" },
			{ kind: "session", workspaceId: "workspace-a" },
			true,
			preferences
		)).toBe(false);
		expect(canDropWorkspaceTreeNode(
			{ kind: "session", sectionKey: "projects", workspaceId: "workspace-a" },
			{ kind: "session", sectionKey: "projects", workspaceId: "workspace-b" },
			true,
			preferences
		)).toBe(false);
		expect(canDropWorkspaceTreeNode(
			{ kind: "session", sectionKey: "projects", workspaceId: "workspace-a" },
			{ kind: "session", sectionKey: "projects", workspaceId: "workspace-a" },
			false,
			preferences
		)).toBe(false);
		expect(canDropWorkspaceTreeNode(
			{ kind: "session", sectionKey: "pinned" },
			{ kind: "session", sectionKey: "pinned" },
			true,
			preferences
		)).toBe(true);
		expect(canDropWorkspaceTreeNode(
			{ kind: "session", sectionKey: "pinned" },
			{ kind: "session", sectionKey: "recent" },
			true,
			preferences
		)).toBe(false);
	});

	it("sorts render data without changing the source business order", (): void => {
		const preferences = order({
			workspaceIds: ["workspace-b", "workspace-a"],
			sessionIdsByWorkspace: {
				"workspace-a": ["session-a-old", "session-a-new"],
				"workspace-b": ["session-b"]
			}
		});
		expect(sortWorkspacesByTreeOrder(WORKSPACES, preferences).map((workspace): string => workspace.id))
			.toEqual(["workspace-b", "workspace-a"]);
		expect(sortWorkspaceSessionsByTreeOrder(SESSIONS, "workspace-a", preferences).map((session): string => session.id))
			.toEqual(["session-a-old", "session-a-new"]);
		expect(sortSessionsByTreeOrder(SESSIONS, preferences.pinnedSessionIds).map((session): string => session.id))
			.toEqual(["session-pinned", "session-pinned-2"]);
		expect(WORKSPACES.map((workspace): string => workspace.id)).toEqual(["workspace-a", "workspace-b"]);
	});
});
