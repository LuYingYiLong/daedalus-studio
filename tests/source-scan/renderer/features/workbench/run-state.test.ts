import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Run state source", () => {
	it("centralizes Composer run controls through run-state helpers", () => {
		const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const runStateSource: string = readRepoFile("src", "renderer", "src", "features", "workbench", "run-state.ts");

		expect(appSource).toContain("useState<RunControllerState>(() => createIdleRunState())");
		expect(appSource).toContain("applyRunStateFromBackendEvent(currentState, event)");
		expect(appSource).toContain("applyRunStateFromWorkbench(currentState, workbench)");
		expect(appSource).toContain("const composerIsSending: boolean = isRunControllerActive(runState) || isHomeSubmitting;");
		expect(appSource).toContain("const requestId: string | null = getRunControllerRequestId(runState);");
		expect(appSource).not.toContain("function getIsSending(");
		expect(appSource).not.toContain("function getActiveRunRequestId(");
		expect(runStateSource).toContain("agent.run.tool_budget_required");
		expect(runStateSource).toContain("agent.run.cancelled");
		expect(runStateSource).toContain("next.sequence < current.sequence");
	});
});
