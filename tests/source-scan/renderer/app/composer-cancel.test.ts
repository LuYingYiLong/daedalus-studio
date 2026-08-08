import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../helpers/repo-paths";

describe("Composer cancellation source", () => {
	it("can cancel while a new session is being created and blocks the pending chat RPC", () => {
		const appSource: string = readAppImplementation();
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");

		expect(appSource).toContain("const requestId: string | null = getRunControllerRequestId(runState);");
		expect(appSource).toContain("const cancellationRequestId: string | null = requestId ?? activeChatRequestIdRef.current;");
		expect(appSource).toContain("cancelledChatRequestIdsRef.current.add(cancellationRequestId);");
		expect(appSource).toContain("cancelledChatRequestIdsRef.current.has(cancellationRequestId)");
		expect(appSource).toContain("!result.alreadyFinished");
		expect(appSource).toContain("if (result.alreadyFinished === true && !wasCreatingSession)");
		expect(appSource).toContain("finishOptimisticActiveRun(cancellationRequestId);");
		expect(appSource).toContain("if (cancelledChatRequestIdsRef.current.delete(requestId))");
		expect(appSource.indexOf("if (cancelledChatRequestIdsRef.current.delete(requestId))"))
			.toBeLessThan(appSource.indexOf("await sendChatMessage({", appSource.indexOf("async function handleHomeComposerSubmit")));
		expect(appSource).toContain('status: "cancelling"');
		expect(appSource).toContain("const composerIsCancelling: boolean = runState.status === \"cancelling\";");
		expect(composerSource).toContain("isCancelling?: boolean;");
		expect(composerSource).toContain("disabled={isCancelling ||");
	});
});
