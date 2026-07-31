import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("timeline rendering isolation", () => {
	const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
	const streamBufferSource: string = readRepoFile("src", "renderer", "src", "app", "hooks", "useTimelineStreamBuffer.ts");
	const paneSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "ConversationTimelinePane.tsx");
	const toolPartSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "ToolPart.tsx");

	it("keeps timeline bodies out of App React state", () => {
		expect(appSource).toContain("createTimelinePageStore()");
		expect(appSource).toContain("timelineStore={timelineStore}");
		expect(appSource).not.toContain("useState<TimelinePageState>");
		expect(streamBufferSource).toContain("timelineStore.applyEvents(events)");
		expect(paneSource).toContain("useTimelinePage(timelineStore)");
	});

	it("lazily creates and destroys tool details", () => {
		expect(toolPartSource).toContain("open ? JSON.stringify(part.events, null, 2) :");
		expect(toolPartSource).toContain("destroyOnHidden={true}");
	});
});
