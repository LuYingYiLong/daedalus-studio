import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("MessageList virtual history window source", () => {
	const messageListSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.tsx");
	const messageListStyles: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.module.css");
	const assistantBubbleStyles: string = readRepoFile("src", "renderer", "src", "features", "chat", "AssistantBubble.module.css");
	const userBubbleStyles: string = readRepoFile("src", "renderer", "src", "features", "chat", "UserBubble.module.css");

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
		expect(messageListSource).toContain('initialTopMostItemIndex={{ index: "LAST", align: "end" }}');
		expect(messageListSource).toContain("initialBottomAnchorRef.current");
		expect(messageListSource).toContain("shouldFollowBottomRef.current");
		expect(messageListSource).toContain("totalListHeightChanged={handleTotalListHeightChanged}");
		expect(messageListSource).toContain("autoscrollToBottom()");
		expect(messageListSource).toContain("isNearBottomByMetrics(");
		expect(messageListSource).not.toContain("heightEstimates=");
		expect(messageListSource).not.toContain("initialScrollToBottomKey");
		expect(messageListSource).not.toContain("initialSettleStartedRef");
	});

	it("keeps short conversations bottom-aligned without conflicting layout containment", () => {
		expect(messageListSource).toContain("alignToBottom={true}");
		expect(messageListSource).toContain("className={styles.listEdgeSpacer}");
		expect(messageListStyles).not.toContain("padding: var(--agent-chat-side-padding, 8px) 0;");
		expect(assistantBubbleStyles).not.toContain("content-visibility");
		expect(userBubbleStyles).not.toContain("content-visibility");
	});

	it("does not confuse asynchronous row growth with deliberate user scrolling", () => {
		expect(messageListSource).toContain("initialBottomAnchorRef.current || shouldFollowBottomRef.current");
		expect(messageListSource).toContain("scheduleBottomFollow();");
		expect(messageListSource).toContain("userScrollAwayIntentRef.current");
		expect(messageListSource).toContain("nextScrollTop < lastScrollerTopRef.current - 1");
		expect(messageListSource).toContain("releaseBottomFollow();");
		expect(messageListSource).toContain("followOutput={(): \"auto\" | false => shouldFollowBottomRef.current ? \"auto\" : false}");
	});

	it("uses Virtuoso reach callbacks and temporarily mounts the loaded window for selection and retry editing", () => {
		expect(messageListSource).toContain("startReached=");
		expect(messageListSource).toContain("endReached=");
		expect(messageListSource).toContain("activeRetryRequestId !== null");
		expect(messageListSource).toContain("FULL_WINDOW_VIEWPORT_EXPANSION");
	});
});
