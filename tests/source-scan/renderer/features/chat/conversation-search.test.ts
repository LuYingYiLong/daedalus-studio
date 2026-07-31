import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("conversation search source", () => {
	const viteConfig: string = readRepoFile("electron.vite.config.ts");
	const homePage: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");
	const homeStyles: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.module.css");
	const panel: string = readRepoFile("src", "renderer", "src", "features", "chat", "ConversationSearchPanel.tsx");
	const panelStyles: string = readRepoFile("src", "renderer", "src", "features", "chat", "ConversationSearchPanel.module.css");
	const userBubble: string = readRepoFile("src", "renderer", "src", "features", "chat", "UserBubble.tsx");
	const assistantBubble: string = readRepoFile("src", "renderer", "src", "features", "chat", "AssistantBubble.tsx");
	const thinkingPart: string = readRepoFile("src", "renderer", "src", "features", "chat", "ThinkingPart.tsx");
	const toolPart: string = readRepoFile("src", "renderer", "src", "features", "chat", "ToolPart.tsx");

	it("binds conversation-local Ctrl/Cmd+F, Escape, and cyclic navigation controls", () => {
		expect(homePage).toContain('event.key.toLowerCase() === "f"');
		expect(homePage).toContain("event.ctrlKey || event.metaKey");
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
			"features",
			"chat",
			"conversation-search-highlight.ts"
		);
		expect(highlight).toContain("h5,h6,li,td,th,pre");
		expect(highlight).toContain("owningSearchBlock !== root");
	});

	it("bundles the Markdown parser with the worker-safe entity decoder", () => {
		expect(viteConfig).toContain('find: /^decode-named-character-reference$/');
		expect(viteConfig).toContain('"node_modules/decode-named-character-reference/index.js"');
	});
});
