import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("retry edit lifecycle", () => {
	it("closes the retry editor before waiting for the retried LLM response", () => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const retryStart: number = source.indexOf("async function handleRetryFromUserMessage");
		const optimisticRetry: number = source.indexOf("applyOptimisticRetry(payload.requestId, requestId, message, payload.additionalContext);", retryStart);
		const closeEditor: number = source.indexOf("setActiveRetryRequestId(null);", optimisticRetry);
		const sendRetry: number = source.indexOf("await sendChatMessage({", optimisticRetry);

		expect(retryStart).toBeGreaterThanOrEqual(0);
		expect(optimisticRetry).toBeGreaterThan(retryStart);
		expect(closeEditor).toBeGreaterThan(optimisticRetry);
		expect(sendRetry).toBeGreaterThan(closeEditor);
	});

	it("releases the composer send state from run-state events", () => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const eventSubscription: number = source.indexOf("unsubscribe = client.addEventListener");
		const cancellationEvent: number = source.indexOf("if (isRunCancellationEvent(event))", eventSubscription);
		const runStateReducer: number = source.indexOf("applyRunStateFromBackendEvent(currentState, event)", eventSubscription);
		const cancelHandler: number = source.indexOf("async function handleComposerCancel");
		const requestFromRunState: number = source.indexOf("const requestId: string | null = getRunControllerRequestId(runState);", cancelHandler);

		expect(eventSubscription).toBeGreaterThanOrEqual(0);
		expect(runStateReducer).toBeGreaterThan(eventSubscription);
		expect(cancellationEvent).toBeGreaterThan(eventSubscription);
		expect(cancelHandler).toBeGreaterThanOrEqual(0);
		expect(requestFromRunState).toBeGreaterThan(cancelHandler);
		expect(source).not.toContain("finishOptimisticActiveRun(cancelledRequestId);");
		expect(source).not.toContain("finishOptimisticActiveRun(result.requestId);");
	});

	it("does not revive stale optimistic user messages after a retry timeline refresh", () => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");

		expect(source).toContain("function mergeOptimisticUserBlocks(currentPage: TimelinePageState, nextPage: TimelinePageState, activeOptimisticRequestId: string | null): TimelinePageState");
		expect(source).toContain("return activeOptimisticRequestId !== null");
		expect(source).toContain("&& block.requestId === activeOptimisticRequestId;");
		expect(source).toContain("const activeOptimisticRequestId: string | null = activeChatRequestIdRef.current ?? getRunControllerRequestId(runState);");
		expect(source).toContain("mergeOptimisticUserBlocks(currentPage, createTimelinePageFromTimelineResult(timeline), activeOptimisticRequestId)");
	});

	it("refreshes the real backend timeline after a retry failure instead of restoring a stale checkpoint", () => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const retryStart: number = source.indexOf("async function handleRetryFromUserMessage");
		const catchStart: number = source.indexOf("} catch (error: unknown) {", retryStart);
		const refreshOnFailure: number = source.indexOf("await refreshLatestTimeline().catch", catchStart);

		expect(catchStart).toBeGreaterThan(retryStart);
		expect(refreshOnFailure).toBeGreaterThan(catchStart);
		expect(source.slice(retryStart, source.indexOf("} finally {", catchStart))).not.toContain("setTimelinePage(previousTimelinePage)");
	});
});
