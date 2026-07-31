import type { SaveSessionUiMetadataParams } from "@/api/session-api";
import type { WorkbenchPatch } from "@/api/types";

export type ComposerReasoningEffortUpdate = {
	workbenchPatch: WorkbenchPatch;
	sessionMetadata: SaveSessionUiMetadataParams;
};

export function createComposerReasoningEffortUpdate(
	providerId: string | null,
	modelId: string | null,
	reasoningEffort: string
): ComposerReasoningEffortUpdate {
	const composer: NonNullable<WorkbenchPatch["composer"]> = { reasoningEffort };
	const sessionMetadata: SaveSessionUiMetadataParams = { reasoningEffort };
	if (providerId !== null && modelId !== null) {
		composer.provider = providerId;
		composer.model = modelId;
	}
	return {
		workbenchPatch: { composer },
		sessionMetadata
	};
}
