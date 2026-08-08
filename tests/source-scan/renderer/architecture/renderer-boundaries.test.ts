import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoPath, readRepoFile } from "../../../helpers/repo-paths";

function collectSourceFiles(relativeRoot: string): string[] {
	const absoluteRoot: string = repoPath("src", "renderer", "src", relativeRoot);
	const files: string[] = [];
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory)) {
			const absolutePath: string = join(directory, entry);
			if (statSync(absolutePath).isDirectory()) {
				visit(absolutePath);
				continue;
			}
			if (/\.(?:ts|tsx)$/u.test(entry)) files.push(absolutePath);
		}
	};
	visit(absoluteRoot);
	return files;
}

function sourceOf(relativeRoot: string): string {
	return collectSourceFiles(relativeRoot).map((filePath: string): string => readFileSync(filePath, "utf8")).join("\n");
}

describe("renderer architecture boundaries", () => {
	it("keeps domain code independent from app and widgets", () => {
		const source: string = sourceOf("domain");
		expect(source).not.toMatch(/@\/app\//u);
		expect(source).not.toMatch(/@\/widgets\//u);
		expect(source).not.toMatch(/from ["']antd["']/u);
	});

	it("keeps the UI layer independent from product orchestration", () => {
		const source: string = sourceOf("ui");
		expect(source).not.toMatch(/@\/app\//u);
		expect(source).not.toMatch(/@\/features\//u);
		expect(source).not.toMatch(/@\/widgets\//u);
	});

	it("prevents use-case features from reaching into app or widget composition", () => {
		const source: string = sourceOf("features");
		expect(source).not.toMatch(/@\/app\//u);
		expect(source).not.toMatch(/@\/widgets\//u);
	});

	it("uses feature-owned controller entrypoints", () => {
		const appController: string = readRepoFile("src", "renderer", "src", "app", "runtime", "useAppController.tsx");
		expect(appController).toContain("@/features/approval/controllers/useApprovalController");
		expect(appController).toContain("@/features/workspace/controllers/useWorkspaceContextController");
		expect(appController).toContain("@/features/composer/controllers/usePlanGoalController");
		expect(appController).toContain("@/features/conversation/controllers/useTimelineController");
		expect(appController).not.toContain("./hooks/useAppApprovalController");
		expect(appController).not.toContain("./hooks/useAppContextController");
		expect(appController).not.toContain("./hooks/useAppPlanGoalController");
		expect(appController).not.toContain("./hooks/useAppTimelineController");
	});
});
