import type { WorkspaceSourceFolder } from "@/platform/rpc/types";

export function resolveGitReviewSourceFolderId(
	sourceFolders: WorkspaceSourceFolder[],
	requestedSourceFolderId: string | null | undefined,
	primarySourceFolderId: string | null | undefined
): string | null {
	if (requestedSourceFolderId !== null && requestedSourceFolderId !== undefined
		&& sourceFolders.some((sourceFolder: WorkspaceSourceFolder): boolean => sourceFolder.id === requestedSourceFolderId)) {
		return requestedSourceFolderId;
	}

	return sourceFolders.find((sourceFolder: WorkspaceSourceFolder): boolean => sourceFolder.capabilities.git)?.id
		?? sourceFolders.find((sourceFolder: WorkspaceSourceFolder): boolean => sourceFolder.id === primarySourceFolderId)?.id
		?? sourceFolders[0]?.id
		?? null;
}

export function getSourceFolderDisplayName(sourceFolder: WorkspaceSourceFolder): string {
	const normalizedPath: string = sourceFolder.path.replace(/[\\/]+$/u, "");
	return normalizedPath.split(/[\\/]/u).at(-1) || sourceFolder.id;
}

export function resolveGitReviewRequestSourceFolderId(
	sourceFolders: WorkspaceSourceFolder[],
	selectedSourceFolderId: string | null
): string | undefined {
	const isLegacySingleSourceSnapshot: boolean = sourceFolders.length === 1
		&& sourceFolders[0]?.id === "primary"
		&& selectedSourceFolderId === "primary";
	return isLegacySingleSourceSnapshot ? undefined : selectedSourceFolderId ?? undefined;
}
