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
});
