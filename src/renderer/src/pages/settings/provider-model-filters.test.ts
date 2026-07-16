import { describe, expect, it } from "vitest";
import type { ProviderModelInfo } from "@/api/provider-api";
import { isImageTaskModel } from "./provider-model-filters";

function createModel(capabilities: ProviderModelInfo["capabilities"]): ProviderModelInfo {
	return {
		id: "test-model",
		displayName: "Test model",
		provider: "test-provider",
		endpointType: "openai-chat-completions",
		contextWindowTokens: 128000,
		maxOutputTokens: 8192,
		capabilities
	};
}

describe("isImageTaskModel", () => {
	it("accepts text-to-image and image-to-image models", () => {
		expect(isImageTaskModel(createModel({ imageGeneration: true }))).toBe(true);
		expect(isImageTaskModel(createModel({ imageEdit: true }))).toBe(true);
		expect(isImageTaskModel(createModel({ imageGeneration: true, imageEdit: true }))).toBe(true);
	});

	it("rejects non-image task models", () => {
		expect(isImageTaskModel(createModel({ vision: true }))).toBe(false);
		expect(isImageTaskModel(createModel({}))).toBe(false);
	});
});
