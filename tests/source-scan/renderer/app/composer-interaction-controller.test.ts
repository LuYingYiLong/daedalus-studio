import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Composer interaction controller source", () => {
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
		"useComposerInteractionController.ts",
	);

	it("keeps composer interaction orchestration outside the app controller", () => {
		expect(appSource).toContain("useComposerInteractionController({");
		expect(appSource).not.toContain("useComposerQueueController({");
		expect(appSource).not.toContain("useComposerRunController({");
		expect(controllerSource).toContain("useComposerQueueController({");
		expect(controllerSource).toContain("useComposerSendController({");
		expect(controllerSource).toContain("useHomeComposerController({");
		expect(controllerSource).toContain("useComposerRunController({");
		expect(controllerSource).toContain("useComposerSubmitController({");
	});
});
