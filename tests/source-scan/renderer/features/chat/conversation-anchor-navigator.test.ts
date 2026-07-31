import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ConversationAnchorNavigator source", () => {
	const navigatorSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "ConversationAnchorNavigator.tsx");
	const navigatorStyles: string = readRepoFile("src", "renderer", "src", "features", "chat", "ConversationAnchorNavigator.module.css");
	const homePageSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");
	const homePageStyles: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.module.css").replace(/\r\n/g, "\n");
	const messageListSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.tsx");

	it("uses Anchor and Tooltip for every indexed user turn", () => {
		expect(navigatorSource).toContain("<Anchor");
		expect(navigatorSource).toContain("<Tooltip");
		expect(navigatorSource).toContain("entries.map");
		expect(navigatorSource).toContain("getCurrentAnchor");
	});

	it("keeps the navigator floating, compact, and scrollable without a visible scrollbar", () => {
		expect(navigatorStyles).toContain("position: absolute");
		expect(navigatorStyles).toContain("max-height: 80%");
		expect(navigatorStyles).toContain("scrollbar-width: none");
		expect(navigatorStyles).toContain(":global(.ant-anchor)::before");
		expect(navigatorStyles).toContain("height: 4px !important");
		expect(navigatorStyles).toContain("tickHovered");
		expect(navigatorStyles).toContain("tickNeighborOne");
	});

	it("connects viewport detection and unloaded turn navigation through HomePage", () => {
		expect(messageListSource).toContain("scrollToEntry");
		expect(messageListSource).toContain("onActiveUserEntryChange");
		expect(homePageSource).toContain("ConversationAnchorNavigator");
		expect(homePageSource).toContain("onTimelineNavigationLoadEntry");
		expect(homePageStyles).toMatch(/\.chatBody\s*\{[\s\S]*?position:\s*relative;[\s\S]*?display:\s*grid;/u);
	});
});
