import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Workflow todo presentation controller source", () => {
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
		"useWorkflowTodoPresentationController.ts",
	);

	it("keeps workflow todo presentation state outside the app controller", () => {
		expect(appSource).toContain("useWorkflowTodoPresentationController({");
		expect(appSource).not.toContain("function rememberLoadedWorkflowTodo(");
		expect(appSource).not.toContain(
			"function applyInitialWorkflowTodoPreference(",
		);
		expect(controllerSource).toContain(
			"const [workflowTodoSnapshot, setWorkflowTodoSnapshot] =",
		);
		expect(controllerSource).toContain("getWorkflowTodoSnapshotKey(snapshot)");
	});

	it("preserves plan snapshots while clearing other workflow todo state", () => {
		expect(controllerSource).toContain(
			"options.preservePlanSnapshot === true",
		);
		expect(controllerSource).toContain(
			"currentSnapshot?.source === \"plan\"",
		);
		expect(controllerSource).toContain(
			"workflowTodoDismissedKey: null",
		);
	});
});
