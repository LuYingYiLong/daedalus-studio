import type { WorkspaceConfig, WorkspaceKind } from "@/platform/rpc/types";

export function createSingleSourceWorkspaceSnapshot(params: {
	id: string;
	name: string;
	rootPath: string;
	kind?: WorkspaceKind;
	godotExecutablePath?: string;
}): WorkspaceConfig {
	const primarySourceFolderId: string = "primary";
	const kind: WorkspaceKind = params.kind ?? "workspace";
	return {
		id: params.id,
		name: params.name,
		kind,
		rootPath: params.rootPath,
		icon: 0,
		color: 0,
		sourceFolders: [{
			id: primarySourceFolderId,
			path: params.rootPath,
			capabilities: { git: false, godot: kind === "godot" },
		}],
		primarySourceFolderId,
		godotExecutablePath: params.godotExecutablePath,
	};
}
