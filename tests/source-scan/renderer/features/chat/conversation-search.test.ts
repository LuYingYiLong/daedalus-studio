import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("conversation search source", () => {
	const viteConfig: string = readRepoFile("electron.vite.config.ts");
	const homePage: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const homeStyles: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.module.css");
	const panel: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ConversationSearchPanel.tsx");
	const panelStyles: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ConversationSearchPanel.module.css");
	const userBubble: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "UserBubble.tsx");
	const assistantBubble: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "AssistantBubble.tsx");
	const thinkingPart: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ThinkingPart.tsx");
	const toolPart: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ToolPart.tsx");
	const searchHook: string = readRepoFile("src", "renderer", "src", "features", "conversation", "useConversationSearch.ts");
	const messageList: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "MessageList.tsx");

	it("binds conversation find through the shared shortcut dispatcher and keeps local controls", () => {
		expect(homePage).toContain("findMatchingShortcutCommand");
		expect(homePage).toContain('"conversation.find"');
		expect(homePage).toContain("keyboardShortcuts");
		expect(homePage).toContain('event.key === "Escape"');
		expect(homePage).toContain("getSelectedConversationSearchQuery(chatBodyRef.current)");
		expect(homePage).toContain('[data-chat-search-text="true"]');
		expect(panel).toContain('event.key !== "Enter"');
		expect(panel).toContain("event.shiftKey");
		expect(panel).toContain('name="arrow-top"');
		expect(panel).toContain('name="arrow-bottom"');
		expect(panel).toContain('name="close"');
	});

	it("keeps the panel inside the chat stacking and clipping context", () => {
		expect(homeStyles).toMatch(/\.chatBody\s*\{[\s\S]*isolation:\s*isolate;/u);
		expect(homeStyles).toMatch(/\.chatHeader\s*\{[\s\S]*z-index:\s*3;/u);
		expect(panelStyles).toContain("position: absolute");
		expect(panelStyles).toContain("transform: translateY");
		expect(panelStyles).toContain("@media (prefers-reduced-motion: reduce)");
	});

	it("marks only user and assistant Markdown as searchable", () => {
		expect(userBubble).toContain('data-chat-search-text="true"');
		expect(assistantBubble).toContain('part.type === "markdown"');
		expect(assistantBubble).toContain('data-chat-search-text="true"');
		expect(thinkingPart).not.toContain("data-chat-search-text");
		expect(toolPart).not.toContain("data-chat-search-text");
	});

	it("keeps DOM highlight blocks aligned with Markdown list-item indexing", () => {
		const highlight: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"domain",
			"conversation",
			"conversation-search-highlight.ts"
		);
		expect(highlight).toContain("h5,h6,li,td,th,pre");
		expect(highlight).toContain("owningSearchBlock !== root");
	});

	it("bundles the Markdown parser with the worker-safe entity decoder", () => {
		expect(viteConfig).toContain('find: /^decode-named-character-reference$/');
		expect(viteConfig).toContain('"node_modules/decode-named-character-reference/index.js"');
	});

	it("loads persistent history progressively and cancels connection-bound searches", () => {
		expect(searchHook).toContain("startSessionTimelineSearch(sessionId)");
		expect(searchHook).toContain("fetchSessionTimelineSearchPage(page.searchId, nextOffset, 400)");
		expect(searchHook).toContain("cancelSessionTimelineSearch(searchId)");
		expect(searchHook).toContain("page.retryAfterMs ?? 150");
		expect(searchHook).toContain("MAX_REMOTE_SEARCH_RECOVERY_ATTEMPTS");
		expect(searchHook).toContain("isRecoverableRemoteSearchError(error)");
		expect(searchHook).toContain("onBackendReconnected");
		expect(searchHook).not.toContain('message.includes("session_search_not_found")');
	});

	it("does not let Virtuoso range changes drive a React update loop", () => {
		expect(messageList).not.toContain("setSearchRangeRevision");
		expect(messageList).toContain("applySearchHighlights(false)");
		expect(messageList).toContain("handleRangeChanged");
	});

	it("renders a distinct full-history indexing state instead of a false zero-result count", () => {
		expect(panel).toContain('import ShinyText from "@/ui/ShinyText"');
		expect(panel).toContain("indexingCompleteConversation");
		expect(panel).toContain('t("agentPage.conversationSearch.indexing")');
		expect(panel).toContain("styles.resultIndexing");
		expect(panelStyles).toContain(".resultIndexing");
	});
});
