import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Composer send controller source", () => {
	it("keeps queue diversion and optimistic send ordering in one boundary", () => {
		const source: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"app",
			"runtime",
			"hooks",
			"useComposerSendController.ts",
		);
		const optimisticSend: number = source.indexOf(
			"applyOptimisticSend(",
		);
		const flushPendingPatch: number = source.indexOf(
			"await flushPendingPatch;",
		);
		const sendChat: number = source.indexOf("await sendChatMessage({");

		expect(source).toContain("if (isRunControllerActive(runState))");
		expect(source).toContain("await handleQueueMessageSubmit(");
		expect(source).toContain("mergeWorkbenchPatch(");
		expect(optimisticSend).toBeGreaterThanOrEqual(0);
		expect(flushPendingPatch).toBeGreaterThan(optimisticSend);
		expect(sendChat).toBeGreaterThan(flushPendingPatch);
	});

	it("restores run state and records a frontend failure for non-RPC errors", () => {
		const source: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"app",
			"runtime",
			"hooks",
			"useComposerSendController.ts",
		);

		expect(source).toContain("finishOptimisticRunState(currentState, requestId)");
		expect(source).toContain("markRunStopped(current, requestId)");
		expect(source).toContain("createFrontendFailedRunEvent(");
		expect(source).toContain("if (!isBackendRpcErrorMessage(errorMessage))");
		expect(source).toContain("cancelledChatRequestIdsRef.current.delete(requestId);");
	});
});
