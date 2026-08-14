export type WorkspaceLaunchTargetId =
	| "file-explorer"
	| "terminal"
	| "vscode"
	| "visual-studio"
	| "github-desktop"
	| "git-bash"
	| "godot";

export const DEFAULT_WORKSPACE_LAUNCH_TARGET_ID: WorkspaceLaunchTargetId = "file-explorer";
