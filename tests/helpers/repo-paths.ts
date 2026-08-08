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
		["src", "renderer", "src", "app", "hooks", "useAppApprovalController.ts"],
		["src", "renderer", "src", "app", "hooks", "useAppContextController.ts"],
		["src", "renderer", "src", "app", "hooks", "useAppEventBridge.ts"],
		["src", "renderer", "src", "app", "hooks", "useAppPlanGoalController.ts"],
		["src", "renderer", "src", "app", "hooks", "useAppTimelineController.ts"]
	];
	return files.map((filePath: string[]): string => readRepoFile(...filePath)).join("\n");
}
