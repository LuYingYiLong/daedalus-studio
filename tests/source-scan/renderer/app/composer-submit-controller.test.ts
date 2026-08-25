import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Composer submit controller source", () => {
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
		"useComposerSubmitController.ts",
	);

	it("keeps composer submission orchestration outside the app controller", () => {
		expect(appSource).toContain("useComposerSubmitController({");
		expect(appSource).not.toContain("async function handleComposerSubmit");
		expect(controllerSource).toContain(
			"await handleHomeComposerSubmit(nextMessage, modeOverride);",
		);
		expect(controllerSource).toContain(
			"const worktreeResult = await prepareFirstTurnWorktree({",
		);
		expect(controllerSource).toContain(
			"temporaryDraftSessionIdRef.current = null;",
		);
		expect(controllerSource).toContain(
			"await submitComposerMessage({",
		);
	});

	it("clears the first-turn model transition when submission is rejected", () => {
		expect(controllerSource).toContain(
			"if (isFirstTurnSubmission && firstTurnRequestAccepted === false)",
		);
		expect(controllerSource).toContain(
			"currentTransition?.sessionId === activeSessionId",
		);
	});
});
