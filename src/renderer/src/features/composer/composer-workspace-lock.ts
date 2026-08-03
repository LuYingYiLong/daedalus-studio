import type { SessionMetadata } from "@/api/types";

export function isComposerWorkspaceSelectionLocked(
	activeSessionId: string | null,
	metadata: SessionMetadata | null
): boolean {
	if (activeSessionId === null) {
		return false;
	}
	return metadata?.temporary !== true || metadata.workspaceId !== undefined;
}
