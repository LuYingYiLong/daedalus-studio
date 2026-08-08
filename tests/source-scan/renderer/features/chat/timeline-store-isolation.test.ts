import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../../helpers/repo-paths";

describe("timeline rendering isolation", () => {
	const appSource: string = readAppImplementation();
	const streamBufferSource: string = readRepoFile("src", "renderer", "src", "app", "runtime", "hooks", "useTimelineStreamBuffer.ts");
	const paneSource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ConversationTimelinePane.tsx");
	const toolPartSource: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ToolPart.tsx");

	it("keeps timeline bodies out of App React state", () => {
		expect(appSource).toContain("createTimelinePageStore()");
		expect(appSource).toContain("timelineStore,");
		expect(appSource).not.toContain("useState<TimelinePageState>");
		expect(streamBufferSource).toContain("timelineStore.applyEvents(events)");
		expect(paneSource).toContain("useTimelinePage(timelineStore)");
	});

	it("lazily creates and destroys tool details", () => {
		expect(toolPartSource).toContain("activeKey={open ? [\"tool\"] : []}");
		expect(toolPartSource).toContain("function getToolResultText");
		expect(toolPartSource).not.toContain("JSON.stringify(part.events");
		expect(toolPartSource).toContain("destroyOnHidden={true}");
	});
});
