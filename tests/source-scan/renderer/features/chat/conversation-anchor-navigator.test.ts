import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ConversationAnchorNavigator source", () => {
	const navigatorSource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ConversationAnchorNavigator.tsx");
	const navigatorStyles: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ConversationAnchorNavigator.module.css");
	const homePageSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const timelinePaneSource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ConversationTimelinePane.tsx");
	const homePageStyles: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.module.css").replace(/\r\n/g, "\n");
	const messageListSource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "MessageList.tsx");
	const markdownSource: string = readRepoFile("src", "renderer", "src", "widgets", "markdown", "MarkdownContent.tsx");
	const selectionOverlaySource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "MessageSelectionOverlay.tsx");

	it("uses Anchor and Tooltip for every indexed user turn", () => {
		expect(navigatorSource).toContain("<Anchor");
		expect(navigatorSource).toContain("<Tooltip");
		expect(navigatorSource).toContain("entries.map");
		expect(navigatorSource).toContain("getCurrentAnchor");
		expect(navigatorSource).toContain("data-conversation-anchor-active");
		expect(navigatorSource).toContain("navigator.scrollTop");
		expect(navigatorSource).not.toContain("resolveViewportActiveEntryId");
		expect(navigatorSource).not.toContain("ResizeObserver");
		expect(navigatorSource).not.toContain("MutationObserver");
		expect(navigatorSource).not.toContain("scrollContainer");
		expect(timelinePaneSource).not.toContain("onActiveEntryChange");
	});

	it("keeps the navigator floating, compact, and scrollable without a visible scrollbar", () => {
		expect(navigatorStyles).toContain("position: absolute");
		expect(navigatorStyles).toContain("max-height: 80%");
		expect(navigatorStyles).toContain("scrollbar-width: none");
		expect(navigatorStyles).toContain(":global(.ant-anchor)::before");
		expect(navigatorStyles).toContain("height: 4px !important");
		expect(navigatorStyles).toContain("justify-content: flex-end");
		expect(navigatorStyles).toContain("tickHovered");
		expect(navigatorStyles).toContain("tickNeighborOne");
		expect(navigatorStyles).toMatch(/\.tickActive[\s\S]*?width:\s*var\(--navigator-tick-width\);/u);
	});

	it("uses MessageList as the sole viewport source and supports unloaded turn navigation", () => {
		expect(messageListSource).toContain("scrollToEntry");
		expect(messageListSource).toContain("index: blockOffset + index");
		expect(messageListSource).toContain("getActiveBlockOffset");
		expect(messageListSource).toContain("onActiveBlockOffsetChange");
		expect(messageListSource).toContain('querySelectorAll<HTMLElement>("[data-timeline-block-offset]")');
		expect(messageListSource).toContain("row.dataset.timelineBlockOffset");
		expect(messageListSource).toContain("document.elementFromPoint(viewportX, viewportY)");
		expect(messageListSource).toContain("lastReportedActiveBlockOffsetRef.current");
		expect(messageListSource).toContain("isScrolling={handleVirtuosoScrolling}");
		expect(messageListSource).toContain("TimelineScrollFrameProvider");
		expect(messageListSource).toContain("scrollFrameCoordinator.subscribe(\"active_block\"");
		expect(messageListSource).toContain("scrollFrameCoordinator.subscribe(\"bottom_state\"");
		expect(messageListSource.match(/addEventListener\("scroll"/gu)?.length).toBe(1);
		expect(messageListSource).not.toContain("onScrollCapture={handleScrollCapture}");
		expect(messageListSource).toContain("new ResizeObserver(scheduleTimelineScrollFrame)");
		expect(messageListSource).toContain("new MutationObserver((): void => {");
		expect(messageListSource).toContain("observeMountedRows");
		expect(messageListSource).toContain("Math.min(56, scroller.clientHeight * 0.2)");
		expect(messageListSource).toContain("top: 480, bottom: 720");
		expect(timelinePaneSource).toContain("resolveActiveTimelineEntryId");
		expect(timelinePaneSource).toContain("resolveAdjacentTimelineEntry");
		expect(messageListSource).not.toContain("lastActiveUserEntryIdRef");
		expect(homePageSource).toContain("ConversationTimelinePane");
		expect(timelinePaneSource).toContain("ConversationAnchorNavigator");
		expect(homePageSource).toContain("onTimelineNavigationLoadEntry");
		expect(homePageStyles).toMatch(/\.chatBody\s*\{[\s\S]*?position:\s*relative;[\s\S]*?display:\s*grid;/u);
	});

	it("shares the scroll frame with code headers and selection overlays", () => {
		expect(markdownSource).toContain("useTimelineScrollFrameCoordinator");
		expect(markdownSource).toContain("subscribe(\"sticky_code_header\"");
		expect(markdownSource).not.toContain("addEventListener(\"scroll\"");
		expect(selectionOverlaySource).toContain("subscribe(\"selection_overlay\"");
		expect(selectionOverlaySource).not.toContain("addEventListener(\"scroll\"");
		expect(selectionOverlaySource).toContain("if (container === null || !needsPositionUpdates)");
	});
});
