import { readFileSync } from "node:fs";
import { join } from "node:path";

export function repoPath(...segments: string[]): string {
	return join(process.cwd(), ...segments);
}

export function readRepoFile(...segments: string[]): string {
	return readFileSync(repoPath(...segments), "utf8").replace(/\r\n?/gu, "\n");
}

export function readAppImplementation(): string {
	const files: string[][] = [
		["src", "renderer", "src", "app", "shell", "App.tsx"],
		["src", "renderer", "src", "app", "runtime", "app-helpers.ts"],
		["src", "renderer", "src", "app", "runtime", "useAppController.tsx"],
		["src", "renderer", "src", "features", "approval", "controllers", "useApprovalController.ts"],
		["src", "renderer", "src", "features", "workspace", "controllers", "useWorkspaceContextController.ts"],
		["src", "renderer", "src", "features", "workspace", "controllers", "context-helpers.ts"],
		["src", "renderer", "src", "app", "runtime", "hooks", "useAppEventBridge.ts"],
		["src", "renderer", "src", "features", "composer", "controllers", "usePlanGoalController.ts"],
		["src", "renderer", "src", "features", "composer", "controllers", "plan-helpers.ts"],
		["src", "renderer", "src", "features", "conversation", "controllers", "useTimelineController.ts"],
		["src", "renderer", "src", "domain", "run", "backend-event-state.ts"]
	];
	return files.map((filePath: string[]): string => readRepoFile(...filePath)).join("\n");
}
