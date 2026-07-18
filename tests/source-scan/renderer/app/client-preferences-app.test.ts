import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("App client preferences", () => {
	it("uses hidden last composer model preference for new sessions and defaults to agent mode", () => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");

		expect(source).toContain('chatMode: "agent"');
		expect(source).toContain("findPreferredComposerModel");
		expect(source).toContain("preferences.lastComposerModel");
		expect(source).toContain("createPreferredHomeDraft(clientPreferences, providerModelSelection)");
		expect(source).toContain("updateClientPreferences({");
		expect(source).toContain("lastComposerModel: nextPreferences.lastComposerModel");
	});
});
