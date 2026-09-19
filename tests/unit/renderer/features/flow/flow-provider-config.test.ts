import { describe, expect, it } from "vitest";
import { applyFlowProviderSelection } from "@/widgets/flow/FlowNodes";

describe("Flow provider config", (): void => {
	it("keeps reasoning effort only for node schemas that declare it", (): void => {
		expect(
			applyFlowProviderSelection(
				{ prompt: "draw a lighthouse", reasoningEffort: "high" },
				"dashscope",
				"qwen-image-plus",
				"medium",
				false,
			),
		).toEqual({ prompt: "draw a lighthouse", provider: "dashscope", model: "qwen-image-plus" });
		expect(
			applyFlowProviderSelection(
				{ systemPrompt: "Be concise" },
				"openai",
				"gpt-5.4",
				"medium",
				true,
			),
		).toEqual({
			systemPrompt: "Be concise",
			provider: "openai",
			model: "gpt-5.4",
			reasoningEffort: "medium",
		});
	});
});
