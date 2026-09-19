import { describe, expect, it } from "vitest";
import { resolveHomeWorkbenchScope } from "@/features/home/surface/home-workbench-scope";

describe("home workbench scope", () => {
	it("keeps a Chat session as the dock and summary scope", () => {
		expect(resolveHomeWorkbenchScope({
			primarySurface: "chat",
			isHome: false,
			activeSessionId: "session-daedalus",
			flowId: null,
			workspaceId: "workspace-daedalus",
		})).toEqual({
			sessionId: "session-daedalus",
			layoutScopeId: "session-daedalus",
			terminalRuntimeScopeId: "session-daedalus",
			summaryScopeKey: "session-daedalus",
		});
	});

	it("isolates Flow state from the previously active Chat session", () => {
		expect(resolveHomeWorkbenchScope({
			primarySurface: "flow",
			isHome: false,
			activeSessionId: "session-daedalus",
			flowId: "flow-miscard",
			workspaceId: "workspace-miscard",
		})).toEqual({
			sessionId: null,
			layoutScopeId: "flow:flow-miscard",
			terminalRuntimeScopeId: "flow:flow-miscard",
			summaryScopeKey: "flow:flow-miscard:workspace:workspace-miscard",
		});
	});

	it("uses the workspace summary scope on the Chat home", () => {
		expect(resolveHomeWorkbenchScope({
			primarySurface: "chat",
			isHome: true,
			activeSessionId: "stale-session",
			flowId: null,
			workspaceId: "workspace-home",
		})).toEqual({
			sessionId: null,
			layoutScopeId: "stale-session",
			terminalRuntimeScopeId: "stale-session",
			summaryScopeKey: "workspace:workspace-home",
		});
	});
});
