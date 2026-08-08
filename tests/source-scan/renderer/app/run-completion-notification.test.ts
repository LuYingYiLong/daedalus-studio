import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../helpers/repo-paths";

describe("run completion notification wiring", () => {
	it("checks the active message queue before showing a completed notification", () => {
	const appSource: string = readAppImplementation();
		const streamSource: string = readRepoFile("src", "renderer", "src", "app", "runtime", "hooks", "useBackendEventStream.ts");

		expect(appSource).toContain("const activeWorkbenchRef = useLatest(workbench);");
		expect(appSource).toContain("activeWorkbenchRef,");
		expect(streamSource).toContain("hasQueuedFollowUpResponse");
		expect(streamSource).toContain("&& !hasQueuedFollowUp");
		expect(streamSource).toContain('kind: "run_completed"');
	});
});
