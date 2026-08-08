import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("App decomposition", () => {
	it("keeps App as a small coordinator", () => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const lines: number = source.split(/\r?\n/).length;

		expect(lines).toBeLessThan(180);
		expect(source).toContain('from "./useAppController"');
		expect(source).toContain("<HomePage {...homePageProps} />");
		expect(source).toContain("<WorkspaceProjectDialog");
		expect(source).not.toContain("@/api/session-api");
		expect(source).not.toContain("@/api/chat-api");
		expect(source).not.toContain("useBackendEventStream");
	});

	it("keeps domain controllers outside App", () => {
		expect(readRepoFile("src", "renderer", "src", "app", "useAppController.tsx")).toContain("useApprovalController");
		expect(readRepoFile("src", "renderer", "src", "app", "useAppController.tsx")).toContain("useWorkspaceContextController");
		expect(readRepoFile("src", "renderer", "src", "app", "useAppController.tsx")).toContain("useAppEventBridge");
		expect(readRepoFile("src", "renderer", "src", "app", "useAppController.tsx")).toContain("usePlanGoalController");
		expect(readRepoFile("src", "renderer", "src", "app", "useAppController.tsx")).toContain("useTimelineController");
		expect(readRepoFile("src", "renderer", "src", "app", "useAppController.tsx")).toContain("@/features/approval/controllers/useApprovalController");
		expect(readRepoFile("src", "renderer", "src", "app", "useAppController.tsx")).toContain("@/features/composer/controllers/usePlanGoalController");
		expect(readRepoFile("src", "renderer", "src", "app", "App.tsx")).not.toContain("from \"./AppShell\"");
	});
});
