import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR: string = dirname(fileURLToPath(import.meta.url));

describe("App client preferences", () => {
	it("uses hidden last composer model preference for new sessions and defaults to agent mode", () => {
		const source = readFileSync(join(TEST_DIR, "App.tsx"), "utf8");

		expect(source).toContain('chatMode: "agent"');
		expect(source).toContain("findPreferredComposerModel");
		expect(source).toContain("preferences.lastComposerModel");
		expect(source).toContain("createPreferredHomeDraft(clientPreferences, providerModelSelection)");
		expect(source).toContain("updateClientPreferences({");
		expect(source).toContain("lastComposerModel: nextPreferences.lastComposerModel");
	});
});
