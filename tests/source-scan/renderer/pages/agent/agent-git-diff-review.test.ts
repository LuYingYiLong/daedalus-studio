import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage git diff review source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const messageListSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.tsx");
	const assistantBubbleSource: string = readRepoFile("src", "renderer", "src", "features", "bubble", "AssistantBubble.tsx");
	const inlineDiffSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "InlineDiffPart.tsx");
	const reviewPanelSource: string = readRepoFile("src", "renderer", "src", "features", "review", "GitDiffReviewPanel.tsx");
	const dockPanelTabsSource: string = readRepoFile("src", "renderer", "src", "features", "dock", "DockPanelTabs.tsx");
	const dockPanelTabsCss: string = readRepoFile("src", "renderer", "src", "features", "dock", "DockPanelTabs.module.css");
	const panelTabsSource: string = readRepoFile("src", "renderer", "src", "features", "panel-tabs", "PanelTabs.tsx");
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
		expect(agentSource).toContain("onEmpty={closeSideDock}");
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
		expect(resizeSource).toContain("closeSideDock();");
	});

	it("adds a fixed layout-right top menu button for opening the side dock", () => {
		expect(agentSource).toContain("const showSideDockButton: boolean = !isHome;");
		expect(agentSource).toContain("className={styles.floatingActionSlot}");
		expect(agentSource).toContain("className={styles.floatingActions}");
		expect(agentSource).not.toContain("Affix");
		expect(agentSource).toContain("icon={<Icon name=\"layout-right\" />}");
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

	it("renders dock tabs that can add both review and terminal panels", () => {
		expect(panelTabsSource).toContain("type=\"editable-card\"");
		expect(panelTabsSource).toContain("hideAdd={true}");
		expect(panelTabsSource).toContain("tabBarExtraContent={{");
		expect(panelTabsSource).toContain("<Dropdown");
		expect(panelTabsSource).toContain("onEdit={handleEdit}");
		expect(dockPanelTabsSource).toContain("PanelTabs");
		expect(dockPanelTabsSource).toContain("Review panel");
		expect(dockPanelTabsSource).toContain("Terminal panel");
		expect(dockPanelTabsSource).toContain("return [createDockTab(dockId, defaultKind, 1)];");
		expect(dockPanelTabsSource).toContain("<GitDiffReviewPanel workspaceId={workspaceId} />");
		expect(dockPanelTabsSource).toContain("<TerminalPanel");
		expect(dockPanelTabsSource).toContain("terminalId={tab.key}");
		expect(dockPanelTabsSource).toContain("window.electronAPI.terminal.kill({ terminalId: targetKey })");
		expect(dockPanelTabsCss).toContain("padding-top: 40px;");
		expect(dockPanelTabsCss).toContain("border-left: 1px solid var(--ds-border);");
		expect(reviewPanelSource).not.toContain("Tabs");
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
		expect(dockPanelTabsSource).toContain("function reorderTabs");
		expect(dockPanelTabsSource).toContain("onReorder={reorderDockTab}");
	});

	it("closes the side dock when the active session or workspace changes", () => {
		expect(agentSource).toContain("setSideDockOpen(false);");
		expect(agentSource).toContain("[activeSessionId, activeWorkspace?.id]");
	});

	it("wires inline diff review actions to the same sidebar callback", () => {
		expect(agentSource).toContain("onInlineDiffReview={openReviewPanel}");
		expect(messageListSource).toContain("onInlineDiffReview?: () => void;");
		expect(messageListSource).toContain("onInlineDiffReview={onInlineDiffReview}");
		expect(assistantBubbleSource).toContain("onInlineDiffReview?: () => void;");
		expect(assistantBubbleSource).toContain("<InlineDiffPart key={index} part={part} onReview={onInlineDiffReview} />");
		expect(inlineDiffSource).toContain("onReview?: () => void;");
		expect(inlineDiffSource).toContain("onClick={onReview}");
		expect(inlineDiffSource).toContain("className={styles.filePathButton}");
		expect(inlineDiffSource).toContain("aria-label={`Open review for ${getFilePath(item)}`}");
	});

	it("renders inline diff files without deprecated Ant Design List", () => {
		expect(inlineDiffSource).not.toContain("<List");
		expect(inlineDiffSource).not.toContain("List.Item");
		expect(inlineDiffSource).not.toContain(", List,");
		expect(inlineDiffSource).toContain("<ul className={styles.fileList}>");
		expect(inlineDiffSource).toContain("<li key={`${getFilePath(item)}:${index}`} className={styles.fileItem}>");
	});
});
