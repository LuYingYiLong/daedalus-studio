import { readFileSync } from "node:fs";
import { join } from "node:path";

export function repoPath(...segments: string[]): string {
	return join(process.cwd(), ...segments);
}

export function readRepoFile(...segments: string[]): string {
	return readFileSync(repoPath(...segments), "utf8");
}

export function readAppImplementation(): string {
	const files: string[][] = [
		["src", "renderer", "src", "app", "App.tsx"],
		["src", "renderer", "src", "app", "app-helpers.ts"],
		["src", "renderer", "src", "app", "useAppController.tsx"],
		["src", "renderer", "src", "features", "approval", "controllers", "useApprovalController.ts"],
		["src", "renderer", "src", "features", "workspace", "controllers", "useWorkspaceContextController.ts"],
		["src", "renderer", "src", "features", "workspace", "controllers", "context-helpers.ts"],
		["src", "renderer", "src", "app", "hooks", "useAppEventBridge.ts"],
		["src", "renderer", "src", "features", "composer", "controllers", "usePlanGoalController.ts"],
		["src", "renderer", "src", "features", "composer", "controllers", "plan-helpers.ts"],
		["src", "renderer", "src", "features", "chat", "controllers", "useTimelineController.ts"],
		["src", "renderer", "src", "shared", "lib", "backend-event-state.ts"]
	];
	return files.map((filePath: string[]): string => readRepoFile(...filePath)).join("\n");
}
