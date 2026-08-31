import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { AdditionalContextItem } from "./types";
import { parseComputerOverlayPreview } from "../../../../contracts/computer-observation";

export type ChatMode = "ask" | "agent" | "plan" | "goal";
export type ExecutionPolicy = "auto" | "read_only";
export type ChatOutputTarget = "chat" | "workspace";

export type SendChatMessageParams = {
	requestId: string;
	message: string;
	mode: ChatMode;
	provider?: string | undefined;
	model?: string | undefined;
	reasoningEffort?: string | undefined;
	executionPolicy?: ExecutionPolicy | undefined;
	outputTarget?: ChatOutputTarget | undefined;
	retryFromRequestId?: string;
	additionalContext?: AdditionalContextItem[];
	skillRefs?: string[];
};

export type CancelChatMessageResult = {
	cancelled: boolean;
	cancellationRequested?: boolean;
	alreadyFinished?: boolean;
	requestId: string;
};

export type ToolBudgetDecisionResult = {
	budgetId: string;
	continued?: boolean;
	stopped?: boolean;
	cancelled?: boolean;
	requestId?: string;
	workbench?: unknown;
};

export type RetryAgentRunResult = {
	text?: string;
	context?: unknown;
};

export async function sendChatMessage(
	params: SendChatMessageParams,
): Promise<unknown> {
	const client = await createBackendClient();

	const result = await client.requestWithId(params.requestId, "ai.chat", {
		message: params.message,
		mode: params.mode,
		provider: params.provider,
		model: params.model,
		retryFromRequestId: params.retryFromRequestId,
		skillRefs: params.skillRefs,
		options: {
			stream: true,
			reasoningEffort: params.reasoningEffort,
			executionPolicy: params.executionPolicy ?? "auto",
			outputTarget: params.outputTarget ?? "chat",
		},
		additionalContext: params.additionalContext,
	});
	if (/^\/test-computer-overlay(?:\s|$)/iu.test(params.message.trim()) && result && typeof result === "object" && "computerOverlayPreview" in result) {
		const preview = parseComputerOverlayPreview(result.computerOverlayPreview);
		if (preview.requestId !== params.requestId) throw new Error("computer_invalid_request");
		const api = getPlatformRuntime().system?.computerObservation;
		if (!api?.previewOverlay) throw new Error("computer_preview_requires_windows_studio");
		await api.previewOverlay(preview);
	}
	return result;
}

export async function cancelChatMessage(
	requestId: string,
): Promise<CancelChatMessageResult> {
	const browser = getPlatformRuntime().system?.externalBrowser;
	if (browser) {
		const { active } = await browser.getState();
		if (active && (active.runId === requestId || active.requestId === requestId)) {
			await browser.stop(); const client = await createBackendClient();
			await client.request("browser.external.update", { sessionId: active.sessionId, runId: active.runId, generation: active.generation, state: "revoke" });
			return { cancelled: true, cancellationRequested: true, requestId };
		}
	}
  const computer = getPlatformRuntime().system?.computerObservation;
  if (computer) {
    const state = await computer.getState();
    if (state.control && (state.control.requestId === requestId || state.control.runId === requestId)) {
      const { connectionId, sessionId, requestId: turn, runId } = state.control;
      await computer.revoke();
      const client = await createBackendClient();
      // 不再调用可回退到下一活动轮次的通用 ai.cancel
      await client.request("computer.access.revoked", { connectionId, sessionId, requestId: turn, runId, code: "computer_cancelled" });
      await computer.acknowledgeControl({ connectionId, sessionId, requestId: turn, runId });
      return { cancelled: true, cancellationRequested: true, requestId };
    }
    if (state.sharing?.requestId === requestId) await computer.revoke();
  }
	const client = await createBackendClient();

	return client.request<CancelChatMessageResult>("ai.cancel", {
		requestId,
	});
}

export async function continueToolBudget(
	budgetId: string,
): Promise<ToolBudgetDecisionResult> {
	const client = await createBackendClient();

	return client.request<ToolBudgetDecisionResult>("ai.toolBudget.continue", {
		budgetId,
	});
}

export async function stopToolBudget(
	budgetId: string,
): Promise<ToolBudgetDecisionResult> {
	const client = await createBackendClient();

	return client.request<ToolBudgetDecisionResult>("ai.toolBudget.stop", {
		budgetId,
	});
}

export async function retryAgentRun(
	runId: string,
): Promise<RetryAgentRunResult> {
	const client = await createBackendClient();
	return client.request<RetryAgentRunResult>("agent.run.retry", { runId });
}
