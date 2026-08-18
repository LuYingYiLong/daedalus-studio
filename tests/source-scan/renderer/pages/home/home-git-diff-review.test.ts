import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage git diff review source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const messageListSource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "MessageList.tsx");
	const assistantBubbleSource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "AssistantBubble.tsx");
	const inlineDiffSource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "InlineDiffPart.tsx");
	const reviewPanelSource: string = readRepoFile("src", "renderer", "src", "widgets", "git", "review", "GitDiffReviewPanel.tsx");
	const commitActionDialogSource: string = readRepoFile("src", "renderer", "src", "widgets", "git", "CommitActionDialog.tsx");
	const gitActionControllerSource: string = readRepoFile("src", "renderer", "src", "features", "git", "useGitActionDialogController.tsx");
	const dockPanelTabsSource: string = readRepoFile("src", "renderer", "src", "widgets", "dock", "DockPanelTabs.tsx");
	const dockPanelTabsCss: string = readRepoFile("src", "renderer", "src", "widgets", "dock", "DockPanelTabs.module.css");
	const panelTabsSource: string = readRepoFile("src", "renderer", "src", "widgets", "panel-tabs", "PanelTabs.tsx");
	const panelTabsCss: string = readRepoFile("src", "renderer", "src", "widgets", "panel-tabs", "PanelTabs.module.css");
	const reviewPanelCss: string = readRepoFile("src", "renderer", "src", "widgets", "git", "review", "GitDiffReviewPanel.module.css");
	const packageJsonSource: string = readRepoFile("package.json");

	it("renders the side dock inside an Ant Design Splitter", () => {
		expect(agentSource).toContain("<Splitter");
		expect(agentSource).toContain("className={styles.agentSplitter}");
		expect(agentSource).toContain("collapsible={{ motion: true }}");
		expect(agentSource).toContain("onResize={handleSideDockResize}");
		expect(agentSource).toContain("onResizeEnd={handleSideDockResizeEnd}");
		expect(agentSource).toContain("<Splitter.Panel");
		expect(agentSource).toContain("<DockPanelTabs");
		expect(agentSource).toContain("dockId=\"side\"");
		expect(agentSource).toContain("placement=\"side\"");
		expect(agentSource).toContain("defaultKind=\"review\"");
		expect(agentSource).toContain("layout={visualSessionLayout.side}");
		expect(agentSource).toContain("onLayoutChange={updateSideDock}");
		expect(agentSource).toContain("SIDE_DOCK_DEFAULT_SIZE");
		expect(agentSource).toContain("SIDE_DOCK_CLOSE_THRESHOLD");
	});

	it("closes the side dock while dragging below the resize threshold", () => {
		const resizeStart: number = agentSource.indexOf("function handleSideDockResize(sizes: number[]): void");
		const resizeEnd: number = agentSource.indexOf("function handleSideDockResizeEnd(sizes: number[]): void");
		const resizeSource: string = agentSource.slice(resizeStart, resizeEnd);

		expect(resizeStart).toBeGreaterThan(-1);
		expect(resizeEnd).toBeGreaterThan(resizeStart);
		expect(resizeSource).toContain("normalizedSize < SIDE_DOCK_CLOSE_THRESHOLD");
		expect(resizeSource).toContain("performance.now() < sideDockProgrammaticOpenUntilRef.current");
		expect(resizeSource).toContain("applyVisualSessionLayout({");
		expect(resizeSource).toContain("side: { ...visualSessionLayoutRef.current.side, open: false }");
	});

	it("does not treat programmatic Splitter opening frames as a user close", () => {
		expect(agentSource).toContain("const SIDE_DOCK_PROGRAMMATIC_OPEN_GUARD_MS: number = 400;");
		expect(agentSource).toContain("sideDockProgrammaticOpenUntilRef.current = performance.now() + SIDE_DOCK_PROGRAMMATIC_OPEN_GUARD_MS;");
		expect(agentSource).toContain("sideDockProgrammaticOpenUntilRef.current = 0;");
	});

	it("adds a fixed state-aware layout-right top menu button for the side dock", () => {
		expect(agentSource).toContain("const showDockControls: boolean = true;");
		expect(agentSource).toContain("const showSideDockButton: boolean = showDockControls;");
		expect(agentSource).toContain("className={styles.floatingActionSlot}");
		expect(agentSource).toContain("className={styles.floatingActions}");
		expect(agentSource).not.toContain("Affix");
		expect(agentSource).toContain('icon={<Icon name={sideDockOpen ? "layout-right-toggled" : "layout-right"} />}');
		expect(agentSource).toContain("onClick={toggleSideDock}");
		expect(agentSource).toContain("aria-pressed={sideDockOpen}");
	});

	it("renders workspace launch, summary and dock actions in the shared floating slot", () => {
		expect(agentSource).toContain("showWorkspaceLaunchControls || showSummaryButton || showBottomDockButton || showSideDockButton");
		expect(agentSource).toContain("{showWorkspaceLaunchControls ? (");
		expect(agentSource).toContain("className={styles.workspaceLaunchControls}");
		expect(agentSource).toContain("{showSummaryButton ? renderSummaryButton() : null}");
		expect(agentSource).not.toContain("styles.topMenuBar");
	});

	it("keeps close ownership on the fixed layout-right button", () => {
		expect(reviewPanelSource).not.toContain("Close review panel");
		expect(reviewPanelSource).not.toContain("onClose");
	});

	it("overrides react-diff-view light defaults for dark-theme readability", () => {
		expect(reviewPanelCss).toContain("--diff-code-insert-background-color: var(--ds-git-addition-bg)");
		expect(reviewPanelCss).toContain("--diff-code-delete-background-color: var(--ds-git-deletion-bg)");
		expect(reviewPanelCss).toContain(".diffTable :global(.diff-code-insert)");
		expect(reviewPanelCss).toContain(".diffTable :global(.diff-code-delete)");
		expect(reviewPanelCss).toContain("--diff-omit-gutter-line-color");
	});

	it("renders dock tabs that can add both review and terminal panels", () => {
		expect(panelTabsSource).toContain("type=\"editable-card\"");
		expect(panelTabsSource).toContain("hideAdd={true}");
		expect(panelTabsSource).toContain("tabBarExtraContent={{");
		expect(panelTabsSource).toContain("<Dropdown");
		expect(panelTabsSource).toContain("onEdit={handleEdit}");
		expect(dockPanelTabsSource).toContain("PanelTabs");
		expect(dockPanelTabsSource).toContain('t("dock.add.reviewPanel")');
		expect(dockPanelTabsSource).toContain('t("dock.add.terminalPanel")');
		expect(dockPanelTabsSource).toContain("ensurePanelTab(defaultKind)");
		expect(dockPanelTabsSource).toContain("<GitDiffReviewPanel workspaceId={workspaceId} sourceFolderId={sourceFolderId} sourceFolders={sourceFolders} primarySourceFolderId={primarySourceFolderId} onSourceFolderChange={onSourceFolderChange} gitStateRevision={gitStateRevision} contextItems={contextItems}");
		expect(dockPanelTabsSource).toContain("<TerminalPanel");
		expect(dockPanelTabsSource).toContain("terminalId={createTerminalRuntimeId(sessionId, tab.key)}");
		expect(dockPanelTabsSource).toContain("createTerminalRuntimeId(sessionId, targetKey)");
		expect(dockPanelTabsCss).toContain("padding-top: 40px;");
		expect(dockPanelTabsCss).toContain("border-left: 1px solid var(--ds-border);");
		expect(reviewPanelSource).not.toContain("Tabs");
	});

	it("keeps force-rendered dock panes hidden until their tab is active", () => {
		expect(dockPanelTabsSource).toContain("forceRender: tab.kind === \"terminal\"");
		expect(panelTabsSource).not.toContain('const PANEL_TAB_CONTENT_STYLE: CSSProperties = {\n\tdisplay:');
		expect(panelTabsCss).toContain(".tabsContent:global(.ant-tabs-content-hidden)");
		expect(panelTabsCss).toContain("display: none !important;");
	});

	it("opens shared git action dialogs from the review panel", () => {
		expect(reviewPanelSource).toContain("useGitActionDialogController");
		expect(reviewPanelSource).toContain("onCommitSuccess: async (): Promise<void> => {");
		expect(reviewPanelSource).toContain("if (onGitStateChange !== undefined)");
		expect(reviewPanelSource).toContain("await onGitStateChange();");
		expect(reviewPanelSource).toContain("await loadSummary(true);");
		expect(reviewPanelSource).not.toContain("Promise.all([loadSummary(true), onGitStateChange?.()])");
		expect(reviewPanelSource).toContain("gitStateRevision?: number;");
		expect(reviewPanelSource).toContain("}, [gitStateRevision, selectedSourceFolderId, workspaceId]);");
		expect(reviewPanelSource).toContain("resolveGitReviewSourceFolderId");
		expect(reviewPanelSource).toContain("resolveGitReviewRequestSourceFolderId");
		expect(reviewPanelSource).toContain("onSourceFolderChange?.(selectedSourceFolderId)");
		expect(reviewPanelSource).toContain("selectedSourceFolderIdRef.current !== requestSelectedSourceFolderId");
		expect(agentSource).toContain("workspaceOptions.find((workspace: WorkspaceConfig): boolean => workspace.id === workspaceSnapshotForActions.id)");
		expect(agentSource).toContain("sourceFolders={workspaceForActions?.sourceFolders ?? []}");
		expect(agentSource).toContain("onSourceFolderChange={handleGitReviewSourceFolderChange}");
		expect(agentSource).toContain("current !== null && current.sourceFolderId !== sourceFolderId ? null : current");
		expect(dockPanelTabsSource).toContain("gitStateRevision={gitStateRevision}");
		expect(dockPanelTabsSource).toContain("onGitStateChange={onGitStateChange}");
		expect(agentSource).toContain("const handleDockGitStateChange = useCallback");
		expect(agentSource).toContain("const [gitStateRevision, setGitStateRevision]");
		expect(agentSource).toContain("setGitStateRevision((current: number): number => current + 1);");
		expect(agentSource).toContain("onCommitSuccess: handleDockGitStateChange");
		expect(agentSource).toContain("onBranchSuccess: handleDockGitStateChange");
		expect(agentSource).toContain("gitStateRevision={gitStateRevision}");
		expect(agentSource).toContain("onGitStateChange={handleDockGitStateChange}");
		expect(reviewPanelSource).toContain("onClick={gitActions.openCommitDialog}");
		expect(reviewPanelSource).toContain("<CommitActionDialog {...gitActions.commitDialogProps} />");
		expect(reviewPanelSource).toContain("<BranchActionDialog {...gitActions.branchDialogProps} />");
		expect(reviewPanelSource).toContain("<CreateBranchDialog {...gitActions.createBranchDialogProps} />");
		expect(commitActionDialogSource).toContain('title={t("git.commit.title")}');
		expect(gitActionControllerSource).toContain("commitOrPushGit");
		expect(gitActionControllerSource).toContain("generateGitCommitMessage");
	});

	it("loads small diff files on demand and keeps large file previews bounded", () => {
		expect(reviewPanelSource).toContain("fetchWorkspaceGitDiffSummary");
		expect(reviewPanelSource).toContain("fetchWorkspaceGitDiffFile");
		expect(reviewPanelSource).toContain("const [expandedKeys, setExpandedKeys] = useState<string[]>([]);");
		expect(reviewPanelSource).toContain("file.canAutoExpand");
		expect(reviewPanelSource).toContain("slice(0, 3)");
		expect(reviewPanelSource).toContain("tooLargeToRender");
		expect(reviewPanelSource).toContain('activeKey={expandedKeys}');
		expect(reviewPanelSource).toContain('onChange={handleCollapseChange}');
	});

	it("adds local line comments to Composer context", () => {
		expect(reviewPanelSource).toContain("renderGutter");
		expect(reviewPanelSource).toContain('kind: "git_diff_comment"');
		expect(reviewPanelSource).toContain("onAddContext({");
		expect(reviewPanelSource).toContain("onRemoveContext(item.id)");
		expect(reviewPanelSource).toContain("<GitDiffReviewCommentDialog");
	});

	it("uses dnd-kit to reorder dock tabs", () => {
		expect(packageJsonSource).toContain("\"@dnd-kit/core\"");
		expect(packageJsonSource).toContain("\"@dnd-kit/sortable\"");
		expect(packageJsonSource).toContain("\"@dnd-kit/utilities\"");
		expect(panelTabsSource).toContain("from \"@dnd-kit/core\"");
		expect(panelTabsSource).toContain("from \"@dnd-kit/sortable\"");
		expect(panelTabsSource).toContain("from \"@dnd-kit/utilities\"");
		expect(panelTabsSource).toContain("function SortableTabNode");
		expect(panelTabsSource).toContain("useSortable({");
		expect(panelTabsSource).toContain("renderTabBar=");
		expect(panelTabsSource).toContain("<DndContext");
		expect(panelTabsSource).toContain("<SortableContext");
		expect(panelTabsSource).toContain("onReorder?.(String(event.active.id), String(event.over.id));");
		expect(dockPanelTabsSource).toContain("function reorderDockTabs");
		expect(dockPanelTabsSource).toContain("tabs: reorderDockTabs(layout.tabs, sourceKey, targetKey)");
	});

	it("keeps the selected session dock layout when the active session changes", () => {
		expect(agentSource).not.toContain("setSideDockOpen(false);");
		expect(agentSource).toContain("sessionLayout: SessionLayoutPreferences;");
	});

	it("wires inline diff review actions to the same sidebar callback", () => {
		expect(agentSource).toContain("onInlineDiffReview={openReviewPanel}");
		expect(messageListSource).toContain("onInlineDiffReview?: () => void;");
		expect(messageListSource).toContain("onInlineDiffReview={onInlineDiffReview}");
		expect(assistantBubbleSource).toContain("onInlineDiffReview?: () => void;");
		expect(assistantBubbleSource).toContain("<InlineDiffPart key={partKey} part={part} onReview={onInlineDiffReview} />");
		expect(inlineDiffSource).toContain("onReview?: () => void;");
		expect(inlineDiffSource).toContain("onClick={onReview}");
		expect(inlineDiffSource).toContain("className={styles.filePathButton}");
		expect(inlineDiffSource).toContain('aria-label={t("chat.inlineDiff.openReviewAria", { filePath })}');
	});

	it("renders inline diff files without deprecated Ant Design List", () => {
		expect(inlineDiffSource).not.toContain("<List");
		expect(inlineDiffSource).not.toContain("List.Item");
		expect(inlineDiffSource).not.toContain(", List,");
		expect(inlineDiffSource).toContain("<ul className={styles.fileList}>");
		expect(inlineDiffSource).toContain("part.editedFiles.slice(0, visibleFileLimit)");
		expect(inlineDiffSource).toContain('chat.inlineDiff.showMoreFiles');
		expect(inlineDiffSource).toContain('chat.inlineDiff.collapseFiles');
		expect(inlineDiffSource).toContain("<li key={`${filePath}:${index}`} className={styles.fileItem}>");
	});
});
