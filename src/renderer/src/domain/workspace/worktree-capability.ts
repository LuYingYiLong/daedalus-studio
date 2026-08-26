import type { WorkspaceConfig } from "@/platform/rpc/types";

export function workspaceSupportsWorktrees(
	workspace: WorkspaceConfig | null | undefined,
): boolean {
	return (
		workspace !== null &&
		workspace !== undefined &&
		workspace.sourceFolders.length > 0 &&
		workspace.sourceFolders.every(
			(sourceFolder): boolean => sourceFolder.capabilities.git === true,
		)
	);
}
