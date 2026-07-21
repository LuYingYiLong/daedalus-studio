import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("App plan clarification source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");

	it("updates local clarification and approval state from plan.clarify results", () => {
		expect(source).toContain("const result: PlanResult = await submitPlanClarification");
		expect(source).toContain("result.status === \"clarification_required\"");
		expect(source).toContain("setLatestPlanClarification(nextClarification)");
		expect(source).toContain("setLatestPlanApproval(getPlanApprovalFromResult(result))");
	});

	it("suppresses the active clarification before waiting for the backend reply", () => {
		const suppressIndex: number = source.indexOf("setSuppressedPlanClarificationKey(currentClarificationKey)");
		const submitIndex: number = source.indexOf("await submitPlanClarification");

		expect(suppressIndex).toBeGreaterThan(0);
		expect(submitIndex).toBeGreaterThan(0);
		expect(suppressIndex).toBeLessThan(submitIndex);
		expect(source).toContain("setSessionError(errorMessage)");
	});

	it("marks plan clarification and revision operations as cancellable active runs", () => {
		expect(source).toContain("requestId: requestId.length > 0 ? requestId : planId");
		expect(source).toContain("const runRequestId: string = clarification.requestId;");
		expect(source).toContain("activeChatRequestIdRef.current = runRequestId;");
		expect(source).toContain("applyOptimisticActiveRun(runRequestId, false, false);");
		expect(source).toContain("finishOptimisticActiveRun(runRequestId);");
		expect(source).toContain("const runRequestId: string = latestPlanApproval.requestId;");
	});

	it("clears stale plan clarification state when a plan operation fails", () => {
		expect(source).toContain("function shouldClearPlanClarificationForEvent");
		expect(source).toContain("event.event === \"plan.error\"");
		expect(source).toContain("event.event === \"agent.run.error\"");
		expect(source).toContain("shouldClearPlanClarificationForEvent(event, currentClarification) ? null : currentClarification");
	});

	it("does not append duplicate frontend timeline errors for backend RPC failures", () => {
		expect(source).toContain("function isBackendRpcErrorMessage");
		expect(source).toContain("sessionCreated && !isBackendRpcErrorMessage(errorMessage)");
		expect(source).toContain("if (!isBackendRpcErrorMessage(errorMessage))");
	});

	it("adopts the backend agent-mode workbench before executing an approved plan", () => {
		expect(source).toContain("const result = await approvePlan(planId)");
		expect(source).toContain("setWorkbench(result.workbench)");
		expect(source).toContain("chatMode: result.chatMode");
		expect(source.indexOf("setWorkbench(result.workbench)")).toBeLessThan(source.indexOf("applyOptimisticSend(result.executionRequestId"));
	});
});
