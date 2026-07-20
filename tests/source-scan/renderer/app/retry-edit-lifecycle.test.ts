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

	it("releases the composer send state from cancellation events and cancel responses", () => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const eventSubscription: number = source.indexOf("unsubscribe = client.addEventListener");
		const cancellationEvent: number = source.indexOf("if (isRunCancellationEvent(event))", eventSubscription);
		const eventFinish: number = source.indexOf("finishOptimisticActiveRun(cancelledRequestId);", cancellationEvent);
		const cancelHandler: number = source.indexOf("async function handleComposerCancel");
		const cancelResponse: number = source.indexOf("const result = await cancelChatMessage(requestId);", cancelHandler);
		const responseFinish: number = source.indexOf("finishOptimisticActiveRun(result.requestId);", cancelResponse);

		expect(eventSubscription).toBeGreaterThanOrEqual(0);
		expect(cancellationEvent).toBeGreaterThan(eventSubscription);
		expect(eventFinish).toBeGreaterThan(cancellationEvent);
		expect(cancelHandler).toBeGreaterThanOrEqual(0);
		expect(cancelResponse).toBeGreaterThan(cancelHandler);
		expect(responseFinish).toBeGreaterThan(cancelResponse);
	});
});
