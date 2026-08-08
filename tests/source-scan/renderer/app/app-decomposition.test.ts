import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("App decomposition", () => {
	it("keeps App as a small coordinator", () => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "shell", "App.tsx");
		const lines: number = source.split(/\r?\n/).length;

		expect(lines).toBeLessThan(180);
		expect(source).toContain('from "../runtime/useAppController"');
		expect(source).toContain("<HomePage {...homePageProps} />");
		expect(source).toContain("<WorkspaceProjectDialog");
		expect(source).not.toContain("@/platform/rpc/session-api");
		expect(source).not.toContain("@/platform/rpc/chat-api");
		expect(source).not.toContain("useBackendEventStream");
	});

	it("keeps domain controllers outside App", () => {
		const controllerSource: string = readRepoFile("src", "renderer", "src", "app", "runtime", "useAppController.tsx");
		expect(controllerSource).toContain("useApprovalController");
		expect(controllerSource).toContain("useWorkspaceContextController");
		expect(controllerSource).toContain("useAppEventBridge");
		expect(controllerSource).toContain("usePlanGoalController");
		expect(controllerSource).toContain("useTimelineController");
		expect(controllerSource).toContain("@/features/approval/controllers/useApprovalController");
		expect(controllerSource).toContain("@/features/composer/controllers/usePlanGoalController");
		expect(controllerSource).not.toContain("from \"./AppShell\"");
	});
});
