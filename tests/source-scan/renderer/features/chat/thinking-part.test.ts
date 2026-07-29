import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ThinkingPart source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "features", "chat", "ThinkingPart.tsx");

	it("animates the active thinking label without affecting completed thinking parts", () => {
		expect(source).toContain('t("chat.thinking.labelDotDotDot")');
		expect(source).toContain("window.setInterval");
		expect(source).toContain("window.clearInterval");
		expect(source).toContain('part.done ? t("chat.thinking.label") : activeThinkingLabels[labelIndex]');
	});

	it("follows the rendered markdown height without treating programmatic scrolling as user intent", () => {
		expect(source).toContain("new ResizeObserver");
		expect(source).toContain("resizeObserver.observe(bodyElement)");
		expect(source).toContain("scheduleAutoFollowScroll");
		expect(source).not.toContain("onScroll=");
		expect(source).toContain("event.deltaY < 0");
		expect(source).toContain("scheduleUserScrollStateSync");
	});
});
