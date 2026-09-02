import type { SaveSessionUiMetadataParams } from "@/platform/rpc/session-api";
import type { WorkbenchPatch } from "@/platform/rpc/types";

export type ComposerReasoningEffortUpdate = {
	workbenchPatch: WorkbenchPatch;
	sessionMetadata: SaveSessionUiMetadataParams;
};

export function createComposerReasoningEffortUpdate(
	reasoningEffort: string
): ComposerReasoningEffortUpdate {
	const composer: NonNullable<WorkbenchPatch["composer"]> = { reasoningEffort };
	const sessionMetadata: SaveSessionUiMetadataParams = { reasoningEffort };
	return {
		workbenchPatch: { composer },
		sessionMetadata
	};
}
