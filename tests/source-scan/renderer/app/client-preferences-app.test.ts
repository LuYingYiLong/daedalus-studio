import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../helpers/repo-paths";

describe("App client preferences", () => {
	it("restores all new-session composer defaults without changing existing sessions", () => {
		const source: string = readAppImplementation();

		expect(source).toContain("findPreferredComposerModel");
		expect(source).toContain("preferences.newSessionComposer.model ?? preferences.lastComposerModel");
		expect(source).toContain("chatMode: preferences.newSessionComposer.mode");
		expect(source).toContain("reasoningEffort: preferences.newSessionComposer.reasoningEffort");
		expect(source).toContain("bootstrapData.clientPreferences.newSessionComposer.approvalMode");
		expect(source).toContain("createPreferredHomeDraft(clientPreferences, providerModelSelection)");
		expect(source).toContain("persistNewSessionComposerDefaults({ mode: nextMode })");
		expect(source).toContain("persistNewSessionComposerDefaults({ approvalMode: result.mode })");
		expect(source).toContain("persistNewSessionComposerDefaults({ reasoningEffort: nextEffort })");
		expect(source).toContain("model: { providerId, modelId }");
		expect(source).toContain("approvalMode: preferredApprovalMode");
	});

	it("keeps the session model visible while a session workbench is loading", () => {
		const source: string = readAppImplementation();

		expect(source).toContain("function getDisplayedComposerModel");
		expect(source).toContain("params.workbench?.composer.provider ?? params.activeSessionMetadata?.provider ?? fallbackProviderId");
		expect(source).toContain("params.workbench?.composer.model ?? params.activeSessionMetadata?.model ?? fallbackModelId");
		expect(source).toContain("const displayedComposerModel = getDisplayedComposerModel({");
		expect(source).toContain("setActiveSessionMetadata(session)");
		expect(source).toContain("setWorkbench(null)");
	});
});
