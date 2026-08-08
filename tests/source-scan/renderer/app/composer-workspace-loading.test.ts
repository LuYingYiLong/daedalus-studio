import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../helpers/repo-paths";

describe("composer workspace loading state", () => {
	it("allows an unbound temporary session while locking existing sessions and loading", () => {
		const appSource: string = readAppImplementation();
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");

		const homeSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");

		expect(appSource).toContain("const composerWorkspaceLocked: boolean = isWorkspaceSessionCreating");
		expect(appSource).toContain("|| isComposerWorkspaceSelectionLocked(activeSessionId, activeSessionMetadata);");
		expect(appSource).toContain("workspaceFooterDisabled: isHomeSubmitting || composerWorkspaceLocked || isSessionLoading");
		expect(homeSource).toContain("onWorkspaceSelect={isHome ? onHomeWorkspaceSelect : undefined}");
		expect(composerSource).toContain("disabled={workspaceFooterDisabled}");
		expect(composerSource).toContain("if (workspaceFooterDisabled)");
	});
});
