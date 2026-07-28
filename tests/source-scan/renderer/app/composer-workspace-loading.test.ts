import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("composer workspace loading state", () => {
	it("disables workspace selection for an existing session and during session loading", () => {
		const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");

		const homeSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");

		expect(appSource).toContain("workspaceFooterDisabled={isHomeSubmitting || activeSessionId !== null || isSessionLoading}");
		expect(homeSource).toContain("onWorkspaceSelect={isHome ? onHomeWorkspaceSelect : undefined}");
		expect(composerSource).toContain("disabled={workspaceFooterDisabled}");
		expect(composerSource).toContain("if (workspaceFooterDisabled)");
	});
});
