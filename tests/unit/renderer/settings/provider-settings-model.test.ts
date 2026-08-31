import { describe, expect, it } from "vitest";
import {
	createAddModelFormValues,
	createCapabilityFormValues,
	getCustomizationErrorMessage,
	getVisibleCapabilities,
	toCustomModelCapabilities,
	toEditableCapabilities,
} from "@/domain/settings/provider-settings-model";

describe("provider settings model", () => {
	it("creates an explicit default model form", () => {
		const values = createAddModelFormValues();

		expect(values.id).toBe("");
		expect(values.contextWindowTokens).toBe(128_000);
		expect(values.capabilities.imageInput).toBe("disabled");
	});

	it("maps inherited and custom capability values to RPC payloads", () => {
		const values = createCapabilityFormValues(null, true);

		expect(toEditableCapabilities(values, true).imageInput).toBeNull();
		expect(toCustomModelCapabilities(values).imageInput).toBe(false);

		values.imageInput = "enabled";
		expect(toEditableCapabilities(values, true).imageInput).toBe(true);
		expect(toCustomModelCapabilities(values).imageInput).toBe(true);
	});

	it("keeps capability visibility and stable error mapping in the model layer", () => {
		const visible = getVisibleCapabilities({ imageInput: true, tools: true } as never);
		expect(visible.map((capability) => capability.key)).toEqual(["imageInput", "tools"]);
		expect(
			getCustomizationErrorMessage(
				new Error("provider_model_exists:gpt-e2e"),
				"settings.provider.errors.saveModel",
				(key) => key,
			),
		).toBe("settings.provider.errors.modelIdConflict");
	});
});
