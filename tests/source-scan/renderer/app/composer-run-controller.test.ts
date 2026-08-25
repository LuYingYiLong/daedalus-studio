import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Composer run controller source", () => {
	it("keeps retry and cancel operations behind one runtime boundary", () => {
		const source: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"app",
			"runtime",
			"hooks",
			"useComposerRunController.ts",
		);

		expect(source).toContain("async function handleRetryFromUserMessage(");
		expect(source).toContain("async function handleInterruptedRunRetry(");
		expect(source).toContain("async function handleComposerCancel(");
		expect(source).toContain("await retryAgentRun(runId);");
		expect(source).toContain("await cancelChatMessage(cancellationRequestId);");
	});

	it("keeps cancellation response handling and failure restoration explicit", () => {
		const source: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"app",
			"runtime",
			"hooks",
			"useComposerRunController.ts",
		);

		expect(source).toContain("result.cancelled ||");
		expect(source).toContain("result.alreadyFinished ||");
		expect(source).toContain("finishOptimisticActiveRun(cancellationRequestId);");
		expect(source).toContain("currentState.requestId === cancellationRequestId");
		expect(source).toContain("cancelledChatRequestIdsRef.current.delete(cancellationRequestId);");
	});
});
