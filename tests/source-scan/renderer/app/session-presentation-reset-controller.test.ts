import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session presentation reset controller source", () => {
	const appSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"useAppController.tsx",
	);
	const controllerSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useSessionPresentationResetController.ts",
	);

	it("keeps session presentation reset orchestration outside the app controller", () => {
		expect(appSource).toContain(
			"useSessionPresentationResetController({",
		);
		expect(appSource).not.toContain(
			"function resetSessionPresentationState(): void",
		);
		expect(controllerSource).toContain("timelineStore.reset();");
		expect(controllerSource).toContain("resetTimelineUiState();");
		expect(controllerSource).toContain("clearWorkflowTodoUiState();");
		expect(controllerSource).toContain("resetPlanGoalUiState();");
		expect(controllerSource).toContain("createIdleRunState(currentState.sequence)");
	});
});
