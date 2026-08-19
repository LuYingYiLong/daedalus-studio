import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage summary popover source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const popoverSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "SessionSummaryPopover.tsx");
	const controllerSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "useSessionSummaryOverview.ts");
	const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "session-overview-api.ts");
	const styles: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.module.css");

	it("uses one overview model for sessions and the NewSessionHome workspace", () => {
		expect(apiSource).toContain('"session.overview.get"');
		expect(source).toContain("useSessionSummaryOverview");
		expect(controllerSource).toContain("fetchSessionOverview");
		expect(controllerSource).toContain("fetchWorkspaceOverview");
		expect(apiSource).toContain("workspace.sourceFolders");
		expect(apiSource).toContain("fetchWorkspaceGitDiffSummary");
		expect(source).toContain("loadSummaryOverview");
	});

	it("prewarms and reuses the current session overview", () => {
		expect(controllerSource).toContain("const requestIdRef = useRef<number>(0);");
		expect(controllerSource).toContain("target.sessionId === null && target.workspace === null");
		expect(controllerSource).toContain("summaryOverview === null && summaryError === null && !isSummaryLoading");
		expect(controllerSource).toContain("loadSummaryOverview(previewLimit, previewLimit, true)");
		expect(controllerSource).toContain("silent: boolean = false");
		expect(controllerSource).toContain("requestId !== requestIdRef.current");
		expect(source).toContain("SessionSummaryPopover");
		expect(popoverSource).toContain("fresh");
	});

	it("keeps the summary action mounted while NewSessionHome changes scope", () => {
		expect(source).toContain("const showWorkspaceLaunchControls: boolean = workspaceForActions !== null;");
		expect(source).toContain("const showSummaryButton: boolean = true;");
		expect(source).toContain("const summarySessionId: string | null = isHome ? null : activeSessionId;");
		expect(source).toContain("const summaryScopeKey: string =");
		expect(source).toContain('`workspace:${workspaceForActions?.id ?? "none"}`');
		expect(source).toContain("sessionId: summarySessionId");
		expect(source).toContain("showWorkspaceLaunchControls");
		expect(source).toContain("showSummaryButton ? renderSummaryButton() : null");
		expect(source).toContain("className={styles.floatingActionSlot}");
	});

	it("renders conditional sections, see more modals, and image preview", () => {
		expect(source).toContain("summaryOverview.envInfos?.length");
		expect(source).toContain("for (const envInfo of summaryEnvInfos)");
		expect(source).toContain("const hasDiff: boolean = envInfo.changedFiles > 0;");
		expect(source).toContain("envInfo.additions > 0 || envInfo.deletions > 0");
		expect(source).toContain("{hasDiffStats ? (");
		expect(source).toContain("disabled={!hasDiff}");
		expect(source).toContain("envInfo.sourceFolderPath");
		expect(source).toContain("summaryOverview.plans.total > 0");
		expect(source).toContain("summaryOverview.sources.total > 0");
		expect(source).toContain("openPlansModal");
		expect(source).toContain("openSourcesModal");
		expect(source).toContain("setPreviewSource(source)");
		expect(popoverSource).toContain('description={t("agentPage.summary.empty")}');
	});

	it("opens review from the diff action and refreshes summary after git actions", () => {
		expect(source).toContain("const openSummaryDiffReview = useCallback");
		expect(source).toContain("setSummaryOpen(false);");
		expect(source).toContain("kind: \"review\"");
		expect(source).toContain("updateSideDock({ ...visualSessionLayoutRef.current.side, open: true });");
		expect(source).toContain("requestSummaryGitAction(");
		expect(source).toContain('"diff"');
		expect(source).toContain("sourceFolderId: summaryGitSourceFolderId");
		expect(source).toContain("await loadSummaryOverview();");
		expect(source).toContain("onCommitSuccess: handleDockGitStateChange");
		expect(source).toContain("onBranchSuccess: handleDockGitStateChange");
		expect(source).toContain("setGitStateRevision((current: number): number => current + 1);");
	});

	it("shows commit message generation progress on the commit action", () => {
		expect(source).toContain("aria-busy={gitActions.isCommitMessageGenerating}");
		expect(source).toContain("gitActions.isCommitMessageGenerating ? (");
		expect(source).toContain('name="git-commit"');
		expect(popoverSource).toContain('icon={<Icon name="list-check" />}');
	});

	it("limits the summary popover to the viewport and scrolls its content", (): void => {
		expect(styles).toContain(".summaryPanel {");
		expect(styles).toContain("max-height: calc(100dvh - 32px);");
		expect(styles).toContain("overflow-y: auto;");
	});
});
