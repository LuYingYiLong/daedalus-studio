import { describe, expect, it } from "vitest";
import { createComposerReasoningEffortUpdate } from "@/features/composer/composer-reasoning-effort";

describe("composer reasoning effort update", () => {
	it("keeps the selected provider and model bound to the effort change", () => {
		expect(createComposerReasoningEffortUpdate(
			"deepseek",
			"deepseek-v4-pro",
			"high"
		)).toEqual({
			workbenchPatch: {
				composer: {
					provider: "deepseek",
					model: "deepseek-v4-pro",
					reasoningEffort: "high"
				}
			},
			sessionMetadata: {
				reasoningEffort: "high"
			}
		});
	});

	it("still supports an effort-only update before a model is available", () => {
		expect(createComposerReasoningEffortUpdate(null, null, "medium")).toEqual({
			workbenchPatch: {
				composer: {
					reasoningEffort: "medium"
				}
			},
			sessionMetadata: {
				reasoningEffort: "medium"
			}
		});
	});
});
