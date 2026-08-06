import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Timeline activity group rendering", () => {
	it("renders backend-provided activity groups without reclassifying timeline events", () => {
		const assistantSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "AssistantBubble.tsx");
		const groupSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "TimelineActivityGroup.tsx");

		expect(assistantSource).toContain("groupTimelineActivity");
		expect(assistantSource).toContain('renderActivitySegments(foldedParts, "summary-before", false)');
		expect(assistantSource).toContain('renderActivitySegments(visibleParts, "summary-after", true)');
		expect(groupSource).toContain("destroyOnHidden={false}");
		expect(groupSource).toContain('name="arrow-down"');
		expect(groupSource).toContain('import ShinyText from "@/components/ShinyText";');
		expect(groupSource).toContain("group.active ? (");
		expect(groupSource).toContain("getSummaryLabel");
	});

	it("keeps the activity summary driven by structured counts", () => {
		const groupSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "TimelineActivityGroup.tsx");
		const dataSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "timeline-activity-groups.ts");

		expect(groupSource).toContain('chat.activityGroup.summary.files');
		expect(groupSource).toContain('chat.activityGroup.summary.commands');
		expect(groupSource).toContain('chat.activityGroup.summary.thoughts');
		expect(dataSource).toContain("getTimelineActivityStats");
		expect(dataSource).toContain("activityGroupStats");
		expect(dataSource).toContain("activityGroupId");
		expect(dataSource).not.toContain("getFileEditBatch");
		expect(dataSource).not.toContain("JSON.stringify");
	});
});
