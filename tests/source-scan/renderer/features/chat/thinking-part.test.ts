import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ThinkingPart source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ThinkingPart.tsx");

	it("animates the active thinking label without affecting completed thinking parts", () => {
		expect(source).toContain('import ShinyText from "@/ui/ShinyText";');
		expect(source).toContain('t("chat.thinking.activeLabel")');
		expect(source).toContain('<ShinyText text={t("chat.thinking.activeLabel")} speed={2.4} />');
		expect(source).toContain('? t("chat.thinking.label")');
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
