import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage git diff review source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const messageListSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.tsx");
	const assistantBubbleSource: string = readRepoFile("src", "renderer", "src", "features", "bubble", "AssistantBubble.tsx");
	const inlineDiffSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "InlineDiffPart.tsx");
	const reviewPanelSource: string = readRepoFile("src", "renderer", "src", "features", "review", "GitDiffReviewPanel.tsx");

	it("renders the review sidebar inside an Ant Design Splitter", () => {
		expect(agentSource).toContain("<Splitter");
		expect(agentSource).toContain("className={styles.agentSplitter}");
		expect(agentSource).toContain("collapsible={{ motion: true }}");
		expect(agentSource).toContain("onResize={handleReviewResize}");
		expect(agentSource).toContain("onResizeEnd={handleReviewResizeEnd}");
		expect(agentSource).toContain("<Splitter.Panel");
		expect(agentSource).toContain("<GitDiffReviewPanel workspaceId={activeWorkspace.id} />");
		expect(agentSource).toContain("REVIEW_PANEL_DEFAULT_SIZE");
		expect(agentSource).toContain("REVIEW_PANEL_CLOSE_THRESHOLD");
	});

	it("closes the review sidebar while dragging below the resize threshold", () => {
		const resizeStart: number = agentSource.indexOf("function handleReviewResize(sizes: number[]): void");
		const resizeEnd: number = agentSource.indexOf("function handleReviewResizeEnd(sizes: number[]): void");
		const resizeSource: string = agentSource.slice(resizeStart, resizeEnd);

		expect(resizeStart).toBeGreaterThan(-1);
		expect(resizeEnd).toBeGreaterThan(resizeStart);
		expect(resizeSource).toContain("normalizedSize < REVIEW_PANEL_CLOSE_THRESHOLD");
		expect(resizeSource).toContain("closeReviewPanel();");
	});

	it("adds a fixed layout-right top menu button for opening the review sidebar", () => {
		expect(agentSource).toContain("const showReviewButton: boolean = !isHome && activeWorkspace !== null;");
		expect(agentSource).toContain("className={styles.floatingActionSlot}");
		expect(agentSource).toContain("className={styles.floatingActions}");
		expect(agentSource).not.toContain("Affix");
		expect(agentSource).toContain("icon={<Icon name=\"layout-right\" />}");
		expect(agentSource).toContain("onClick={toggleReviewPanel}");
		expect(agentSource).toContain("aria-pressed={reviewPanelOpen}");
	});

	it("renders workspace launch, summary and review actions in the shared floating slot", () => {
		expect(agentSource).toContain("showWorkspaceLaunchControls || showSummaryButton || showReviewButton");
		expect(agentSource).toContain("{showWorkspaceLaunchControls ? (");
		expect(agentSource).toContain("className={styles.workspaceLaunchControls}");
		expect(agentSource).toContain("{showSummaryButton ? renderSummaryButton() : null}");
		expect(agentSource).not.toContain("styles.topMenuBar");
	});

	it("keeps close ownership on the fixed layout-right button", () => {
		expect(reviewPanelSource).not.toContain("Close review panel");
		expect(reviewPanelSource).not.toContain("onClose");
	});

	it("resets stale review state when the active session or workspace changes", () => {
		expect(agentSource).toContain("setReviewPanelOpen(false);");
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
	});
});
