import { describe, expect, it } from "vitest";
import { createComposerReasoningEffortUpdate } from "@/domain/composer/composer-reasoning-effort";

describe("composer reasoning effort update", () => {
	it("updates effort without replaying a potentially stale model selection", () => {
		expect(createComposerReasoningEffortUpdate("high")).toEqual({
			workbenchPatch: {
				composer: {
					reasoningEffort: "high"
				}
			},
			sessionMetadata: {
				reasoningEffort: "high"
			}
		});
	});

	it("supports another effort value", () => {
		expect(createComposerReasoningEffortUpdate("medium")).toEqual({
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
