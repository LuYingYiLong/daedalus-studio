import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Composer view model source", () => {
	const appSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"useAppController.tsx",
	);
	const viewModelSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useComposerViewModel.ts",
	);

	it("keeps composer-derived presentation state outside the app controller", () => {
		expect(appSource).toContain("useComposerViewModel({");
		expect(appSource).not.toContain("const displayedComposerModel =");
		expect(appSource).not.toContain("const composerIsSending: boolean =");
		expect(viewModelSource).toContain("getDisplayedComposerModel({");
		expect(viewModelSource).toContain("const composerMessageQueue: MessageQueueItem[]");
		expect(viewModelSource).toContain("const runningSessionIds: string[]");
	});
});
