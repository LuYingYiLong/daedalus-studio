import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("MessageList virtual history window source", () => {
	const messageListSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.tsx");
	const messageListStyles: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.module.css");

	it("uses Virtuoso dynamic-height virtualization with stable absolute indexes", () => {
		expect(messageListSource).toContain('from "react-virtuoso"');
		expect(messageListSource).toContain("<Virtuoso<RenderableTimelineBlock>");
		expect(messageListSource).toContain("firstItemIndex={blockOffset}");
		expect(messageListSource).toContain("computeItemKey=");
		expect(messageListSource).toContain("item.block.id");
		expect(messageListSource).toContain("increaseViewportBy={increaseViewportBy}");
		expect(messageListStyles).not.toContain(".spacer");
	});

	it("mounts the virtual list with data and uses one initial bottom-position owner", () => {
		expect(messageListSource).toContain("{isInitialLoading ? (");
		expect(messageListSource).toContain('initialTopMostItemIndex={{ index: Math.max(0, items.length - 1), align: "end" }}');
		expect(messageListSource).toContain("initialSettleStartedRef.current");
		expect(messageListSource).not.toContain("heightEstimates=");
		expect(messageListSource).not.toContain("initialScrollToBottomKey");
	});

	it("uses Virtuoso reach callbacks and temporarily mounts the loaded window for selection and retry editing", () => {
		expect(messageListSource).toContain("startReached=");
		expect(messageListSource).toContain("endReached=");
		expect(messageListSource).toContain("activeRetryRequestId !== null");
		expect(messageListSource).toContain("FULL_WINDOW_VIEWPORT_EXPANSION");
	});
});
