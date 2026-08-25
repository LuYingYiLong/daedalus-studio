import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../../helpers/repo-paths";

describe("Run state source", () => {
	it("centralizes Composer run controls through run-state helpers", () => {
		const appSource: string = [
			readAppImplementation(),
			readRepoFile("src", "renderer", "src", "app", "runtime", "hooks", "useComposerRunController.ts"),
		].join("\n");
		const backendEventStreamSource: string = readRepoFile("src", "renderer", "src", "app", "runtime", "hooks", "useBackendEventStream.ts");
		const runStateSource: string = readRepoFile("src", "renderer", "src", "domain", "workbench", "run-state.ts");

		expect(appSource).toContain("useState<RunControllerState>(() => createIdleRunState())");
		expect(backendEventStreamSource).toContain("applyRunStateFromBackendEvent(");
		expect(backendEventStreamSource).toContain("params.cancelledChatRequestIdsRef.current");
		expect(appSource).toContain("applyRunStateFromWorkbench(");
		expect(appSource).toContain("cancelledChatRequestIdsRef.current");
		expect(appSource).toContain("const composerIsSending: boolean = isRunControllerActive(runState) || isHomeSubmitting;");
		expect(appSource).toContain("const requestId: string | null = getRunControllerRequestId(runState);");
		expect(appSource).not.toContain("function getIsSending(");
		expect(appSource).not.toContain("function getActiveRunRequestId(");
		expect(runStateSource).toContain('event.event === "agent.run.state"');
		expect(runStateSource).toContain('event.event !== "agent.run.cancelled"');
		expect(runStateSource).toContain("sequence < current.sequence");
		expect(runStateSource).toContain("workbenchSequence <= current.workbenchSequence");
		expect(runStateSource).toContain("run.revision <= current.agentRun.revision");
		expect(runStateSource).toContain('run.stage === "awaiting_approval" || run.stage === "awaiting_tool_budget"');
		expect(runStateSource).toContain('run.stage === "interrupted" || TERMINAL_RUN_STAGES.has(run.stage)');
	});
});
