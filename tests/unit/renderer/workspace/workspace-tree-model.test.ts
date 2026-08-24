import { describe, expect, it } from "vitest";
import {
	areStringListsEqual,
	filterVisibleSessions,
	getSelectedMenuKeys,
	getSessionProjectWorkspaceId,
} from "@/widgets/workspace/workspace-tree-model";

describe("workspace tree model", () => {
	it("filters temporary sessions and resolves worktree ownership", () => {
		const sessions = [
			{ id: "visible", temporary: false, workspaceId: "workspace-1" },
			{ id: "temporary", temporary: true, workspaceId: "workspace-1" },
			{
				id: "worktree",
				temporary: false,
				workspaceId: "workspace-1",
				worktree: { sourceWorkspaceId: "workspace-2" },
			},
		] as never[];

		expect(filterVisibleSessions(sessions).map((session) => session.id)).toEqual([
			"visible",
			"worktree",
		]);
		expect(getSessionProjectWorkspaceId(sessions[2] as never)).toBe("workspace-2");
	});

	it("prioritizes selected session, then workspace, then expanded fallback", () => {
		expect(getSelectedMenuKeys("session-1", "workspace-1", ["projects"])).toEqual(["session:session-1"]);
		expect(getSelectedMenuKeys(null, "workspace-1", ["projects"])).toEqual(["workspace:workspace-1"]);
		expect(getSelectedMenuKeys(null, null, ["projects"])).toEqual(["projects"]);
		expect(areStringListsEqual(["a", "b"], ["a", "b"])).toBe(true);
		expect(areStringListsEqual(["a"], ["b"])).toBe(false);
	});
});
