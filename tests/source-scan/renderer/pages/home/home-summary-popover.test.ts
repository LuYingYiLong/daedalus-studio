import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage summary popover source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");
	const apiSource: string = readRepoFile("src", "renderer", "src", "api", "session-overview-api.ts");

	it("uses session overview RPC for dynamic summary content", () => {
		expect(apiSource).toContain('"session.overview.get"');
		expect(source).toContain("fetchSessionOverview");
		expect(source).toContain("loadSummaryOverview");
	});

	it("prewarms and reuses the current session overview", () => {
		expect(source).toContain("const summaryRequestIdRef = useRef<number>(0);");
		expect(source).toContain("if (activeSessionId !== null) {");
		expect(source).toContain("open && summaryOverview === null && summaryError === null && !isSummaryLoading");
		expect(source).toContain("requestId !== summaryRequestIdRef.current");
		expect(source).toContain("fresh");
	});

	it("shows the summary action for non-home sessions independently of workspace launch controls", () => {
		expect(source).toContain("const showWorkspaceLaunchControls: boolean = workspaceForActions !== null;");
		expect(source).toContain("const showSummaryButton: boolean = activeSessionId !== null;");
		expect(source).toContain("{showWorkspaceLaunchControls ? (");
		expect(source).toContain("{showSummaryButton ? renderSummaryButton() : null}");
		expect(source).toContain("className={styles.floatingActionSlot}");
	});

	it("renders conditional sections, see more modals, and image preview", () => {
		expect(source).toContain("summaryOverview.envInfos?.length");
		expect(source).toContain("for (const envInfo of summaryEnvInfos)");
		expect(source).toContain("const hasDiff: boolean = envInfo.changedFiles > 0;");
		expect(source).toContain("envInfo.additions > 0 || envInfo.deletions > 0");
		expect(source).toContain("{hasDiffStats ? (");
		expect(source).toContain("disabled={!hasDiff}");
		expect(source).toContain("label: <Tooltip title={envInfo.sourceFolderPath}>{envInfo.title}</Tooltip>");
		expect(source).toContain("summaryOverview.plans.total > 0");
		expect(source).toContain("summaryOverview.sources.total > 0");
		expect(source).toContain("openPlansModal");
		expect(source).toContain("openSourcesModal");
		expect(source).toContain("setPreviewSource(source)");
		expect(source).toContain('description={t("agentPage.summary.empty")}');
	});

	it("opens review from the diff action and refreshes summary after git actions", () => {
		expect(source).toContain("const openSummaryDiffReview = useCallback");
		expect(source).toContain("setSummaryOpen(false);");
		expect(source).toContain("kind: \"review\"");
		expect(source).toContain("updateSideDock({ ...sessionLayout.side, open: true });");
		expect(source).toContain('requestSummaryGitAction(envInfo.sourceFolderId, "diff")');
		expect(source).toContain("sourceFolderId: summaryGitSourceFolderId");
		expect(source).toContain("await loadSummaryOverview();");
	});

	it("shows commit message generation progress on the commit action", () => {
		expect(source).toContain("aria-busy={gitActions.isCommitMessageGenerating}");
		expect(source).toContain('gitActions.isCommitMessageGenerating ? <Spin size="small" /> : <Icon name="git-commit" />');
		expect(source).toContain('icon={<Icon name="list-check" />}');
	});
});
