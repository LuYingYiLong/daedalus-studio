import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer draft lifetime", () => {
	const appSource: string = readAppImplementation();
	const composerSource: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.tsx");
	const homePageSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");

	it("keeps per-session drafts in renderer memory instead of workbench persistence", () => {
		expect(appSource).not.toContain("COMPOSER_TEXT_SYNC_DEBOUNCE_MS");
		expect(appSource).not.toContain("pendingComposerTextSyncRef");
		expect(appSource).not.toContain("takePendingWorkbenchPatchWithComposerText");
		expect(composerSource).not.toContain("onMessageChange");
		expect(appSource).toContain("composerDraftsRef = useRef<Map<string, string>>(new Map())");
		expect(appSource).toContain("composerDraftsRef.current.get(composerScopeId) ?? \"\"");
		expect(homePageSource).toContain("onDraftChange={onDraftChange}");
		expect(composerSource).toContain("onDraftChange?.(nextMessage)");
	});

	it("restores drafts by conversation and keeps typed temporary sessions alive", () => {
		expect(appSource).toContain("composerInstanceKey");
		expect(homePageSource).toContain("key={composerInstanceKey}");
		expect(composerSource).toContain("const [draftMessage, setDraftMessage] = useState<string>(message)");
		expect(appSource).toContain("draftText.trim().length > 0");
		expect(appSource).toContain("composerDraftsRef.current.delete(sessionId)");
	});

	it("uses a server suggestion only as an empty composer placeholder", () => {
		expect(appSource).toContain("const nextStepSuggestionCandidate: unknown = workbench?.nextStepHints?.hints?.[0]?.message;");
		expect(appSource).toContain("nextStepSuggestion,");
		expect(homePageSource).toContain("nextStepSuggestion={nextStepSuggestion}");
		expect(composerSource).toContain("nextStepSuggestion?: string | null;");
		expect(composerSource).toContain("const textAreaPlaceholder: string = draftMessage.length === 0");
		expect(composerSource).toContain("placeholder={textAreaPlaceholder}");
		expect(composerSource).not.toContain("setDraftMessage(nextStepSuggestion");
	});
});
