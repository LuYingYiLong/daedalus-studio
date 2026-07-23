import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage summary popover source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const apiSource: string = readRepoFile("src", "renderer", "src", "api", "session-overview-api.ts");

	it("uses session overview RPC for dynamic summary content", () => {
		expect(apiSource).toContain('"session.overview.get"');
		expect(source).toContain("fetchSessionOverview");
		expect(source).toContain("loadSummaryOverview");
	});

	it("shows the summary action for non-home sessions independently of workspace launch controls", () => {
		expect(source).toContain("const showWorkspaceLaunchControls: boolean = workspaceForActions !== null;");
		expect(source).toContain("const showSummaryButton: boolean = activeSessionId !== null;");
		expect(source).toContain("{showWorkspaceLaunchControls ? (");
		expect(source).toContain("{showSummaryButton ? renderSummaryButton() : null}");
		expect(source).toContain("className={styles.floatingActionSlot}");
	});

	it("renders conditional sections, see more modals, and image preview", () => {
		expect(source).toContain("summaryOverview.envInfo !== null");
		expect(source).toContain("summaryOverview.plans.total > 0");
		expect(source).toContain("summaryOverview.sources.total > 0");
		expect(source).toContain("openPlansModal");
		expect(source).toContain("openSourcesModal");
		expect(source).toContain("setPreviewSource(source)");
		expect(source).toContain("No summary yet");
	});

	it("opens review from the diff action and refreshes summary after git actions", () => {
		expect(source).toContain("const openSummaryDiffReview = useCallback");
		expect(source).toContain("setSummaryOpen(false);");
		expect(source).toContain("kind: \"review\"");
		expect(source).toContain("setSideDockOpen(true);");
		expect(source).toContain("onClick={openSummaryDiffReview}");
		expect(source).toContain("await loadSummaryOverview();");
	});
});
